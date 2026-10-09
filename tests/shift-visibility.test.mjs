import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeHarness} from './shift-admin-harness.mjs';

async function setup(){
 const h=await makeHarness();
 h.state.store.shifts['2026-10']={a:{'2026-10-05':'early','2026-10-06':'paid'},b:{'2026-10-05':'late'}};h.reload();
 h.run("STAFF[0].type='part';STAFF.push({id:'c',name:'未紐付けC',role:'DA',type:'part'});receiveShiftMembers({u:{staffId:'a',role:'staff',active:false}});staffOrderRecord={ids:['c','a','b']};");
 h.state.store.shifts.__displayOrder={ids:['c','a','b']};return h;
}
test('revoked rows hide by default, history toggle restores saved position without any data writes',async()=>{
 const h=await setup(),before=JSON.stringify(h.state.store);
 assert.equal(h.run("visibleShiftStaff().map(s=>s.id).join(',')"),'c,b');
 h.run('renderStaffList();renderCalendar();renderSummary();renderClinicHours()');
 assert(!h.field('calGrid').children.some(n=>n.className==='cal-staff-name'&&n.innerHTML.includes('架空医師A')));
 assert(!h.field('clinicHoursSummary').innerHTML.includes('架空医師A'));
 const totals=['s-paid','s-ngdays','s-dhshort','s-hanowa'].map(id=>h.field(id).textContent);
 const counts=h.run("countRoleStaffing('DR','2026-10-05')");
 h.run('setShowRevokedShiftStaff(true);renderStaffList();renderCalendar();renderSummary();renderClinicHours()');
 assert.equal(h.run("visibleShiftStaff().map(s=>s.id).join(',')"),'c,a,b');
 assert(h.field('calGrid').children.some(n=>n.className==='cal-staff-name'&&n.innerHTML.includes('架空医師A')));
 assert(h.field('clinicHoursSummary').innerHTML.includes('架空医師A'));
 assert.deepEqual(['s-paid','s-ngdays','s-dhshort','s-hanowa'].map(id=>h.field(id).textContent),totals);
 assert.equal(h.run("countRoleStaffing('DR','2026-10-05')"),counts);
 assert.equal(JSON.stringify(h.state.store),before);assert.equal(h.state.writes.length,0);
 h.run('setShowRevokedShiftStaff(false);receiveShiftMembers({u:{staffId:"a",role:"staff",active:true}})');
 assert.equal(h.run("visibleShiftStaff().map(s=>s.id).join(',')"),'c,a,b');
});
test('unread and failed membership displays all with explicit state; unknown staff remains and retry re-applies filter',async()=>{
 const h=await setup();h.run('shiftMembersLoaded=false;renderShiftStaffVisibility()');
 assert.equal(h.run('visibleShiftStaff().length'),3);assert.equal(h.field('showRevokedShiftStaff').disabled,true);
 assert.match(h.field('staffVisibilityStatus').textContent,/全員を表示/);
 h.state.readDenied=true;await assert.rejects(h.run('refreshShiftMembers()'));
 assert.equal(h.run('visibleShiftStaff().length'),3);assert.equal(h.run("canRegisterShiftStaff('c')"),false);
 h.state.readDenied=false;h.state.store.portalAccess.users={u:{staffId:'a',role:'staff',active:false}};
 await h.run('refreshShiftMembers()');h.run('renderShiftStaffVisibility()');
 assert.equal(h.run("visibleShiftStaff().map(s=>s.id).join(',')"),'c,b');assert.equal(h.field('showRevokedShiftStaff').disabled,false);
 assert.equal(h.run("canRegisterShiftStaff('c')"),true);
});
test('history toggle never re-enables revoked registration; order editor retains hidden IDs',async()=>{
 const h=await setup();h.run('setShowRevokedShiftStaff(true)');assert.equal(h.run("canRegisterShiftStaff('a')"),false);
 h.run("setShowRevokedShiftStaff(false);openStaffOrder();moveStaffOrder('b',-1)");await h.run('saveStaffOrder()');
 assert.deepEqual(h.read('shifts/__displayOrder/ids'),['c','b','a']);
 h.run('setShowRevokedShiftStaff(true)');assert.equal(h.run("visibleShiftStaff().map(s=>s.id).join(',')"),'c,b,a');
});
test('CSV and print include hidden history and remain byte-identical when toggling visibility',async()=>{
 const h=await setup();
 h.run("let capturedCSV='';class Blob{constructor(parts){capturedCSV=parts.join('')}};const URL={createObjectURL:()=>''};const originalCreate=document.createElement;document.createElement=(tag)=>Object.assign(originalCreate(tag),{click(){}});exportCSV();printShift()");
 const csv=h.run('capturedCSV'),print=h.field('printArea').innerHTML;
 assert.match(csv,/架空医師A/);assert.match(print,/架空医師A/);
 h.run('setShowRevokedShiftStaff(true);exportCSV();printShift()');assert.equal(h.run('capturedCSV'),csv);assert.equal(h.field('printArea').innerHTML,print);
});

test('actual realtime membership success/error callbacks redraw filtered rows and unavailable state',async()=>{
 const h=await setup(),source=fs.readFileSync('shift.html','utf8');
 const start=source.indexOf("  if(authenticatedProfile.portalRole==='admin')onValue(ref(db,'portalAccess/users')");
 const end=source.indexOf("  onValue(ref(db,'shifts/__displayOrder')",start);
 h.run("let memberSuccess,memberError;const authenticatedProfile={portalRole:'admin'},db={},ref=(_,p)=>p,onValue=(_,ok,error)=>{memberSuccess=ok;memberError=error};render=()=>{renderStaffList();renderCalendar()}");
 h.run(source.slice(start,end));h.run("memberSuccess({val:()=>({u:{staffId:'a',role:'staff',active:false}})})");
 assert.equal(h.run('visibleShiftStaff().length'),2);
 h.run('memberError()');assert.equal(h.run('visibleShiftStaff().length'),3);assert.equal(h.field('showRevokedShiftStaff').disabled,true);
 h.run("memberSuccess({val:()=>({u:{staffId:'a',role:'staff',active:true}})})");assert.equal(h.field('showRevokedShiftStaff').disabled,false);assert.equal(h.run('visibleShiftStaff().length'),3);
});
