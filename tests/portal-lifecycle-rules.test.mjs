import test,{before,after,beforeEach} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {buildLifecycleRuleCandidate} from '../tools/build-lifecycle-rule-candidate.mjs';
import {approvalUpdates,applicationChange} from '../portal-join-model.mjs';
const require=createRequire(path.join(process.env.PORTAL_TEST_DEPS,'package.json')),{initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing'),{ref,set,get,update,remove,serverTimestamp,goOffline,goOnline}=require('firebase/database');
const baseline=JSON.parse(fs.readFileSync(new URL('../tools/lifecycle-rule-baseline.json',import.meta.url))),rules=buildLifecycleRuleCandidate(baseline);let env;
before(async()=>env=await initializeTestEnvironment({projectId:'demo-lifecycle',database:{host:'127.0.0.1',port:Number(process.env.PORTAL_TEST_PORT||9015),rules:JSON.stringify(rules)}}));after(async()=>env?.cleanup());
const db=uid=>uid?env.authenticatedContext(uid,{email:uid+'@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}}).database():env.unauthenticatedContext().database();
const state=(state='stopped',revision=1)=>({state,revision,operationId:'op'+revision,updatedBy:'admin',updatedAt:serverTimestamp()});
beforeEach(async()=>env.withSecurityRulesDisabled(c=>set(ref(c.database()),{portalAccess:{users:{admin:{staffId:'boss',name:'Boss',role:'admin',active:true},a:{staffId:'s',name:'架空',role:'staff',active:true},b:{staffId:'s',name:'架空',role:'trainingAdmin',active:true},old:{staffId:'s',name:'架空',role:'staff',active:false},terminal:{staffId:'term',role:'terminal',active:true},service:{staffId:'svc',role:'staff',active:false}}},serviceAccess:{notifications:{uid:'service',active:false}},extra_staff:{s:{id:'s',name:'架空',role:'DH'},boss:{id:'boss'},svc:{id:'svc'}},portalAccessRequests:{pending:{uid:'pending',email:'pending@example.test'}},shifts:{keep:1},attendance:{punches:{'2026-10-01':{s:{keep:1}}}},tasks:{keep:1}})));
test('only reviewed base accepted; notification service rules preserved',()=>{assert.throws(()=>buildLifecycleRuleCandidate({rules:{'.read':false,'.write':false}}),/drift/);assert.deepEqual(rules.rules.portalDailySummaryNotifications,baseline.rules.portalDailySummaryNotifications);});
test('staff stop denies both linked logins immediately, preserves all data and restores only previously active accounts',async()=>{
 await assertSucceeds(get(ref(db('a'),'shifts')));await set(ref(db('admin'),'staffLifecycle/s'),state());
 for(const uid of ['a','b','old']){await assertFails(get(ref(db(uid),'tasks/new')));await assertFails(set(ref(db(uid),'shifts/new'),1));}
 assert.equal((await get(ref(db('admin'),'shifts/keep'))).val(),1);assert.equal((await get(ref(db('admin'),'attendance/punches/2026-10-01/s/keep'))).val(),1);
 await set(ref(db('admin'),'staffLifecycle/s'),state('active',2));await assertSucceeds(get(ref(db('a'),'tasks')));await assertSucceeds(get(ref(db('b'),'tasks')));await assertFails(get(ref(db('old'),'tasks/new')));
});
test('self, notification service, staff, anonymous, unknown roster and deletes are rejected',async()=>{
 for(const uid of [null,'a','service'])await assertFails(set(ref(db(uid),'staffLifecycle/s'),state()));
 for(const sid of ['boss','svc','unknown'])await assertFails(set(ref(db('admin'),'staffLifecycle/'+sid),state()));await set(ref(db('admin'),'staffLifecycle/s'),state());await assertFails(remove(ref(db('admin'),'staffLifecycle/s')));
 await assertSucceeds(get(ref(db('a'),'staffLifecycle/s')));await assertFails(get(ref(db('a'),'staffLifecycle')));await assertFails(get(ref(db('a'),'staffLifecycle/boss')));
});
test('stale revisions, extra fields, double stop and partial payload rejected; retry with same record succeeds',async()=>{
 const p=ref(db('admin'),'staffLifecycle/s');await set(p,state());const saved=(await get(p)).val();await assertSucceeds(set(p,saved));
 await assertFails(set(p,state()));await assertFails(set(p,{...state('active',2),deleteEverything:true}));await assertFails(set(p,state('active',3)));
 await assertFails(update(ref(db('admin')),{'staffLifecycle/s':state('active',2),'forbidden/x':1}));assert.equal((await get(p)).val().state,'stopped');await assertSucceeds(set(p,state('active',2)));
});
test('new login cannot bind stopped staff; concurrent previously-linked account remains gated; terminal cannot punch',async()=>{
 await set(ref(db('admin'),'staffLifecycle/s'),state());await assertFails(set(ref(db('admin'),'portalAccess/users/pending'),{staffId:'s',name:'架空',role:'staff',active:true,email:'pending@example.test',updatedBy:'admin',updatedAt:serverTimestamp()}));
 await assertFails(set(ref(db('terminal'),'attendance/punches/2026-10-02/s'),{x:1}));await assertSucceeds(get(ref(db('terminal'),'attendance/punches/2026-10-01/s')));
});
test('offline operation has no partial server state and reconnect writes once',async()=>{
 const client=db('admin'),observer=db('admin');goOffline(client);let done=false;const saving=set(ref(client,'staffLifecycle/s'),state()).then(()=>done=true);await new Promise(r=>setTimeout(r,70));assert.equal(done,false);assert.equal((await get(ref(observer,'staffLifecycle/s'))).val(),null);goOnline(client);await saving;assert.equal((await get(ref(observer,'staffLifecycle/s/revision'))).val(),1);
});
test('applicant registration still works, approval into stopped roster fails atomically and new staff approval succeeds',async()=>{
 const user={uid:'new',email:'new@example.test',emailVerified:true,providerData:[{providerId:'google.com'}]},actor={uid:'admin',portalRole:'admin'};
 await set(ref(db('new'),'portalJoinRequests/new'),applicationChange({user,current:null,name:'架空 新人',jobRole:'DR',timestamp:serverTimestamp()}));
 const request=(await get(ref(db('new'),'portalJoinRequests/new'))).val();
 const payload=selection=>approvalUpdates({actor,expected:request,current:request,selection,roster:[{id:'s',name:'架空',role:'DH'}],member:null,timestamp:serverTimestamp()});
 await set(ref(db('admin'),'staffLifecycle/s'),state());await assertFails(update(ref(db('admin')),payload({mode:'existing',staffId:'s',name:'架空',role:'DH'})));
 assert.equal((await get(ref(db('new'),'portalJoinRequests/new/state'))).val(),'pending');
 await assertSucceeds(update(ref(db('admin')),payload({mode:'new',staffId:'new-staff',name:'架空 新人',role:'DR',type:'part'})));
 await assertSucceeds(get(ref(db('new'),'shifts')));await assertFails(get(ref(db('service'),'tasks')));
});
