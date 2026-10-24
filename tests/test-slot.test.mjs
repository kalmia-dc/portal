import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {inspectTestSlot,changeTestSlot} from '../test-slot-model.mjs';
const actor={uid:'owner',staffId:'office',portalRole:'admin'};
const base=()=>({staff:{id:'test',name:'test'},config:{enabled:true,owners:{owner:true}},users:{},cards:{},state:null});
test('only an unprotected non-HR test slot is available to labor admin',()=>{
 assert.equal(inspectTestSlot({actor,...base()}).action,'stop');
 for(const patch of [{staff:{id:'real',name:'real'}},{state:{hrManaged:true}},{config:{enabled:true,owners:{}}},{config:{enabled:true,owners:{owner:true},protectedStaff:{test:true}}}])assert.throws(()=>inspectTestSlot({actor,...base(),...patch}));
 assert.throws(()=>inspectTestSlot({actor:{...actor,portalRole:'staff'},...base()}));
});
test('stop and restore read back without modifying supplied historical records',async()=>{
 const data=base(),history={attendance:{test:['past']},answers:{test:'o'}};const original=JSON.stringify(history);
 for(const [i,state]of ['stopped','active'].entries()){
 const expected=inspectTestSlot({actor,...data});let writes=0;
 const result=await changeTestSlot({actor,expected,operationId:'op'+i,timestamp:123,read:async()=>structuredClone(data),transact:async fn=>{writes++;data.state=fn(data.state);return {committed:!!data.state};}});
 assert.equal(result.state.state,state);assert.equal(writes,1);assert.equal(JSON.stringify(history),original);
 }
});
test('fresh account/card links and changed state abort before writing',async()=>{
 for(const patch of [{users:{new:{staffId:'test'}}},{cards:{new:{staffId:'test'}}},{state:{state:'stopped',revision:1}}]){
 let writes=0;await assert.rejects(changeTestSlot({actor,expected:inspectTestSlot({actor,...base()}),read:async()=>({...base(),...patch}),transact:async()=>{writes++;}}));assert.equal(writes,0);
 }
});
test('unconfirmed readback never retries transaction',async()=>{
 let writes=0;await assert.rejects(changeTestSlot({actor,expected:inspectTestSlot({actor,...base()}),operationId:'op',timestamp:1,read:async()=>base(),transact:async()=>{writes++;return {committed:true};}}),/再実行せず/);assert.equal(writes,1);
});
test('management route retains auth, one scoped transaction and no notification startup',()=>{
 const source=fs.readFileSync('test-slot-management.mjs','utf8');
 assert.ok(source.includes('startPortalAuth'));assert.ok(source.includes("ref(db,'staffLifecycle/test')"));assert.equal(source.split('runTransaction(target').length-1,1);
 assert.doesNotMatch(source,/checkScheduleDeadlines|autoFillExpired|sendNotification/);assert.ok(!source.includes('fetch('));
});
