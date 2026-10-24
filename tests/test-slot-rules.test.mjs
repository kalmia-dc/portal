import {execFileSync} from 'node:child_process';
import test,{before,after,beforeEach} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';import {ref,set,get,serverTimestamp} from 'firebase/database';
let env;before(async()=>{env=await initializeTestEnvironment({projectId:'demo-test-slot',database:{host:'127.0.0.1',port:9038,rules:fs.readFileSync(process.env.TEST_SLOT_RULES_PATH||'database.rules.json','utf8')}})});after(async()=>env?.cleanup());
const seed=()=>({laborConfig:{enabled:true,owners:{owner:true,person:true,terminal:true,service:true,self:true,expired:true}},portalAccess:{users:{owner:{staffId:'office',role:'admin',active:true},other:{staffId:'other',role:'admin',active:true},person:{staffId:'real',role:'staff',active:true},terminal:{staffId:'terminal',role:'terminal',active:true},service:{staffId:'service',role:'admin',active:true},self:{staffId:'test',role:'admin',active:true},expired:{staffId:'expired',role:'admin',active:true}}},serviceAccess:{notifications:{uid:'service'}},extra_staff:{test:{name:'test'},real:{name:'real'}},staffLifecycle:{expired:{hrManaged:true,startAt:1,endAt:2,state:'active'}},attendance:{records:{test:{past:'kept'}}},shifts:{past:{test:'kept'}},scheduling:{events:{past:{responses:{test:'o',real:'x'}}}}});
const seedData=async value=>env.withSecurityRulesDisabled(c=>set(ref(c.database()),value));beforeEach(()=>seedData(seed()));
const db=uid=>uid?env.authenticatedContext(uid).database():env.unauthenticatedContext().database();
const record=(uid='owner',state='stopped',revision=1)=>({state,revision,operationId:'op'+revision,updatedBy:uid,updatedAt:serverTimestamp()});
test('labor admin can stop and restore test while histories and permissions are unchanged',async()=>{
 const d=db('owner');await set(ref(d,'staffLifecycle/test'),record());await set(ref(d,'staffLifecycle/test'),record('owner','active',2));
 await env.withSecurityRulesDisabled(async c=>{const all=(await get(ref(c.database()))).val(),original=seed();for(const path of ['attendance','shifts','scheduling','portalAccess','extra_staff'])assert.deepEqual(all[path],original[path]);assert.equal(all.staffLifecycle.test.state,'active');});
});
for(const uid of [null,'other','person','terminal','service','self','expired'])test('test exception rejects actor '+uid,()=>assertFails(set(ref(db(uid),'staffLifecycle/test'),record(uid))));
test('other staff, deletion and extra privileges remain forbidden',async()=>{
 const d=db('owner');await assertFails(set(ref(d,'staffLifecycle/real'),record()));
 await assertFails(set(ref(d,'staffLifecycle/test'),record('owner','active')));
 await assertFails(set(ref(d,'staffLifecycle/test'),{...record(),state:'anything'}));
 await assertFails(set(ref(d,'staffLifecycle/test'),{...record(),startAt:0}));
 await assertFails(set(ref(d,'staffLifecycle/test'),{...record(),hrManaged:true}));
 await set(ref(d,'staffLifecycle/test'),record());await assertFails(set(ref(d,'staffLifecycle/test'),null));await assertFails(set(ref(d,'staffLifecycle/test'),record('owner','active',9)));
});
test('protected, HR-managed and stopped-owner state cannot use exception',async()=>{
 for(const kind of ['protected','hr','stopped']){const s=seed();if(kind==='protected')s.laborConfig.protectedStaff={test:true};if(kind==='hr')s.staffLifecycle.test={hrManaged:true,state:'active'};if(kind==='stopped')s.staffLifecycle.office={state:'stopped'};await seedData(s);await assertFails(set(ref(db('owner'),'staffLifecycle/test'),record()));}
});
test('live candidate changes exactly one write expression and preserves every other rule',()=>{
 const a=JSON.parse(process.env.TEST_SLOT_BASELINE_PATH?fs.readFileSync(process.env.TEST_SLOT_BASELINE_PATH,'utf8'):execFileSync('git',['show','da888d9:database.rules.json'],{encoding:'utf8'})),b=JSON.parse(fs.readFileSync(process.env.TEST_SLOT_RULES_PATH||'database.rules.json','utf8'));
 const old=a.rules.staffLifecycle.$staffId['.write'],next=b.rules.staffLifecycle.$staffId['.write'];assert.ok(next.startsWith('('+old+') || ('));assert.match(next,/\$staffId === 'test'/);
 b.rules.staffLifecycle.$staffId['.write']=old;assert.deepEqual(b,a);
});
