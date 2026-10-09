import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHarness} from './shift-admin-harness.mjs';
const initial=()=>({a:{'2026-10-05':'early','2026-10-06':'paid','2026-11-01':'late'},b:{'2026-10-05':'late'},__manualTimes:{a:{'2026-10-05':{key:'early',start:'09:00',end:'17:00',breakMinutes:60}}},__cancelledShifts:{a:{'2026-10-07':{key:'off',cancelledAt:'old'}}}});
async function setup(){const h=await makeHarness();h.state.store.shifts['2026-10']=initial();h.state.store.shifts['2026-11']={a:{'2026-11-20':'late'}};h.reload();return h;}
test('staff-month confirms displayed month and count; cancel writes nothing; atomic clear and reload/restore preserve others',async()=>{
 const h=await setup(),original=structuredClone(h.state.store);
 h.run('openStaffMonthOperation()');assert.match(h.field('staffMonthTarget').textContent,/架空医師A（DR）\n2026年10月：2件/);
 h.run('closeStaffMonthOperation()');assert.equal(h.state.writes.length,0);
 h.run('openStaffMonthOperation()');await h.run('confirmStaffMonthOperation()');
 assert.equal(h.state.writes.length,1);assert.equal(h.state.writes[0].path,'shifts/2026-10');assert.equal(h.state.writes[0].options.applyLocally,false);
 assert.equal(h.read('shifts/2026-10/a/2026-10-05'),null);assert.equal(h.read('shifts/2026-10/a/2026-11-01'),'late');
 assert.deepEqual(h.read('shifts/2026-10/b'),original.shifts['2026-10'].b);assert.deepEqual(h.read('shifts/2026-11'),original.shifts['2026-11']);
 assert.deepEqual(h.read('shifts/2026-10/__cancelledShifts/a/2026-10-07'),original.shifts['2026-10'].__cancelledShifts.a['2026-10-07']);
 h.reload();h.run('openStaffMonthOperation(true)');await h.run('confirmStaffMonthOperation()');
 assert.deepEqual(h.read('shifts/2026-10/a'),original.shifts['2026-10'].a);assert.deepEqual(h.read('shifts/2026-10/__manualTimes/a'),original.shifts['2026-10'].__manualTimes.a);
});
test('staff-month refuses staff role, locked month, offline, missing staff and empty targets',async()=>{
 for(const code of ["currentUser={role:'staff'}","shiftLocks={'2026-10':true}",'window._fb.shiftConnected=false',"document.getElementById('monthStaff').value='unknown'",'shiftData={}']){
  const h=await setup();h.run(code+';openStaffMonthOperation()');assert.equal(h.run('staffMonthOperation'),null);assert.equal(h.state.writes.length,0);
 }
});
test('latest server lock, role loss, disconnection, read failure and commit rejection cannot partially clear a month',async()=>{
 for(const kind of ['lock','role','offline','late-offline','denied','partial','read-failed']){
  const h=await setup();h.run('openStaffMonthOperation()');const before=structuredClone(h.state.store.shifts);
  if(kind==='lock')h.state.store.shift_locks['2026_10']=true;
  if(kind==='role')h.run("currentUser={role:'staff'}");if(kind==='offline')h.fb.shiftConnected=false;
  if(kind==='denied')h.state.denied=true;if(kind==='partial')h.state.rejectAfterProposal=true;
  if(kind==='read-failed')h.state.lockReadDenied=true;
  if(kind==='late-offline')h.state.beforeTransaction=()=>{h.fb.shiftConnected=false;};
  await h.run('confirmStaffMonthOperation()');assert.equal(h.state.writes.length,0);assert.deepEqual(h.state.store.shifts,before);assert.match(h.field('staffMonthError').textContent,/変更できません/);
 }
});
test('new or edited target dates abort all; independent other staff edit is preserved',async()=>{
 for(const ds of ['2026-10-05','2026-10-08']){
  const h=await setup();h.run('openStaffMonthOperation()');h.state.store.shifts['2026-10'].a[ds]='late';const before=structuredClone(h.state.store);
  await h.run('confirmStaffMonthOperation()');assert.deepEqual(h.state.store,before);assert.equal(h.state.writes.length,0);
 }
 const h=await setup();h.run('openStaffMonthOperation()');h.state.store.shifts['2026-10'].b['2026-10-09']='early';await h.run('confirmStaffMonthOperation()');assert.equal(h.read('shifts/2026-10/b/2026-10-09'),'early');
});
test('double confirmation, close and month changes during write do not duplicate or retarget it',async()=>{
 const h=await setup();h.run('openStaffMonthOperation()');let release,started;
 h.state.hold=new Promise(r=>release=r);const ready=new Promise(r=>started=r);h.state.started=started;
 const saving=h.run('confirmStaffMonthOperation()');await ready;await h.run('confirmStaffMonthOperation()');h.run('closeStaffMonthOperation();changeMonth(1)');assert.equal(h.run('currentMonth'),9);assert(h.run('staffMonthOperation'));
 release();await saving;assert.equal(h.state.writes.length,1);assert.equal(h.run('staffMonthOperation'),null);
});
test('individual restore/re-registration after bulk clear blocks bulk restore without altering remaining tombstones',async()=>{
 for(const action of ['restore','register']){
  const h=await setup();h.run('openStaffMonthOperation()');await h.run('confirmStaffMonthOperation()');
  h.run("openModal('a','2026-10-05');requestShiftEntryConfirmation=async()=>true");
  if(action==='restore')await h.run('cancelOrRestoreShift(true)');else {h.run("modalSelected='late'");await h.run('applyModal()');}
  h.reload();h.run('openStaffMonthOperation(true)');assert.equal(h.run('staffMonthOperation'),null);assert(h.read('shifts/2026-10/__cancelledShifts/a/2026-10-06'));
 }
});
test('restore conflicts after confirmation abort all, and a second batch preserves older cancelled days',async()=>{
 const h=await setup();h.run('openStaffMonthOperation()');await h.run('confirmStaffMonthOperation()');h.run('openStaffMonthOperation(true)');
 h.state.store.shifts['2026-10'].a['2026-10-06']='late';const before=structuredClone(h.state.store);await h.run('confirmStaffMonthOperation()');assert.deepEqual(h.state.store,before);
 h.run('closeStaffMonthOperation()');h.reload();h.run('openStaffMonthOperation()');await h.run('confirmStaffMonthOperation()');assert(h.read('shifts/2026-10/__cancelledShifts/a/2026-10-05'));assert.equal(Object.keys(h.read('shifts/2026-10/__staffMonthUndo/a/dates')).length,1);
});
test('unlinked/unrequested staff remain eligible; revoked and mixed mappings rejected, terminals excluded',async()=>{
 const h=await setup();assert.equal(h.run("staffAccessIssue('a',{})"),'');assert.equal(h.run("staffAccessIssue('a',{terminal:{staffId:'a',role:'terminal',active:false}})"),'');
 assert.match(h.run("staffAccessIssue('a',{u:{staffId:'a',role:'staff',active:false}})"),/解除済み/);
 assert.match(h.run("staffAccessIssue('a',{u:{staffId:'a',role:'staff',active:false},v:{staffId:'a',role:'staff',active:true}})"),/混在/);
});
test('revoked after opening, failed server read and disconnect reject save; cancellation remains allowed; restore is registration',async()=>{
 for(const kind of ['revoked','read-failed','offline']){
  const h=await setup();h.run("openModal('a','2026-10-05');modalSelected='late'");
  if(kind==='revoked')h.state.store.portalAccess.users.u={staffId:'a',role:'staff',active:false};if(kind==='read-failed')h.state.readDenied=true;if(kind==='offline')h.fb.shiftConnected=false;
  await h.run('applyModal()');assert.equal(h.state.writes.length,0);assert.equal(h.read('shifts/2026-10/a/2026-10-05'),'early');
 }
 const h=await setup();h.state.store.portalAccess.users.u={staffId:'a',role:'staff',active:false};
 h.run("receiveShiftMembers({u:{staffId:'a',role:'staff',active:false}});openModal('a','2026-10-05');requestShiftEntryConfirmation=async()=>true");
 await h.run('cancelOrRestoreShift()');assert.equal(h.state.writes.length,1);h.run("openModal('a','2026-10-05')");await h.run('cancelOrRestoreShift(true)');assert.equal(h.state.writes.length,1);
 h.run('closeModal();openStaffMonthOperation()');await h.run('confirmStaffMonthOperation()');h.run('openStaffMonthOperation(true)');await h.run('confirmStaffMonthOperation()');assert.match(h.field('staffMonthError').textContent,/解除済み/);
});
test('membership revocation observed after fresh read aborts pending transaction; legacy whole-month save cannot bypass it',async()=>{
 const h=await setup();h.run("openModal('a','2026-10-05');modalSelected='late'");h.state.beforeTransaction=()=>h.run("receiveShiftMembers({u:{staffId:'a',role:'staff',active:false}})");await h.run('applyModal()');assert.equal(h.state.writes.length,0);
 h.state.beforeTransaction=null;h.state.store.portalAccess.users.u={staffId:'a',role:'staff',active:false};h.run("closeModal();shiftData.a['2026-10-08']='early'");assert.equal(await h.run('saveCurrentShift()'),false);assert.equal(h.state.writes.length,0);
});
test('order is presentation only; cross-role moves persist and cancel does not write',async()=>{
 const h=await setup(),before=structuredClone(h.state.store.shifts);h.run("openStaffOrder();moveStaffOrder('b',-1);closeStaffOrder()");assert.equal(h.state.writes.length,0);
 h.run("openStaffOrder();moveStaffOrder('b',-1)");await h.run('saveStaffOrder()');assert.deepEqual(h.read('shifts/__displayOrder/ids'),['b','a']);assert.equal(h.state.writes[0].path,'shifts/__displayOrder');assert.deepEqual(h.read('shifts/2026-10'),before['2026-10']);assert.deepEqual(h.run('STAFF.map(s=>s.id)').join(','),'a,b');
 h.reload();assert.equal(h.run('orderedShiftStaff().map(s=>s.id).join(",")'),'b,a');
 h.run("STAFF.push({id:'c',name:'追加',role:'DR'});receiveShiftMembers({u:{staffId:'b',role:'staff',active:false}})");assert.equal(h.run('orderedShiftStaff().map(s=>s.id).join(",")'),'b,a,c');h.run('receiveShiftMembers({})');assert.equal(h.run('orderedShiftStaff().map(s=>s.id).join(",")'),'b,a,c');
});
test('order save rejects non-admin, offline, simultaneous order and roster changes, server failure and double click',async()=>{
 for(const kind of ['role','offline','order','roster','denied']){
  const h=await setup();h.run("openStaffOrder();moveStaffOrder('b',-1)");
  if(kind==='role')h.run("currentUser={role:'staff'}");if(kind==='offline')h.fb.shiftConnected=false;if(kind==='order')h.state.store.shifts.__displayOrder={ids:['a','b'],revision:'other'};
  if(kind==='roster')h.run("STAFF.push({id:'c',name:'追加',role:'DR'})");if(kind==='denied')h.state.denied=true;
  await h.run('saveStaffOrder()');assert.equal(h.state.writes.length,0);assert.match(h.field('staffOrderError').textContent,/保存できません/);
 }
 const h=await setup();h.run("openStaffOrder();moveStaffOrder('b',-1)");let release,started;h.state.hold=new Promise(r=>release=r);const ready=new Promise(r=>started=r);h.state.started=started;
 const saving=h.run('saveStaffOrder()');await ready;await h.run('saveStaffOrder()');h.run('closeStaffOrder()');assert(h.run('staffOrderDraft'));release();await saving;assert.equal(h.state.writes.length,1);
});
