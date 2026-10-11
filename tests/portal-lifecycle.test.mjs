import test from 'node:test';import assert from 'node:assert/strict';
import {lifecycleChange,performLifecycleChange,effectiveMember,lifecycleProtection} from '../portal-lifecycle-model.mjs';
const actor={uid:'admin',staffId:'boss',portalRole:'admin'},staff={id:'s',name:'架空'},users={a:{staffId:'s',role:'staff',active:true},b:{staffId:'s',role:'trainingAdmin',active:false}};
const args={actor,staff,users,current:null,expected:null,action:'stop',operationId:'op',timestamp:1};
test('one staff state stops all linked active accounts and preserves prior individual permissions on return',()=>{
 const stopped=lifecycleChange(args);assert.equal(effectiveMember(users.a,stopped).active,false);assert.equal(effectiveMember(users.b,stopped).active,false);assert.equal(users.a.active,true);
 const restored=lifecycleChange({...args,current:stopped,expected:stopped,action:'restore',operationId:'next'});assert.equal(effectiveMember(users.a,restored).active,true);assert.equal(effectiveMember(users.b,restored).active,false);
});
test('protect self, admin, terminal and unknown roles; unlinked roster can be stopped',()=>{
 assert.throws(()=>lifecycleChange({...args,actor:{...actor,staffId:'s'}}));for(const role of ['admin','terminal','service'])assert.match(lifecycleProtection(actor,staff,{a:{staffId:'s',role}}),/変更できません/);
 assert.equal(lifecycleChange({...args,users:{}}).state,'stopped');assert.throws(()=>lifecycleChange({...args,actor:{...actor,portalRole:'staff'}}));
});
test('idempotent retry, stale revision, invalid actions and read failure',async()=>{
 const current=lifecycleChange(args);assert.deepEqual(lifecycleChange({...args,current}),current);assert.throws(()=>lifecycleChange({...args,current,operationId:'other'}));assert.throws(()=>lifecycleChange({...args,action:'delete'}));
 let writes=0;await assert.rejects(performLifecycleChange({...args,readFresh:async()=>{throw Error('offline')},transact:async()=>writes++}));assert.equal(writes,0);
});
test('transaction retry aborts safely on changed record and retains operation identity after response loss',async()=>{
 const current=lifecycleChange(args);await assert.rejects(performLifecycleChange({...args,operationId:'other',readFresh:async()=>({users,roster:[staff]}),transact:async(id,fn)=>({committed:fn(current)!==undefined})}),/変更/);
 const result=await performLifecycleChange({...args,readFresh:async()=>({users,roster:[staff]}),transact:async(id,fn)=>({committed:true,value:fn(current)})});assert.deepEqual(result.value,current);
});
