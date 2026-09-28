import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('attendance.html',root),'utf8');
for(const file of ['attendance.html','shift.html']){
 const text=fs.readFileSync(new URL(file,root),'utf8');
 for(const [,attrs,code] of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  if(attrs.includes('src='))continue;
  if(attrs.includes('type="module"'))new vm.SourceTextModule(code);else new vm.Script(code);
 }
 const ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size,file+' duplicate IDs');
}
const fields=Object.fromEntries(['profileStaff','profileHireDate','profileEmploymentType','profileLeaveGrantType','profileWeeklyDays','profileWeeklyHours','profileLeaveBalance','profileWeeklyHoursLabel','profileWorkHint','saveProfileButton'].map(id=>[id,{value:'',disabled:false}]));
let stored=null,writes=0,admin=true;
const context=vm.createContext({console,Date,Number,Math,Error,profiles:{},user:{staffId:'admin'},db:{},$:id=>fields[id],isAdmin:()=>admin,ref:(_,p)=>p,dateKey:d=>d.toISOString().slice(0,10),notify(){},audit:async()=>{},runTransaction:async(p,fn)=>{assert.equal(p,'attendance/profiles/tamiya');stored=fn(structuredClone(stored));writes++;return{committed:true,snapshot:{val:()=>structuredClone(stored)}}}});
const code=html.slice(html.indexOf('function hasProfileBalance('),html.indexOf('function attendanceRate('));vm.runInContext(code,context);
const run=s=>vm.runInContext(s,context);
function form(){Object.assign(fields.profileStaff,{value:'tamiya'});fields.profileHireDate.value='2025-10-01';fields.profileEmploymentType.value='flexiblePartTime';fields.profileLeaveGrantType.value='regular';fields.profileWeeklyDays.value='';fields.profileWeeklyHours.value='40';fields.profileLeaveBalance.value='';}
form();await run('saveProfile()');assert.equal(writes,1);assert.equal(stored.weeklyHours,null);assert.equal(stored.weeklyDays,null);assert.equal(stored.monthlyHoursCheck,'none');assert.equal(stored.leaveGrantType,'regular');assert.equal(stored.initialLeaveBalance,undefined);
// Firebase transaction must preserve newer baseline and pending grant, even if form cache is stale.
stored={...stored,nextGrantDate:'2026-04-01',leaveBalanceBaseline:6,leaveBalanceBaselineAt:'2026-09-18T00:00:00Z',initialLeaveBalance:3,migrationBatch:'keep',lastGrantProcessedAt:'keep'};
form();fields.profileLeaveBalance.value='999';await run('saveProfile()');assert.equal(stored.leaveBalanceBaseline,6);assert.equal(stored.initialLeaveBalance,3);assert.equal(stored.nextGrantDate,'2026-04-01');assert.equal(stored.migrationBatch,'keep');
run('loadProfileForm()');assert.equal(fields.profileLeaveBalance.readOnly,true);assert.equal(fields.profileWeeklyHours.disabled,true);
// Existing fixed profiles still require verified days and hours; do not persist invalid values.
form();fields.profileEmploymentType.value='standard';let before=writes;await run('saveProfile()');assert.equal(writes,before);
fields.profileWeeklyDays.value='5';fields.profileWeeklyHours.value='40';fields.profileLeaveGrantType.value='auto';await run('saveProfile()');assert.equal(writes,before+1);assert.equal(stored.weeklyHours,40);assert.equal(stored.monthlyHoursCheck,'default');
for(const day of ['0','8','1.5']){form();fields.profileWeeklyDays.value=day;before=writes;await run('saveProfile()');assert.equal(writes,before)}
form();fields.profileLeaveGrantType.value='auto';before=writes;await run('saveProfile()');assert.equal(writes,before);
form();admin=false;await run('saveProfile()');assert.equal(writes,before);admin=true;
// Explicit regular grant must not need fictitious working hours; legacy proportional table is retained.
assert.equal(run("grantDays({hireDate:'2025-10-01',leaveGrantType:'regular'},'2026-04-01')"),10);
assert.equal(run("grantDays({hireDate:'2025-10-01',weeklyDays:1,weeklyHours:7.5},'2026-04-01')"),1);
assert.equal(run("grantDays({hireDate:'2025-10-01',weeklyDays:4,weeklyHours:28},'2026-04-01')"),7);
assert.equal(run("grantDays({hireDate:'2025-10-01',weeklyDays:4,weeklyHours:28,leaveGrantType:'regular'},'2026-04-01')"),10);
assert.equal(run("grantDays({hireDate:'2025-10-01',weeklyDays:5,weeklyHours:25},'2026-04-01')"),10);
console.log('Profile regression: save/validation/legacy grants/baseline/concurrent update/admin guard PASS');
