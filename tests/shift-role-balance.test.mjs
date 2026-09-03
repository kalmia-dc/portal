import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const base=process.argv[2]||'.';
const html=fs.readFileSync(base+'/shift.html','utf8');
const extension=fs.readFileSync(base+'/clinic-leave.js','utf8');
const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
for(const [,attrs,code] of scripts){if(attrs.includes('type="module"'))new vm.SourceTextModule(code);else new vm.Script(code);}
new vm.Script(extension);
const balance=fs.readFileSync(base+'/shift-role-balance.js','utf8');new vm.Script(balance);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
const nodes=new Map();
const node=()=>({style:{},classList:{contains:()=>false,add(){},remove(){}},appendChild(){},addEventListener(){},querySelectorAll:()=>[],value:'',textContent:'',innerHTML:''});
let confirmAnswer=false,confirmationCount=0;const alerts=[];const timers=[];
const context=vm.createContext({console,structuredClone,Date,Math,Set,Object,Array,String,Number,JSON,Error,URLSearchParams,
  alert:m=>alerts.push(m),confirm:()=>{confirmationCount++;return confirmAnswer;},setTimeout:f=>timers.push(f),
  fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(base+'/portal-holidays.json'))}),
  window:{addEventListener(){}},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},querySelectorAll:()=>[],createElement:node,body:node()},localStorage:{getItem:()=>null},location:{search:'',hash:''}});
vm.runInContext(extension,context);vm.runInContext(balance,context);
const main=scripts.find(([,a,c])=>!a&&c.includes('const SHIFT'))[2];
vm.runInContext(main,context);
await vm.runInContext('window.__holidayDataReady',context);
const run=s=>vm.runInContext(s,context);
run("STAFF.push({id:'s',name:'Test',type:'full',role:'DH'})");
run("currentUser={role:'admin'};clinicSettingsLoaded=true;");
assert.equal(run('clinicGenerationReady()'),false);assert.equal(confirmationCount,1);
confirmAnswer=true;assert.equal(run('clinicGenerationReady()'),true);
run("clinicSettings.years[2026]='none';currentYear=2026");
assert.equal(run('clinicGenerationReady()'),true);
assert.throws(()=>run("validateClinicPeriod({name:'休',start:'2026-08-15',end:'2026-08-16'},2026,{},'x')"),/日曜/);
assert.throws(()=>run("validateClinicPeriod({name:'休',start:'2026-08-11',end:'2026-08-11'},2026,{},'x')"),/祝日/);
assert.throws(()=>run("validateClinicPeriod({name:'休',start:'2028-08-14',end:'2028-08-15'},2028,{},'x')"),/未収録/);
assert.equal(run("validateClinicPeriod({name:'お盆',start:'2026-08-13',end:'2026-08-15'},2026,{},'x').length"),3);
assert.equal(run("clinicDates('2026-12-31','2027-01-02').length"),3);
assert.throws(()=>run("clinicDates('2026-02-30','2026-03-03')"),/日付/);
run("clinicSettings={periods:{p:{name:'お盆',start:'2026-08-13',end:'2026-08-15'}},years:{2026:'registered'}};currentMonth=7;customHolidays=clinicDateMap();");
assert.throws(()=>run("validateClinicPeriod({name:'重複',start:'2026-08-14',end:'2026-08-14'},2026,clinicSettings,'other')"),/重複/);
const merged=run("mergeClinicMonth({s:{'2026-08-13':'early','2026-08-14':'paid'}},['2026-08-13','2026-08-14','2026-08-15'],clinicDateMap(),[{id:'s',name:'テスト'}])");
assert.equal(merged.data.s['2026-08-13'],'early');assert.equal(merged.data.s['2026-08-14'],'paid');assert.equal(merged.data.s['2026-08-15'],'clinic');assert.equal(merged.conflicts.length,2);
run("shiftData={s:{'2026-08-13':'early','2026-08-14':'paid','2026-08-15':'clinic'}}");
assert.equal(run("getHours('s',2026,7)"),25);assert.equal(run("calcHours('s',2026,7,31)"),25);
assert.equal(run("clinicHourBreakdown('s',2026,7).credit"),8);assert.equal(run("isWorking('s','2026-08-15')"),false);
run("shiftData.s['2026-08-15']='late'");assert.equal(run("getHours('s',2026,7)"),25.5);assert.equal(run("clinicHourBreakdown('s',2026,7).credit"),0);
run("currentUser={role:'staff'}");assert.equal(run('clinicGenerationReady()'),false);
run("STAFF=STAFF.filter(s=>s.id!=='s')");
// Exercise the complete existing generator with credited leave and a preserved work override.
run("currentUser={role:'admin'};shiftData={tsuruta:{'2026-08-13':'early','2026-08-14':'clinic'}};render=()=>{};renderAlerts=()=>{};saveCurrentShift=()=>{};generateShift()");
for(const f of timers.splice(0))f();
assert.equal(run("shiftData.tsuruta['2026-08-13']"),'early');
assert.equal(run("shiftData.tsuruta['2026-08-14']"),'clinic');
assert.equal(run("STAFF.every(s=>shiftData[s.id]['2026-08-15']==='clinic')"),true);
// Deletion reverses only the credited category, preserving working overrides.
assert.equal(run("mergeClinicMonth({s:{'2026-08-13':'early','2026-08-14':'clinic'}},['2026-08-13','2026-08-14'],{},[{id:'s',name:'テスト'}]).data.s['2026-08-13']"),'early');
assert.equal(run("mergeClinicMonth({s:{'2026-08-14':'clinic'}},['2026-08-14'],{},[{id:'s',name:'テスト'}]).data.s['2026-08-14']"),undefined);
// Mock-only persistence tests: transactions preserve existing entries and locked months.
run(`
  renderClinicManager=()=>{};resetClinicForm=()=>{};
  var fakeDb={custom_holidays:{},shifts:{'2026-08':{tsuruta:{'2026-08-13':'early'}}},shift_locks:{}};
  var failSave=false;
  window._fb={db:{},ref:(_,p)=>p,get:async p=>({val:()=>p.split('/').reduce((o,k)=>o?.[k],fakeDb)}),runTransaction:async(p,fn)=>{
    if(failSave)throw Error('TEST_PERMISSION_DENIED');
    const keys=p.split('/');const key=keys.pop();let parent=fakeDb;for(const k of keys)parent=parent[k]??={};
    const value=fn(structuredClone(parent[key]||null));if(value===undefined)return {committed:false};
    parent[key]=value;return {committed:true,snapshot:{val:()=>value}};
  }};
  clinicSettings={periods:{},years:{}};clinicSettingsLoaded=true;currentUser={role:'admin'};
`);
await run("mutateClinicSettings(s=>{s.periods={p:{name:'お盆',start:'2026-08-13',end:'2026-08-15'}};s.years={2026:'registered'};})");
assert.equal(run("fakeDb.shifts['2026-08'].tsuruta['2026-08-13']"),'early');
assert.equal(run("fakeDb.shifts['2026-08'].tsuruta['2026-08-14']"),'clinic');
assert.equal(run("clinicReport.includes('保持')"),true);
run("fakeDb.shift_locks['2026_08']=true");
await run("mutateClinicSettings(s=>{delete s.periods.p;})");
assert.equal(run("fakeDb.shifts['2026-08'].tsuruta['2026-08-14']"),'clinic');
assert.equal(run("clinicReport.includes('確定済み')"),true);
assert.equal(run("clinicSettings.years[2026]"),undefined);
run("fakeDb.shift_locks['2026_08']=false");await run('retryClinicApply()');
assert.equal(run("fakeDb.shifts['2026-08'].tsuruta['2026-08-14']"),undefined);
run('failSave=true');await run("mutateClinicSettings(s=>{s.years[2026]='none'})");
assert.equal(run("clinicReport.includes('TEST_PERMISSION_DENIED')"),true);assert.equal(run("clinicSettings.years[2026]"),undefined);
run("failSave=false;currentUser={role:'staff'}");await run("mutateClinicSettings(s=>{s.years[2026]='none'})");
assert.equal(run("clinicSettings.years[2026]"),undefined);
console.log('PASS: syntax, IDs, warnings, dates, credit, override, generator, transactional save, conflicts, lock, deletion retry, denied writes, staff guard');

// Existing clinic entries must give zero credit to both excluded employment types.
run("currentUser={role:'admin'}; STAFF.push({id:'pt',type:'part',role:'DH'},{id:'sp',type:'spot',role:'DH'}); shiftData={pt:{'2026-08-13':'clinic','2026-08-14':'paid','2026-08-15':'early'},sp:{'2026-08-13':'clinic'}}");
for(const id of ['pt','sp']){
  assert.equal(run("clinicCreditHours('"+id+"')"),0);
  assert.equal(run("clinicHourBreakdown('"+id+"',2026,7).credit"),0);
  assert.equal(run("calcHours('"+id+"',2026,7,31)"),id==='pt'?17:0);
  assert.equal(run("getHours('"+id+"',2026,7)"),id==='pt'?17:0);
  assert.equal(run("weeklyHourSummary('"+id+"',2026,7,31).reduce((n,w)=>n+w.hours,0)"),id==='pt'?17:0);
}
assert.equal(run("clinicCreditHours('shimanaka')"),8);
assert.equal(run("clinicCreditHours('unknown')"),0);
// Synthetic coverage-rich pair of days allows a 3:1 DR allocation to become 2:2.
run(`
  STAFF=[{id:'dr',role:'DR',type:'full'},{id:'dr2',role:'DR',type:'part'},{id:'dr3',role:'DR',type:'part'},
    ...Array.from({length:5},(_,i)=>({id:'dh'+i,role:'DH',type:'part'})),{id:'tamiya',role:'DA',type:'full'}];
  var dates=['2026-09-07','2026-09-08'];
  shiftData=Object.fromEntries(STAFF.map(s=>[s.id,Object.fromEntries(dates.map(ds=>[ds,'early']))]));
  shiftData.dr[dates[1]]='off';shiftData.dr3[dates[1]]='off';requestData=[];
  var fixture=structuredClone(shiftData);var hoursBefore=getHours('dr',2026,8);
`);
assert.equal(run('balanceRoleStaffing(2026,8,30,dates)'),1);
assert.equal(run("countRoleStaffing('DR',dates[0])"),2);assert.equal(run("countRoleStaffing('DR',dates[1])"),2);
assert.equal(run("getHours('dr',2026,8)===hoursBefore"),true);
assert.equal(run("shiftData.dr2[dates[0]]===fixture.dr2[dates[0]]"),true);
// Approved requests, paid leave, fixed patterns and protected staff cannot move.
for(const setup of [
  "requestData=[{staffId:'dr',date:dates[0],status:'approved',type:'work'}]",
  "shiftData.dr[dates[1]]='paid'",
  "shiftData.dr[dates[1]]='wish'",
  "STAFF[0].fixedDays=[1]",
  "STAFF[0].type='part'",
  "STAFF[0].type='spot'"
]){
  run("shiftData=structuredClone(fixture);requestData=[];STAFF[0].type='full';delete STAFF[0].fixedDays;"+setup);
  assert.equal(run('balanceRoleStaffing(2026,8,30,dates)'),0,setup);
}
// Removing a doctor may not create a coverage shortage even when variance improves.
run("shiftData=structuredClone(fixture);requestData=[];STAFF[0].type='full';shiftData.dh0[dates[0]]='off';shiftData.dh1[dates[0]]='off';shiftData.dh2[dates[0]]='off'");
assert.equal(run('balanceRoleStaffing(2026,8,30,dates)'),0);
// The same balancing operation applies to DH and DA, preserving hours.
for(const role of ['DH','DA']){
  run("shiftData=structuredClone(fixture);requestData=[];STAFF[0].role='"+role+"';STAFF[2].role='"+role+"'");
  assert.equal(run('balanceRoleStaffing(2026,8,30,dates)'),1,role);
  assert.equal(run("getHours('dr',2026,8)===hoursBefore"),true);
}
run("STAFF[0].role='DR';STAFF[2].role='DR'");
// Saturday fixed work and automatically protected staff are never moved.
run("shiftData=structuredClone(fixture);requestData=[];AUTO_PROTECTED_STAFF_IDS.push('dr')");
assert.equal(run('balanceRoleStaffing(2026,8,30,dates)'),0);
run("AUTO_PROTECTED_STAFF_IDS.pop();dates=['2026-09-12','2026-09-14'];shiftData=Object.fromEntries(Object.entries(fixture).map(([id,data])=>[id,{[dates[0]]:data['2026-09-07'],[dates[1]]:data['2026-09-08']}]));STAFF[0].satMandatory=true");
assert.equal(run('balanceRoleStaffing(2026,8,30,dates)'),0);
// Headcounts count people, not coverage floors, and exclude administration/leave.
run("STAFF=[{id:'a',role:'DR'},{id:'hanowa',role:'DH'},{id:'momo',role:'DA'},{id:'b',role:'DA'}];shiftData={a:{x:'clinic'},hanowa:{x:'hanowa'},momo:{x:'admin'},b:{x:'early'}}");
assert.equal(run("countRoleStaffing('DR','x')"),0);assert.equal(run("countRoleStaffing('DH','x')"),1);assert.equal(run("countRoleStaffing('DA','x')"),1);
console.log('PASS: excluded credit, actual headcounts, balancing improvement, unchanged hours, approved requests, leave, fixed patterns, employment types and shortage guard');
