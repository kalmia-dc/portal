import test from 'node:test';
import assert from 'node:assert/strict';
import {addRosterEntry,performRosterAdd,rosterDraft} from '../portal-roster-model.mjs';
const actor={uid:'admin',portalRole:'admin'},draft={id:'staff_test',name:'架空 花子',role:'DR',type:'part',satFixed:true};
const defaults=[{id:'base',name:'既存',role:'DH'}];
test('new roster uses existing schema and preserves existing records, no login privilege or passwords',()=>{
  const current={old:{id:'old',name:'旧職員',role:'DA',type:'full',password:'legacy',other:1}};
  const next=addRosterEntry({actor,current,defaults,draft});
  assert.deepEqual(next.old,current.old);assert.deepEqual(next.staff_test,draft);
  assert.equal(next.staff_test.password,undefined);assert.equal(next.staff_test.active,undefined);
  for(const role of ['DR','DH','DA'])for(const type of ['full','part','spot'])assert.equal(rosterDraft({...draft,role,type}).type,type);
});
test('validation and admin gate reject bad drafts before writes',async()=>{
  for(const change of [{name:''},{name:'a'.repeat(61)},{role:'admin'},{type:'director'},{id:'bad/id'}])assert.throws(()=>rosterDraft({...draft,...change}));
  for(const actor of [null,{uid:'u',portalRole:'staff'},{uid:'u',portalRole:'trainingAdmin'}])await assert.rejects(performRosterAdd({actor,draft,confirm:()=>{throw Error('must not confirm')}}),/管理者/);
});
test('name matching blocks spacing/fullwidth duplicates across defaults and stored roster',()=>{
  for(const name of ['既存',' 既 存 ','既　存'])assert.throws(()=>addRosterEntry({actor,current:null,defaults,draft:{...draft,name}}),/登録済み/);
  assert.throws(()=>addRosterEntry({actor,current:{x:{name:'ＡＢＣ'}},defaults,draft:{...draft,name:'abc'}}),/登録済み/);
});
test('cancel and read/write failures preserve supplied draft; no false success',async()=>{
  let writes=0;const options={actor,draft,defaults,confirm:()=>false,transact:()=>{writes++;throw Error('PERMISSION_DENIED')}};
  assert.deepEqual(await performRosterAdd(options),{cancelled:true});assert.equal(writes,0);
  await assert.rejects(performRosterAdd({...options,confirm:()=>true}),/PERMISSION_DENIED/);
  await assert.rejects(performRosterAdd({...options,confirm:()=>true,transact:async()=>({committed:false})}),/保存されません/);
  assert.equal(draft.name,'架空 花子');
});
test('lost acknowledgement retry is idempotent; different tab/name cannot duplicate; callback retry preserves concurrent record',async()=>{
  let stored=null,loseAck=true;
  const options={actor,draft,defaults,confirm:()=>true,transact:async fn=>{
    fn(null);stored=fn(stored);if(loseAck){loseAck=false;throw Error('connection lost after commit')};return {committed:stored!==undefined};
  }};
  await assert.rejects(performRosterAdd(options),/connection lost/);
  await performRosterAdd(options);assert.equal(Object.keys(stored).length,1);
  assert.throws(()=>addRosterEntry({actor,current:stored,defaults,draft:{...draft,id:'second-tab'}}),/登録済み/);
  assert.throws(()=>addRosterEntry({actor,current:stored,defaults,draft:{...draft,name:'changed'}}),/変更/);
  const result=await performRosterAdd({...options,draft:{...draft,id:'second',name:'別人'},transact:async fn=>{
    fn(null);stored=fn({...stored,third:{id:'third',name:'同時追加',role:'DA',type:'spot'}});return {committed:true};
  }});
  assert.equal(result.staff.id,'second');assert.equal(stored.third.name,'同時追加');
});
