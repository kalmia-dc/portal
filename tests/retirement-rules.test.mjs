import test,{before,after,beforeEach} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {ref,set,get,update,serverTimestamp} from 'firebase/database';
import {createLaborStore} from '../labor-store.mjs';import {draftEmployee,transition} from '../labor-model.mjs';
let env;before(async()=>{env=await initializeTestEnvironment({projectId:'demo-retirement',database:{host:'127.0.0.1',port:9038,rules:fs.readFileSync(process.env.RETIREMENT_RULES_PATH||'database.rules.json','utf8')}});});after(async()=>env?.cleanup());
const db=uid=>env.authenticatedContext(uid).database();
beforeEach(async()=>env.withSecurityRulesDisabled(c=>set(ref(c.database()),{laborConfig:{enabled:true,owners:{owner:true}},portalAccess:{users:{owner:{staffId:'office',role:'admin',active:true},person:{staffId:'fixture',role:'staff',active:true},other:{staffId:'other',role:'admin',active:true}}},shifts:{'2026-07':{fixture:{'2026-07-01':'early'}}},scheduling:{events:{past:{responses:{fixture:{'2026-07-01':'o'}}}}}})));
test('actual production rules accept no-account retirement but retain owner restriction and historical data',async()=>{
 const d=db('owner'),store=createLaborStore({read:async p=>(await get(ref(d,p))).val(),update:p=>update(ref(d),p),timestamp:serverTimestamp,now:Date.now},{uid:'owner',staffId:'office',portalRole:'admin'},[]);
 const data=transition(draftEmployee({id:'fixture',name:'架空',role:'DR',type:'part'}),'confirm',{id:'period',startDate:'2025-07-01',endDate:'2026-08-31'});
 await store.save(data,0,'op',{reflect:true});
 assert.equal((await get(ref(d,'laborRecords/fixture/data/googleEmail'))).val(),'');
 assert.deepEqual((await get(ref(d,'extra_staff/fixture/schedulePeriods'))).val(),[{start:'2025-07-01',end:'2026-08-31'}]);
 assert.equal((await get(ref(d,'shifts/2026-07/fixture/2026-07-01'))).val(),'early');
 assert.equal((await get(ref(d,'scheduling/events/past/responses/fixture/2026-07-01'))).val(),'o');
 assert.equal((await get(ref(d,'portalAccess/users/person/active'))).val(),true);
 await assertFails(get(ref(db('person'),'scheduling/events')));
 await assertFails(set(ref(db('other'),'laborRecords/fixture'),{data}));
 await assertFails(set(ref(db('person'),'staffLifecycle/fixture'),{state:'active'}));
});
test('authorization expressions outside approved test exception remain identical to baseline',()=>{
 const changed=JSON.parse(fs.readFileSync('database.rules.json','utf8'));
 const w=changed.rules.staffLifecycle.$staffId['.write'];
 const marker=") || (auth != null && $staffId === 'test'";
 if(w.includes(marker))changed.rules.staffLifecycle.$staffId['.write']=w.slice(1,w.indexOf(marker));
 const gates=(o,p='',out={})=>{for(const [k,v]of Object.entries(o)){if(k==='.read'||k==='.write')out[p+'/'+k]=v;else if(v&&typeof v==='object')gates(v,p+'/'+k,out);}return out;};
 assert.equal(createHash('sha256').update(JSON.stringify(gates(changed))).digest('hex'),'d2cfad6195a94220cc8b96695d95112e0feb4567d9afc1e4a10ad449206c1ba1');
});
