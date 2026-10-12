import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildJoinRuleCandidate} from '../tools/build-join-rule-candidate.mjs';
import {applicationChange,approvalUpdates,joinNameKey} from '../portal-join-model.mjs';
import {defaultStaff} from '../portal-default-staff.mjs';
const require=createRequire(process.env.PORTAL_TEST_DEPS?path.join(process.env.PORTAL_TEST_DEPS,'package.json'):import.meta.url);
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {ref,get,set,update,remove,serverTimestamp,onValue,runTransaction,goOffline,goOnline}=require('firebase/database');
const base=JSON.parse(fs.readFileSync(process.env.PORTAL_RULES_FILE||new URL('../tools/lifecycle-rule-baseline.json',import.meta.url),'utf8'));
const rules=buildJoinRuleCandidate(base);let env;
const actor={uid:'admin',portalRole:'admin'},user={uid:'applicant',email:'applicant@example.test',emailVerified:true,providerData:[{providerId:'google.com'}]};
const db=(uid,claims={})=>uid?env.authenticatedContext(uid,{email:`${uid}@example.test`,email_verified:true,firebase:{sign_in_provider:'google.com'},...claims}).database():env.unauthenticatedContext().database();
before(async()=>env=await initializeTestEnvironment({projectId:'demo-portal-join',database:{host:'127.0.0.1',port:Number(process.env.PORTAL_TEST_PORT||9015),rules:JSON.stringify(rules)}}));
after(async()=>env?.cleanup());
beforeEach(async()=>env.withSecurityRulesDisabled(c=>set(ref(c.database()),{portalAccess:{users:{admin:{role:'admin',staffId:'sugihira',name:'管理者',active:true},staff:{role:'staff',staffId:'old',name:'旧職員',active:true},inactive:{role:'staff',staffId:'inactive',name:'停止',active:false}}},extra_staff:{old:{id:'old',name:'旧職員',role:'DH',type:'part'}},serviceAccess:{notifications:{uid:'notification-service',active:false}},shifts:{keep:1},attendance:{punches:{keep:1}},tasks:{keep:1},meetingManagement:{tasks:{keep:1}},portalAccessRequests:{legacy:{uid:'legacy',email:'legacy@example.test',requestedStaffId:'tanaka'}}})));
async function submit(uid='applicant',name='架空 新人') {await set(ref(db(uid),`portalJoinRequests/${uid}`),applicationChange({user:{...user,uid,email:`${uid}@example.test`},current:null,name,jobRole:'DR',timestamp:serverTimestamp()}));return (await get(ref(db(uid),`portalJoinRequests/${uid}`))).val();}
function plan(request,selection={}) {return approvalUpdates({actor,expected:request,current:request,selection:{mode:'new',staffId:'staff_join_'+request.uid,name:request.name,role:'DR',type:'part',...selection},roster:[...defaultStaff,{id:'old',name:'旧職員',role:'DH',type:'part'}],member:null,timestamp:serverTimestamp()});}
test('builder changes only new namespaces and membership write; rejects unrelated drift',()=>{
 for(const k of Object.keys(base.rules))if(k!=='portalAccess')assert.deepEqual(rules.rules[k],base.rules[k]);
 assert.deepEqual(rules.rules.portalAccess.users.$uid['.validate'],base.rules.portalAccess.users.$uid['.validate']);
 assert.deepEqual(buildJoinRuleCandidate(rules),rules);
 const drift=structuredClone(base);drift.rules.portalAccess.users.$uid['.write']='true';assert.throws(()=>buildJoinRuleCandidate(drift),/drift/);
});
test('verified Google applicant can submit/read own form only; no hospital/member/roster access',async()=>{
 await submit();await assertSucceeds(get(ref(db('applicant'),'portalJoinRequests/applicant')));
 for(const p of ['portalJoinRequests','portalJoinRequests/other','extra_staff','portalAccess/users','shifts','attendance/punches','tasks','meetingManagement/tasks','portalJoinNames'])await assertFails(get(ref(db('applicant'),p)));
 for(const p of ['extra_staff/x','portalAccess/users/applicant','shifts/x'])await assertFails(set(ref(db('applicant'),p),{active:true,role:'admin'}));
});
test('rejects unverified/non-Google/anonymous, another UID, fake email, role escalation and staff IDs',async()=>{
 const request=applicationChange({user,current:null,name:'名前',jobRole:'DH',timestamp:serverTimestamp()});
 for(const client of [db(null),db('applicant',{email_verified:false}),db('applicant',{firebase:{sign_in_provider:'password'}}),db('other')])await assertFails(set(ref(client,'portalJoinRequests/applicant'),request));
 for(const change of [{email:'other@example.test'},{role:'admin'},{staffId:'sugihira'},{jobRole:'admin'},{approval:{staffId:'sugihira'}},{state:'approved'},{name:''}])await assertFails(set(ref(db('applicant'),'portalJoinRequests/applicant'),{...request,...change}));
});
test('resubmission updates one record; stale revision rejected; approved applications cannot be edited',async()=>{
 const old=await submit(),client=db('applicant');
 await assertSucceeds(set(ref(client,'portalJoinRequests/applicant'),old));
 const next=applicationChange({user,current:old,name:'変更 名前',jobRole:'DA',timestamp:serverTimestamp()});await assertSucceeds(set(ref(client,'portalJoinRequests/applicant'),next));
 await assertFails(set(ref(client,'portalJoinRequests/applicant'),old));
 const current=(await get(ref(client,'portalJoinRequests/applicant'))).val();await update(ref(db('admin')),plan(current));
 await assertFails(set(ref(client,'portalJoinRequests/applicant'),{...next,revision:3,submittedAt:serverTimestamp()}));await assertFails(remove(ref(client,'portalJoinRequests/applicant')));
});
test('atomic approval adds roster/member/status; applicant gains access only after approval',async()=>{
 const request=await submit();await assertSucceeds(update(ref(db('admin')),plan(request)));
 const manager=db('admin');assert.equal((await get(ref(manager,'extra_staff/staff_join_applicant/type'))).val(),'part');
 assert.equal((await get(ref(manager,'portalAccess/users/applicant/role'))).val(),'staff');
 assert.equal((await get(ref(db('applicant'),'portalJoinRequests/applicant/state'))).val(),'approved');
 await assertSucceeds(get(ref(db('applicant'),'shifts')));
 assert.equal((await get(ref(manager,'attendance/punches/keep'))).val(),1);
});
test('one invalid path rejects the entire batch; retry succeeds without partial roster creation',async()=>{
 const request=await submit(),valid=plan(request),bad=structuredClone(valid);bad['portalAccess/users/applicant'].role='admin';
 await assertFails(update(ref(db('admin')),bad));
 for(const p of ['extra_staff/staff_join_applicant','portalAccess/users/applicant'])assert.equal((await get(ref(db('admin'),p))).val(),null);
 assert.equal((await get(ref(db('admin'),'portalJoinRequests/applicant/state'))).val(),'pending');
 await assertSucceeds(update(ref(db('admin')),valid));
});
test('pending request updated after confirmation rejects complete stale approval',async()=>{
 const request=await submit(),batch=plan(request);
 await set(ref(db('applicant'),'portalJoinRequests/applicant'),applicationChange({user,current:request,name:'更新 名前',jobRole:'DH',timestamp:serverTimestamp()}));
 await assertFails(update(ref(db('admin')),batch));assert.equal((await get(ref(db('admin'),'extra_staff/staff_join_applicant'))).val(),null);
});
test('two approvals for one request or same normalized new name cannot create duplicate accounts/rosters',async()=>{
 const request=await submit(),batch=plan(request);const outcomes=await Promise.allSettled([update(ref(db('admin')),batch),update(ref(db('admin')),batch)]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 const second=await submit('second','架空　新人');await assertFails(update(ref(db('admin')),plan(second)));
 assert.equal((await get(ref(db('admin'),'portalAccess/users/second'))).val(),null);assert.equal((await get(ref(db('admin'),'extra_staff/staff_join_second'))).val(),null);
});
test('existing roster/default binding preserves employment; changed/deleted roster rejects stale binding',async()=>{
 const request=await submit();const selection={mode:'existing',staffId:'old',name:'旧職員',role:'DH'};
 const batch=plan(request,selection);await assertSucceeds(update(ref(db('admin')),batch));assert.equal((await get(ref(db('admin'),'extra_staff/old/type'))).val(),'part');
 const second=await submit('second');await assertSucceeds(update(ref(db('admin')),plan(second,{mode:'existing',staffId:'tanaka',name:'田中',role:'DA'})));
 const third=await submit('third'),stale=plan(third,selection);await set(ref(db('admin'),'extra_staff/old/name'),'変更済み');await assertFails(update(ref(db('admin')),stale));
});
test('non-admin, notification service, self and legacy bypass of pending join remain blocked; old form works',async()=>{
 const request=await submit();for(const uid of ['applicant','staff','inactive','notification-service'])await assertFails(update(ref(db(uid)),plan(request)));
 await assertFails(set(ref(db('notification-service'),'portalJoinRequests/notification-service'),{...request,uid:'notification-service',email:'notification-service@example.test'}));
 await set(ref(db('admin'),'portalAccessRequests/applicant'),{uid:'applicant',email:'applicant@example.test'});
 const member={staffId:'tanaka',name:'田中',staffRole:'DA',role:'staff',active:true,email:'applicant@example.test',updatedBy:'admin',updatedAt:serverTimestamp()};
 await assertFails(set(ref(db('admin'),'portalAccess/users/applicant'),member));
 await assertSucceeds(set(ref(db('admin'),'portalAccess/users/legacy'),{...member,email:'legacy@example.test'}));
 await assertFails(update(ref(db('admin'),'portalAccess/users/admin'),{active:false,updatedAt:serverTimestamp(),updatedBy:'admin'}));
});
test('offline approval stays pending server-side and reconnect commits once; revoke/restore still works',async()=>{
 const request=await submit(),client=db('admin'),observer=db('admin');let settled=false;
 goOffline(client);
 const saving=update(ref(client),plan(request)).then(()=>{settled=true});
 await new Promise(resolve=>setTimeout(resolve,80));assert.equal(settled,false);
 assert.equal((await get(ref(observer,'portalAccess/users/applicant'))).val(),null);
 assert.equal((await get(ref(observer,'extra_staff/staff_join_applicant'))).val(),null);
 goOnline(client);await saving;
 const member=(await get(ref(observer,'portalAccess/users/applicant'))).val();
 await assertSucceeds(set(ref(observer,'portalAccess/users/applicant'),{...member,active:false,updatedAt:serverTimestamp()}));
 await assertFails(get(ref(db('applicant'),'tasks/after-revoke')));
 await assertSucceeds(set(ref(observer,'portalAccess/users/applicant'),{...member,active:true,updatedAt:serverTimestamp()}));
});
