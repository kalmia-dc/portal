import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,people} from './onboarding-fixture.mjs';
import {termFields,validateTerms,presetText} from '../onboarding-functions/contract-terms.mjs';
const pdf={type:'application/pdf',data:Buffer.from('%PDF-1.4\n fictional contract\n%%EOF').toString('base64')};
const req=(action,revision,extra={})=>({action,item:'contract',revision,operation:action+'-'+revision,mode:'review',staff:'doctor',period:'p1',...extra});
test('契約の準備、本人受付、版固定の同意、担当者確認',async()=>{
 const {service,records}=fixture();
 const call=(action,rev,extra={})=>service(people.hr,req(action,rev,extra));
 const self=(action,rev,extra={})=>service(people.doctor,req(action,rev,{...extra,mode:'self'}));
 assert.equal((await self('status')).items.contract.available,false);
 await assert.rejects(self('detail'),{code:'failed-precondition'});
 await assert.rejects(self('contract-prepare',0,{files:[pdf],contractVersion:'v1'}),{code:'permission-denied'});
 await call('contract-prepare',0,{files:[pdf],contractVersion:'v1'});
 assert.equal((await call('detail')).contract.version,'v1');
 await assert.rejects(self('contract-agree',1,{agreed:[true,true]}),{code:'failed-precondition'});
 await assert.rejects(call('contract-release',1,{confirm:false}),{code:'failed-precondition'});
 await call('contract-release',1,{confirm:true});
 const shown=await self('detail');
 assert.equal(shown.files[0].data,pdf.data);
 await assert.rejects(call('contract-prepare',2,{files:[pdf],contractVersion:'v2'}),{code:'failed-precondition'});
 const same={contractVersion:'v1',sha256:shown.contract.sha256,agreed:[true,true]};
 await assert.rejects(self('contract-agree',1,same),{code:'aborted'});
 await assert.rejects(self('contract-agree',2,{...same,sha256:'different'}),{code:'aborted'});
 await assert.rejects(self('contract-agree',2,{...same,agreed:[false,true]}),{code:'invalid-argument'});
 await self('contract-agree',2,same);
 await self('contract-agree',2,same); // Idempotent retry.
 const body=records.get('doctor/p1/contract').body;
 assert.equal(body.consent.uid,'doctor');assert.equal(body.consent.signerName,'架空 医師');
 assert.equal(body.consent.sha256,shown.contract.sha256);
 await call('contract-accept',3);
 assert.equal((await self('status')).items.contract.state,'accepted');
 await assert.rejects(service(people.hygienist,req('detail',0,{mode:'self'})),{code:'failed-precondition'});
 await assert.rejects(service(people.hygienist,req('detail',0)),{code:'permission-denied'});
 await assert.rejects(service({...people.doctor,uid:'other'},req('detail',0,{mode:'self'})),{code:'permission-denied'});
});
test('本人の既存保存API、担当者の汎用操作、偽PDFを拒否',async()=>{
 const {service}=fixture();
 for(const action of ['save','submit','accept','return','purge','require','exempt']) {
   await assert.rejects(service(people.hr,req(action,0)),{code:'permission-denied'});
 }
 await assert.rejects(service(people.hr,req('contract-prepare',0,{files:[{type:'application/pdf',data:Buffer.from('not a PDF at all').toString('base64')}],contractVersion:'v1'})),{code:'invalid-argument'});
});
test('条件の保存と未確定条件の交付防止、給与基準の権限',async()=>{
 const {service,config}=fixture();
 config.contractPresets=[{id:'fixture',rows:[]}];
 assert.equal((await service(people.doctor,{action:'status',mode:'self'})).contractPresets,undefined);
 assert.equal((await service(people.hr,req('status'))).contractPresets[0].id,'fixture');
 const terms=Object.fromEntries(termFields.map(([key])=>[key,'検証用条件']));
 assert.throws(()=>validateTerms({...terms,employee:''}));
 assert.throws(()=>validateTerms({...terms,employee:'a'.repeat(401)}));
 terms.raises='個別条件を入力してください';
 await service(people.hr,req('contract-prepare',0,{files:[pdf],contractVersion:'v1',terms}));
 assert.equal((await service(people.hr,req('detail'))).terms.raises,terms.raises);
 await assert.rejects(service(people.hr,req('contract-release',1,{confirm:true})),{code:'failed-precondition'});
 assert.match(presetText({kind:'hourlyCommission',insuranceRate:20,privateRate:20},{hourly:3500}).salary,/3,500円/);
 assert.match(presetText({kind:'monthly'},{parts:[['基本給',140000],['職務手当',50000],['職能手当',40000]]}).salary,/230,000円/);
});
