import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('shift.html','utf8'),nodes=new Map();
const node=()=>({children:[],style:{},classList:{add(){},remove(){},contains:()=>false},appendChild(n){this.children.push(n)},addEventListener(){},querySelectorAll(){return this.children},value:'',checked:false,textContent:'',innerHTML:''});
const field=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
let answer=true,confirmation='';
const c=vm.createContext({console,structuredClone,Date,Math,Set,Object,Array,String,Number,JSON,Error,URLSearchParams,
 alert(){},confirm:s=>{confirmation=s;return answer},setTimeout(){},fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('portal-holidays.json'))}),
 window:{addEventListener(){}},document:{getElementById:field,querySelectorAll:()=>[],createElement:node,body:node()},localStorage:{getItem:()=>null},location:{search:'',hash:''}});
const run=s=>vm.runInContext(s,c);
for(const file of ['clinic-leave.js','shift-role-balance.js','shift-entry.js','shift-staff-month.js','shift-member-access.js','shift-staff-order.js'])run(fs.readFileSync(file,'utf8'));
run([...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].find(([,a,s])=>!a&&s.includes('const SHIFT'))[2]);
await run('window.__holidayDataReady');
run("var confirmationResult=requestShiftEntryConfirmation('対象確認')");
assert.equal(field('shiftEntryConfirm').hidden,false);assert.equal(field('applyShiftButton').disabled,true);
run('finishShiftEntryConfirmation(false)');assert.equal(await run('confirmationResult'),false);assert.equal(field('shiftEntryConfirm').hidden,true);
run('requestShiftEntryConfirmation=async message=>confirm(message)');
run(`currentYear=2026;currentMonth=9;currentUser={role:'admin'};render=()=>{};
STAFF=[{id:'test_dr',name:'架空医師',role:'DR',type:'spot'},{id:'test_dh',name:'架空衛生士',role:'DH',type:'full'}];
var initial={test_dr:{'2026-10-05':'early','2026-10-06':'late'},test_dh:{'2026-10-05':'early'},__manualTimes:{test_dr:{'2026-10-05':{key:'early',start:'09:00',end:'17:00',breakMinutes:60}}}};
var data=structuredClone(initial),writes=0,denied=false,locked=false,hold=null;
window._fb={shiftConnected:true,readMembersFromServer:async()=>({}),db:{},ref:(_,p)=>p,get:async()=>({val:()=>locked}),runTransaction:async(p,fn)=>{
 if(p!=='shifts/2026-10')throw Error('unexpected write path');
 if(hold)await hold;if(denied)throw Error('PERMISSION_DENIED');
 const next=fn(structuredClone(data));if(next===undefined)return {committed:false};data=next;writes++;return {committed:true,snapshot:{val:()=>structuredClone(data)}};
}};
function reload(){allShiftData={'2026-10':structuredClone(data)};loadShiftForMonth(2026,9);openModal('test_dr','2026-10-05');}reload();`);
assert(field('shiftChoices').children.some(n=>n.innerHTML.includes('通常')));
assert(!field('shiftChoices').children.some(n=>n.innerHTML.includes('ハノワ')));
answer=false;await run('cancelOrRestoreShift()');assert.equal(run('writes'),0);
answer=true;await run('cancelOrRestoreShift()');assert.match(confirmation,/架空医師（DR） 2026-10-05/);assert.match(confirmation,/09:00〜17:00/);
assert.equal(run("data.test_dr['2026-10-05']"),undefined);assert.equal(run("data.test_dr['2026-10-06']"),'late');assert.equal(run("data.test_dh['2026-10-05']"),'early');
assert.equal(run("getHours('test_dr',2026,9)"),8.5);
run('reload()');assert.equal(field('restoreShiftButton').style.display,'');await run('cancelOrRestoreShift(true)');
assert.equal(run("data.test_dr['2026-10-05']"),'early');assert.equal(run("manualTimeFor('test_dr','2026-10-05').start"),'09:00');
// Server rejection, disconnection, month lock and role guards leave the stored entry unchanged.
for(const setup of ['denied=true','window._fb.shiftConnected=false','locked=true',"currentUser={role:'staff'}"]){
 run('reload();'+setup);const before=run('writes');await run('cancelOrRestoreShift()');assert.equal(run('writes'),before);
 run("denied=false;window._fb.shiftConnected=true;locked=false;currentUser={role:'admin'}");
}
// Stale cell must not remove another editor's work.
run("reload();data.test_dr['2026-10-05']='late'");await run('cancelOrRestoreShift()');assert.equal(run("data.test_dr['2026-10-05']"),'late');assert.match(field('manualTimeError').textContent,/別の更新/);
// A transaction queued through a disconnect stays pending, blocks double-click and cannot close.
run("data=structuredClone(initial);reload();var release;hold=new Promise(r=>release=r);var saving=cancelOrRestoreShift()");
await Promise.resolve();await run('cancelOrRestoreShift()');run('closeModal()');assert.equal(run('modalStaffId'),'test_dr');
const before=run('writes');run('release();hold=null');await run('saving');assert.equal(run('writes'),before+1);
// Restore refuses a concurrent replacement; saving a fresh entry retires its old undo record.
run("reload();data.test_dr['2026-10-05']='late'");await run('cancelOrRestoreShift(true)');assert.equal(run("data.test_dr['2026-10-05']"),'late');
run("reload();modalSelected='early'");field('manualTimeEnabled').checked=false;await run('applyModal()');assert.equal(run("data.__cancelledShifts.test_dr['2026-10-05']"),undefined);
// DR contributes only to the existing DR+DH rules, never to DH+DA/HANOWA assignment.
run("shiftData={test_dh:{'2026-10-05':'early'}}");const dhda=run("countCoveredDhDa('2026-10-05')"),drdh=run("countCoveredDrDh('2026-10-05')");
run("shiftData.test_dr={'2026-10-05':'early'}");assert.equal(run("countCoveredDhDa('2026-10-05')"),dhda);assert.equal(run("countCoveredDrDh('2026-10-05')"),drdh+1);assert.equal(run("isHanowaAssigned('2026-10-05')"),false);
console.log('PASS: DR spot choice; cancel/restore with times; reload; unrelated entries; confirmation cancellation; offline/denied/lock/role; concurrent edit; pending double-click; replacement; role coverage');
