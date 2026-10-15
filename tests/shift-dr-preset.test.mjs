import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHarness} from './shift-admin-harness.mjs';

test('full-time DR preset stays local until save, persists 7.5h and preserves other staff',async()=>{
  const h=await makeHarness();
  h.run("STAFF.find(s=>s.id==='a').type='full'");
  h.state.store.shifts['2026-10']={a:{'2026-10-05':'early'},b:{'2026-10-05':'late'}};
  h.reload();h.run("openModal('a','2026-10-05')");
  assert.equal(h.field('drTimePreset').style.display,'block');
  const before=JSON.stringify(h.state.store);
  h.run('applyDrTimePreset()');
  assert.equal(h.state.writes.length,0);assert.equal(JSON.stringify(h.state.store),before);
  assert.equal(h.field('manualTimeEnabled').checked,true);
  assert.equal(h.field('manualStart').value,'09:00');assert.equal(h.field('manualEnd').value,'18:00');
  assert.equal(h.field('manualBreak').value,'90');assert.match(h.field('manualHoursPreview').textContent,/7.5/);
  await h.run('applyModal()');assert.equal(h.state.writes.length,1);
  assert.equal(h.read('shifts/2026-10/a/2026-10-05'),'early');
  assert.deepEqual(h.read('shifts/2026-10/__manualTimes/a/2026-10-05'),{key:'early',start:'09:00',end:'18:00',breakMinutes:90});
  assert.equal(h.read('shifts/2026-10/b/2026-10-05'),'late');
  for(const expr of ["getHours('a',2026,9)","calcHours('a',2026,9,31)","weeklyHourSummary('a',2026,9,31).find(w=>w.hours).hours"])assert.equal(h.run(expr),7.5);
  assert.equal(h.run("countRoleStaffing('DR','2026-10-05')"),1);
  assert.equal(h.run("Object.values(shiftData.a).filter(k=>k==='late').length"),0);
  h.reload();h.run("openModal('a','2026-10-05')");
  assert.equal(h.field('manualEnd').value,'18:00');assert.equal(h.field('manualBreak').value,90);
  h.field('manualTimeEnabled').checked=false;await h.run('applyModal()');
  assert.equal(h.run("getHours('a',2026,9)"),9);
});

test('preset is unavailable for other employment/roles and respects edit guards',async()=>{
  const h=await makeHarness();
  for(const [role,type] of [['DR','part'],['DR','director'],['DR','spot'],['DH','full'],['DA','full']]){
    h.run(`Object.assign(STAFF[0],${JSON.stringify({role,type})});openModal('a','2026-10-05')`);
    assert.equal(h.field('drTimePreset').style.display,'none');
    h.field('manualStart').value='08:30';h.run('applyDrTimePreset()');assert.equal(h.field('manualStart').value,'08:30');
  }
  h.run("Object.assign(STAFF[0],{role:'DR',type:'full'});openModal('a','2026-10-05')");
  for(const [guard,clear] of [["currentUser={role:'staff'}","currentUser={role:'admin'}"],['manualSavePending=true','manualSavePending=false'],["shiftLocks['2026-10']=true","shiftLocks={}"]]){
    h.field('manualStart').value='08:30';h.run(guard+';applyDrTimePreset()');assert.equal(h.field('manualStart').value,'08:30');h.run(clear);
  }
  assert.equal(h.state.writes.length,0);
});
