import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../attendance.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function grantDays('),html.indexOf('async function processDueLeaveGrants('));
const days={};
const context=vm.createContext({dateKey:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),calcDay:ds=>days[ds]||{shift:{workMinutes:0},work:0,shiftKey:'off'}});
vm.runInContext(source,context);
const regular=[10,11,12,14,16,18,20,20];
const proportional={1:[1,2,2,2,3,3,3,3],2:[3,4,4,5,6,6,7,7],3:[5,6,6,8,9,10,11,11],4:[7,8,9,10,12,13,15,15]};
let checks=0;
for(const [hireDate,first] of [['2025-10-01','2026-04-01'],['2023-10-01','2024-04-01'],['2021-09-01','2022-03-01'],['2022-06-01','2022-12-01'],['2026-03-01','2026-09-01'],['2023-01-15','2023-07-15']]){
 for(let step=0;step<8;step++){
  const d=new Date(first+'T12:00:00');d.setFullYear(d.getFullYear()+step);const grantDate=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  for(const extra of [{leaveGrantType:'regular'},{weeklyDays:5,weeklyHours:25},{weeklyDays:4,weeklyHours:30}]){assert.equal(context.grantDays({hireDate,...extra},grantDate),regular[step],hireDate+' / '+grantDate);checks++;}
  for(const [weeklyDays,expected] of Object.entries(proportional)){assert.equal(context.grantDays({hireDate,weeklyDays:Number(weeklyDays),weeklyHours:7.5},grantDate),expected[step]);checks++;}
 }
}
assert.equal(context.grantDays({hireDate:'2025-10-01',leaveGrantType:'regular'},'2027-03-31'),10);
assert.equal(context.grantDays({hireDate:'2025-10-01',leaveGrantType:'regular'},'2027-04-01'),11);
assert.equal(context.grantDays({hireDate:'2025-10-01',leaveGrantType:'regular'},'2027-04-02'),11);
Object.assign(days,{
 '2026-01-05':{shift:{workMinutes:540},work:540,shiftKey:'early'},
 '2026-01-06':{shift:{workMinutes:540},work:540,shiftKey:'early'},
 '2026-01-07':{shift:{workMinutes:540},work:0,shiftKey:'early'},
 '2026-01-08':{shift:{workMinutes:0},work:0,shiftKey:'paid'},
 '2026-01-09':{shift:{workMinutes:0},work:0,shiftKey:'paid'},
 '2026-01-10':{shift:{workMinutes:0},work:0,shiftKey:'clinic'},
 '2026-01-11':{shift:{workMinutes:0},work:0,shiftKey:'wish'},
 '2025-03-31':{shift:{workMinutes:540},work:0,shiftKey:'early'},
 '2026-04-01':{shift:{workMinutes:540},work:0,shiftKey:'early'}
});
const check=expected=>assert.deepEqual(JSON.parse(JSON.stringify(context.attendanceRate('test','2026-04-01'))),expected);
check({scheduled:5,attended:4,rate:0.8});
// An anomalous punch on a paid day does not double-count attendance.
days['2026-01-08'].work=60;check({scheduled:5,attended:4,rate:0.8});
for(const key of Object.keys(days))delete days[key];check({scheduled:0,attended:0,rate:0});
days['2026-01-08']={shift:{workMinutes:0},work:0,shiftKey:'paid'};check({scheduled:1,attended:1,rate:1});
assert.match(html,/const PILOT_MODE=true/);
console.log(`PASS: ${checks} grant-table cases, anniversary boundaries, paid leave 80% threshold, no double counting, off days, period boundaries, no scheduled days, pilot remains off`);
