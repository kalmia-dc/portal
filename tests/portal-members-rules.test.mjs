import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test,{before,after,beforeEach} from 'node:test';
const require=createRequire(process.env.PORTAL_TEST_DEPS ? path.join(process.env.PORTAL_TEST_DEPS,'package.json') : import.meta.url);
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {ref,get,set,update,remove,runTransaction,serverTimestamp,onValue}=require('firebase/database');
const {performMemberChange}=await import('../portal-members-model.mjs');
let env;
const active={staffId:'tanaka',name:'田中',role:'staff',active:true,email:'staff@example.test'};
const admin={staffId:'sugihira',name:'管理者',role:'admin',active:true};
const request={uid:'pending',email:'pending@example.test'};
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-portal-members',database:{host:'127.0.0.1',port:9015,rules:fs.readFileSync(new URL('../database.rules.json',import.meta.url),'utf8')}})});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{await env.withSecurityRulesDisabled(async c=>set(ref(c.database()),{
  portalAccess:{users:{admin,admin2:{...admin,staffId:'momo'},staff:active,training:{...active,role:'trainingAdmin'},terminal:{...active,role:'terminal'},inactive:{...admin,active:false}}},
  portalAccessRequests:{pending:request}, shifts:{sample:'preserved'},attendance:{punches:{sample:'preserved'}},tasks:{sample:'preserved'},skills:{tanaka:{sample:1}},extra_staff:{},
}))});
const db=uid=>uid?env.authenticatedContext(uid,{email:`${uid}@example.test`,email_verified:true,firebase:{sign_in_provider:'google.com'}}).database():env.unauthenticatedContext().database();
const changed=(current,active)=>({...current,active,updatedBy:'admin',updatedAt:serverTimestamp()});
const target=(database,uid)=>ref(database,`portalAccess/users/${uid}`);
test('only active admin can list requests/users or register/revoke directly',async()=>{
  for(const uid of [null,'staff','training','terminal','pending','inactive']) {
    const client=db(uid);
    await assertFails(get(ref(client,'portalAccess/users')));await assertFails(get(ref(client,'portalAccessRequests')));
    await assertFails(set(target(client,'staff'),changed(active,false)));
    await assertFails(set(target(client,'pending'),{...active,role:'staff',email:request.email,updatedBy:uid,updatedAt:serverTimestamp()}));
  }
  await assertSucceeds(get(ref(db('admin'),'portalAccess/users')));
  await assertSucceeds(get(ref(db('admin'),'portalAccessRequests')));
  await assertSucceeds(get(target(db('staff'),'staff')));
  await assertFails(get(target(db('staff'),'admin')));
});
test('real registration transaction, duplicate and repeat revoke/restore',async()=>{
  const client=db('admin');
  async function transact(uid,fn){const r=target(client,uid);let off;try{await new Promise((resolve,reject)=>{off=onValue(r,resolve,reject)});await get(r);return await runTransaction(r,fn,{applyLocally:false})}finally{off?.()}}
  const opts={actor:{uid:'admin',portalRole:'admin'},uid:'pending',expected:null,action:'register',staff:{id:'tanaka',name:'田中',role:'DA'},confirm:()=>true,readRequest:async uid=>(await get(ref(client,`portalAccessRequests/${uid}`))).val(),transact,timestamp:serverTimestamp()};
  await performMemberChange(opts);
  await assert.rejects(performMemberChange(opts));
  const saved=(await get(target(client,'pending'))).val();assert.equal(saved.role,'staff');
  await performMemberChange({...opts,expected:saved,action:'revoke'});
  await assert.rejects(performMemberChange({...opts,expected:saved,action:'revoke'}));
  const revoked=(await get(target(client,'pending'))).val();assert.equal(revoked.active,false);
  await performMemberChange({...opts,expected:revoked,action:'restore'});
});
test('server rejects missing request, escalation, deletion, self/admin/terminal change',async()=>{
  const client=db('admin');
  await assertFails(set(target(client,'unknown'),{...active,updatedAt:serverTimestamp(),updatedBy:'admin'}));
  for(const role of ['admin','trainingAdmin','terminal']) await assertFails(set(target(client,'pending'),{...active,email:request.email,role,updatedAt:serverTimestamp(),updatedBy:'admin'}));
  await assertFails(set(target(client,'staff'),{...changed(active,false),role:'admin'}));
  await assertFails(set(target(client,'staff'),{...changed(active,false),staffId:'momo'}));
  for(const uid of ['staff','admin','admin2','terminal']) await assertFails(remove(target(client,uid)));
  for(const uid of ['admin','admin2','terminal']) await assertFails(update(target(client,uid),{active:false,updatedBy:'admin',updatedAt:serverTimestamp()}));
  await assertFails(update(ref(client),{'portalAccess/users/admin':null,'portalAccess/users/admin2':null}));
  await assertSucceeds(set(target(client,'staff'),changed(active,false)));
  await assertFails(set(target(client,'staff'),changed(active,false)));
});
test('already authenticated session loses DB access after revoke; history remains',async()=>{
  const client=db('staff'),manager=db('admin');
  await assertSucceeds(get(ref(client,'shifts')));
  await assertSucceeds(set(target(manager,'staff'),changed(active,false)));
  // A new path avoids satisfying get() from the SDK cache after the denied server read.
  await assertFails(get(ref(client,'shifts/after-revoke')));
  await assertFails(set(ref(client,'tasks/new'),{title:'denied'}));
  await assertFails(set(ref(client,'skills/tanaka/new'),1));
  assert.equal((await get(ref(manager,'shifts/sample'))).val(),'preserved');
  assert.equal((await get(ref(manager,'attendance/punches/sample'))).val(),'preserved');
});
test('own profile subscription receives revocation with existing auth token',async()=>{
  const client=db('staff');let cancel;
  const revoked=new Promise((resolve,reject)=>{cancel=onValue(target(client,'staff'),snap=>{if(snap.val()?.active===false)resolve()},reject)});
  await set(target(db('admin'),'staff'),changed(active,false));
  await revoked;cancel();
});
