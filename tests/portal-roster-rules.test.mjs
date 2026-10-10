import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {performRosterAdd} from '../portal-roster-model.mjs';
import {performMemberChange} from '../portal-members-model.mjs';
const require=createRequire(process.env.PORTAL_TEST_DEPS ? path.join(process.env.PORTAL_TEST_DEPS,'package.json') : import.meta.url);
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {ref,get,set,onValue,runTransaction,serverTimestamp}=require('firebase/database');
let env;
const actor={uid:'admin',portalRole:'admin'},draft={id:'staff_new',name:'架空新人',role:'DR',type:'part'};
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-roster-add',database:{host:'127.0.0.1',port:9015,rules:fs.readFileSync(process.env.PORTAL_RULES_FILE || 'database.rules.json','utf8')}})});
after(async()=>env?.cleanup());
beforeEach(async()=>env.withSecurityRulesDisabled(c=>set(ref(c.database()),{
 portalAccess:{users:{admin:{role:'admin',active:true,staffId:'sugihira',name:'管理者'},staff:{role:'staff',active:true,staffId:'old',name:'既存'},inactive:{role:'admin',active:false,staffId:'x',name:'停止'}}},
 serviceAccess:{notifications:{uid:'notification-service',active:false}},
 portalAccessRequests:{pending:{uid:'pending',email:'pending@example.test'}},
 extra_staff:{old:{id:'old',name:'既存',role:'DH',type:'full',password:'preserve'}},
 shifts:{preserved:1},attendance:{punches:{preserved:1}}
})));
const db=uid=>uid?env.authenticatedContext(uid,{email:`${uid}@example.test`,email_verified:true,firebase:{sign_in_provider:'google.com'}}).database():env.unauthenticatedContext().database();
async function transact(client,path,fn){const target=ref(client,path);let off;try{
 await new Promise((resolve,reject)=>{off=onValue(target,resolve,reject)});await get(target);
 return await runTransaction(target,fn,{applyLocally:false});
}finally{off?.();}}
test('existing deployed rules allow roster transaction then verified request binding, retain history',async()=>{
 const client=db('admin'); const options={actor,draft,defaults:[],confirm:()=>true,transact:fn=>transact(client,'extra_staff',fn)};
 await performRosterAdd(options);await performRosterAdd(options);
 assert.equal(Object.keys((await get(ref(client,'extra_staff'))).val()).length,2);
 assert.equal((await get(ref(client,'extra_staff/old/password'))).val(),'preserve');
 assert.equal((await get(ref(client,'portalAccess/users/pending'))).val(),null);
 await performMemberChange({actor,uid:'pending',expected:null,action:'register',staff:draft,timestamp:serverTimestamp(),confirm:()=>true,
 readRequest:async uid=>(await get(ref(client,`portalAccessRequests/${uid}`))).val(),transact:(uid,fn)=>transact(client,`portalAccess/users/${uid}`,fn)});
 assert.equal((await get(ref(client,'portalAccess/users/pending/staffRole'))).val(),'DR');
 for(const branch of ['shifts','attendance/punches'])assert.equal((await get(ref(client,branch+'/preserved'))).val(),1);
});
test('two concurrent forms cannot create same normalized name',async()=>{
 const results=await Promise.allSettled(['a','b'].map(id=>performRosterAdd({actor,draft:{...draft,id},defaults:[],confirm:()=>true,transact:fn=>transact(db('admin'),'extra_staff',fn)})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(Object.keys((await get(ref(db('admin'),'extra_staff'))).val()).length,2);
});
test('server rejects non-admin roster writes and retains service UID / self protections',async()=>{
 for(const uid of [null,'staff','inactive','notification-service'])await assertFails(set(ref(db(uid),'extra_staff/new'),draft));
 const admin=db('admin');
 await assertFails(set(ref(admin,'portalAccess/users/admin'),{role:'staff',active:false,staffId:'sugihira',name:'管理者'}));
 await assertFails(set(ref(admin,'portalAccessRequests/notification-service'),{uid:'notification-service',email:'notification-service@example.test'}));
 await assertFails(set(ref(admin,'portalAccess/users/notification-service'),{role:'staff',active:true,staffId:'staff_new',name:'架空新人',email:'notification-service@example.test',updatedBy:'admin',updatedAt:Date.now()}));
});
