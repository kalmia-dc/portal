import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenewalService} from '../onboarding-functions/contract-renewal.mjs';
import {termFields} from '../onboarding-functions/contract-terms.mjs';
import {draftEmployee,transition} from '../labor-model.mjs';
import {renewalUpdate} from '../labor-contract-renewal.mjs';

export function renewalFixture(){
  const staff='employee',reviewer={staffId:'hr',uid:'hr',reviewer:true},staffActor={staffId:staff,uid:'owner'};
  const worker=transition({...draftEmployee({id:staff,name:'架空 太郎'}),type:'full',role:'DH'},'confirm',{id:'employment',startDate:'2024-04-01'});
  worker.tasks['contract-renewal-review']={title:'契約更新未確認',status:'対応中',due:'2026-03-31'};
  const state={record:{data:worker,revision:1},uid:staffActor.uid,items:new Map()};
  const port={
    now:()=>Date.parse('2026-11-14T12:00:00+09:00'),
    employee:async id=>id===staff?{name:'架空 太郎',uid:state.uid,eligible:true,current:{startDate:'2024-04-01',type:'full'},
      get applied(){return null;}}:null,
    presets:async()=>[],
    renewals:async()=>[...state.items.entries()].map(([id,v])=>({id,...v.record})),
    metadata:async ({key})=>state.items.get(key)?.record,
    body:async ({key})=>state.items.get(key)?.body||{},
    write:async ({key},old,record,body)=>{
      assert.equal(state.items.get(key)?.record,old);
      state.items.set(key,{record,body});
    },
  };
  const employee=port.employee;
  port.employee=async (staff,uid,id)=>{
    const info=await employee(staff);
    return info&&{...info,applied:state.record.data.tasks?.['contract-renewal-applied-'+id]};
  };
  const service=createRenewalService(port,(code,message)=>{throw Object.assign(Error(message),{code});});
  return {reviewer,staffActor,staff,state,service};
}

test('renewal is tied to a specific signed PDF and applied before completion, with earlier versions retained',async()=>{
  const {reviewer,staffActor,staff,state,service}=renewalFixture();
  let sequence=0;
  const send=(actor,action,values={})=>service(actor,{mode:actor.reviewer?'review':'self',staff,id:'first',action,operation:String(++sequence),...values});
  const file={type:'application/pdf',data:Buffer.from('%PDF-1.7 fictional bytes').toString('base64')};
  const terms=Object.fromEntries(termFields.map(([key])=>[key,'架空条件']));
  const renewal={start:'2026-04-01',end:'2027-03-31',type:'part',days:'毎週火曜',hours:'週8時間'};
  const prepare={revision:0,contractVersion:'2026年4月版',files:[file],terms,renewal};
  await send(reviewer,'contract-prepare',prepare);
  assert.deepEqual((await send(staffActor,'list')).items,[]);
  await assert.rejects(send(staffActor,'detail'),{code:'permission-denied'});
  await send(reviewer,'contract-release',{revision:1,confirm:true});
  const signedPdf=await send(staffActor,'detail');
  await assert.rejects(send(staffActor,'contract-agree',{revision:2,sha256:'other',contractVersion:signedPdf.contract.version,agreed:[true,true]}),{code:'aborted'});
  await assert.rejects(send({...staffActor,uid:'wrong'},'detail'),{code:'permission-denied'});
  await assert.rejects(send(staffActor,'contract-agree',{revision:2,sha256:signedPdf.contract.sha256,contractVersion:signedPdf.contract.version,agreed:[true,false]}),{code:'invalid-argument'});
  await send(staffActor,'contract-agree',{revision:2,sha256:signedPdf.contract.sha256,contractVersion:signedPdf.contract.version,agreed:[true,true]});
  const signed=await send(reviewer,'detail');
  assert.equal(signed.consent.uid,staffActor.uid);
  assert.equal(signed.canApply,true);
  await assert.rejects(send(reviewer,'contract-accept',{revision:3}),{code:'failed-precondition'});
  assert.throws(()=>renewalUpdate(state.record.data,{...signed,id:'first'},'2026-03-31'),/更新開始日以降/);
  state.record.data=renewalUpdate(state.record.data,{...signed,id:'first'},'2026-11-14');
  assert.equal(state.record.data.tasks['contract-renewal-review'],undefined);
  assert.equal(state.record.data.periods.employment.contractEnd,'2027-03-31');
  assert.equal(state.record.data.periods.employment.startDate,'2024-04-01');
  assert.equal(state.record.data.type,'part');
  assert.equal(renewalUpdate(state.record.data,{...signed,id:'first'},'2026-11-14'),null);
  await send(reviewer,'contract-accept',{revision:3});
  await send(reviewer,'contract-prepare',{...prepare,id:'second'});
  assert.equal((await send(staffActor,'detail')).state,'accepted');
  assert.deepEqual((await send(staffActor,'detail')).files,[file]);
  assert.equal((await send(reviewer,'list')).items.length,2);
  state.uid='new-account';
  await assert.rejects(send({...staffActor,uid:'new-account'},'detail'),{code:'permission-denied'});
});
