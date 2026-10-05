import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const base=process.argv[2]||'.';
const html=fs.readFileSync(base+'/shift.html','utf8');
const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
for(const [,attrs,code] of scripts){if(attrs.includes('type="module"'))new vm.SourceTextModule(code);else new vm.Script(code);}
const nodes=new Map();
const node=()=>({style:{},classList:{contains:()=>false,add(){},remove(){}},appendChild(){},addEventListener(){},querySelectorAll:()=>[],value:'',checked:false,textContent:'',innerHTML:''});
const context=vm.createContext({console,structuredClone,Date,Math,Set,Object,Array,String,Number,JSON,Error,URLSearchParams,
  alert(){},confirm:()=>false,setTimeout(){},fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(base+'/portal-holidays.json'))}),
  window:{addEventListener(){}},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},querySelectorAll:()=>[],createElement:node,body:node()},localStorage:{getItem:()=>null},location:{search:'',hash:''}});
const run=s=>vm.runInContext(s,context);
for(const file of ['clinic-leave.js','shift-role-balance.js'])run(fs.readFileSync(base+'/'+file,'utf8'));
run(scripts.find(([,a,c])=>!a&&c.includes('const SHIFT'))[2]);
await run('window.__holidayDataReady');
run(`currentYear=2026;currentMonth=9;currentUser={role:'admin'};render=()=>{};
var fakeMonth={tsuruta:{'2026-10-05':'early'},yoshida:{'2026-10-05':'late'}};
var denied=false,locked=false,writes=0;
window._fb={db:{},ref:(_,p)=>p,get:async()=>({val:()=>locked}),runTransaction:async(p,fn)=>{
 if(denied)throw Error('TEST_DENIED');writes++;fakeMonth=fn(structuredClone(fakeMonth));return {committed:true,snapshot:{val:()=>structuredClone(fakeMonth)}};
}};
allShiftData={'2026-10':structuredClone(fakeMonth)};loadShiftForMonth(2026,9);openModal('tsuruta','2026-10-05');`);
const field=id=>nodes.get(id);
field('manualTimeEnabled').checked=true;field('manualStart').value='09:00';field('manualEnd').value='18:00';field('manualBreak').value='60';
await run('applyModal()');
for(const expr of ["getHours('tsuruta',2026,9)","calcHours('tsuruta',2026,9,31)","clinicHourBreakdown('tsuruta',2026,9).total","weeklyHourSummary('tsuruta',2026,9,31).find(w=>w.hours).hours"])assert.equal(run(expr),8);
assert.equal(run("fakeMonth.yoshida['2026-10-05']"),'late');
run("shiftData={};loadShiftForMonth(2026,9);openModal('tsuruta','2026-10-05')");
assert.equal(field('manualStart').value,'09:00');assert.equal(field('manualTimeEnabled').checked,true);
for(const [end,brk] of [['08:00','60'],['18:00','540'],['18:00','-1'],['18:00','1.5'],['18:00','']]){
 field('manualEnd').value=end;field('manualBreak').value=brk;await run('applyModal()');assert.match(field('manualTimeError').textContent,/保存できません/);assert.equal(run('writes'),1);
}
field('manualEnd').value='18:00';field('manualBreak').value='60';
run('denied=true');await run('applyModal()');assert.match(field('manualTimeError').textContent,/TEST_DENIED/);assert.equal(run("getHours('tsuruta',2026,9)"),8);
run('denied=false;locked=true');await run('applyModal()');assert.match(field('manualTimeError').textContent,/確定済み/);assert.equal(run('writes'),1);
run("locked=false;currentUser={role:'staff'}");await run('applyModal()');assert.equal(run('writes'),1);
run("currentUser={role:'admin'}");field('manualBreak').value='61';await run('applyModal()');assert.equal(run("getHours('tsuruta',2026,9)"),7.98);
run("openModal('tsuruta','2026-10-05')");field('manualTimeEnabled').checked=false;await run('applyModal()');assert.equal(run("getHours('tsuruta',2026,9)"),9);
run("openModal('tsuruta','2026-10-05');modalSelected='paid'");await run('applyModal()');assert.equal(run("getHours('tsuruta',2026,9)"),8);assert.equal(run("manualTimeFor('tsuruta','2026-10-05')"),null);
console.log('PASS: manual time save/reload, all totals, unrelated staff, invalid input, denied writes, lock, staff guard, minute rounding, reset, paid leave');
