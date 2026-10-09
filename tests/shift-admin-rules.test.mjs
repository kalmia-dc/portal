import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {makeHarness} from './shift-admin-harness.mjs';
const require=createRequire(process.env.PORTAL_TEST_DEPS?path.join(process.env.PORTAL_TEST_DEPS,'package.json'):import.meta.url);
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {ref,set,get,onValue,runTransaction}=require('firebase/database');
let env;
const users={admin:{active:true,role:'admin',staffId:'manager'},staff:{active:true,role:'staff',staffId:'b'},revoked:{active:false,role:'staff',staffId:'a'}};
const month={a:{'2026-10-05':'early','2026-10-06':'paid'},b:{'2026-10-05':'late'},__manualTimes:{a:{'2026-10-05':{key:'early',start:'09:00',end:'17:00',breakMinutes:60}}}};
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-shift-admin-enhancements',database:{host:'127.0.0.1',port:9015,rules:fs.readFileSync('database.rules.json','utf8')}})});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{await env.withSecurityRulesDisabled(async c=>set(ref(c.database()),{portalAccess:{users},shifts:{'2026-10':month},attendance:{punches:{keep:true}}}))});
test('real month transaction cancels only selected staff and refuses revoked restore; order uses existing admin scope',async()=>{
 const h=await makeHarness(),db=env.authenticatedContext('admin').database();
 h.state.store.shifts={'2026-10':structuredClone(month)};h.reload();
 Object.assign(h.fb,{db,ref,get,runTransaction,readMembersFromServer:async()=>(await get(ref(db,'portalAccess/users'))).val()});
 let off;await new Promise((resolve,reject)=>{off=onValue(ref(db,'shifts/2026-10'),resolve,reject)});
 try{
  h.run('openStaffMonthOperation()');await h.run('confirmStaffMonthOperation()');let data=(await get(ref(db,'shifts/2026-10'))).val();
  assert.equal(data.a,undefined);assert.equal(data.b['2026-10-05'],'late');assert.equal(Object.keys(data.__staffMonthUndo.a.dates).length,2);
  h.run('openStaffMonthOperation(true)');await h.run('confirmStaffMonthOperation()');assert.match(h.field('staffMonthError').textContent,/解除済み/);assert.deepEqual((await get(ref(db,'shifts/2026-10'))).val(),data);
  h.run("closeStaffMonthOperation();openStaffOrder();moveStaffOrder('b',-1)");await h.run('saveStaffOrder()');assert.deepEqual((await get(ref(db,'shifts/__displayOrder/ids'))).val(),['b','a']);
  assert.equal((await get(ref(db,'attendance/punches/keep'))).val(),true);
 }finally{off()}
});
test('database rejects direct month/order writes and membership reads from staff, revoked and service identities',async()=>{
 for(const uid of ['staff','revoked','notification-service']){
  const db=env.authenticatedContext(uid).database();
  await assertFails(set(ref(db,'shifts/2026-10'),{}));await assertFails(set(ref(db,'shifts/__displayOrder'),{ids:['a']}));await assertFails(get(ref(db,'portalAccess/users')));
 }
});
