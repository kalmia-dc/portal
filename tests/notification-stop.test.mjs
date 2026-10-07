import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const shift=fs.readFileSync('shift.html','utf8').replace(/\r\n/g,'\n');
const goal=fs.readFileSync('goal-manager.html','utf8').replace(/\r\n/g,'\n');
function section(s,start,end){const a=s.indexOf(start),b=s.indexOf(end,a+start.length);assert(a>=0&&b>a);return s.slice(a,b);}
function harness(extra={}){const writes=[],network=[];const ctx=vm.createContext({console,Date,window:{_fb:{db:{},ref:(_,p)=>p,set:(p,v)=>writes.push([p,structuredClone(v)])}},fetch:(...a)=>{network.push(a);throw Error('Network forbidden');},...extra});return{ctx,writes,network};}

test('both pages have valid inline scripts and no notification URL or old send controls',()=>{
  for(const [name,html] of [['shift',shift],['goal',goal]]){
    assert.doesNotMatch(html,/kalmia-notify|notifyAttendanceRequest|sendLineWorksSummary|confirmAndNotify/);
    for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
      if(!m[2].trim())continue;
      if(/type=["']module["']/.test(m[1]))new vm.SourceTextModule(m[2],{identifier:name});else new vm.Script(m[2],{filename:name});
    }
  }
  assert.match(shift,/onclick="confirmShift\(\)"/);
  for(const action of ['openGoalModal()','exportCSV()','window.print()','openImportModal()'])assert(goal.includes(action));
});
test('shift confirmation still saves and locks; cancellation does neither; no network',async()=>{
  for(const approved of [true,false]){
    let saved=0,rendered=0;const alerts=[];
    const h=harness({currentYear:2026,currentMonth:9,shiftLocks:{},confirm:()=>approved,alert:x=>alerts.push(x),saveCurrentShift:()=>saved++,monthKey:()=> '2026-10',firebaseSafeKey:k=>k.replace('-','_'),updateLockUI:()=>rendered++});
    vm.runInContext(section(shift,'async function confirmShift()', '// 複数月のシフトデータを保存'),h.ctx);
    await h.ctx.confirmShift();assert.equal(saved,Number(approved));assert.equal(rendered,Number(approved));
    assert.equal(h.writes.length,Number(approved));if(approved)assert.deepEqual(h.writes[0],['shift_locks/2026_10',true]);
    assert.equal(h.network.length,0);assert(alerts.every(x=>!x.includes('通知')));
  }
});
test('paid request preserves validation, pending records and UI updates without sending',()=>{
  for(const comment of ['fixture reason','']){
    const elements={reqResult:{style:{}},reqComment:{value:comment},reqDate:{value:''}};let history=0;
    const h=harness({currentUser:{staffId:'fixture',name:'Fixture'},selectedReqType:'paid',reqDateList:['2026-10-20','2026-10-21'],requestData:[],document:{getElementById:id=>elements[id]},renderReqDateList(){},renderRequestHistory:()=>history++,renderStaffMonthGrid(){},setTimeout(){},saveCurrentShift(){throw Error('Paid pending must not alter shifts');}});
    vm.runInContext(section(shift,'function submitRequest(){','function cancelRequest(id){'),h.ctx);h.ctx.submitRequest();
    assert.equal(h.writes.length,comment?2:0);assert.equal(history,comment?1:0);assert.equal(h.network.length,0);
    for(const [path,value] of h.writes){assert(path.startsWith('requests/'));assert.equal(value.type,'paid');assert.equal(value.status,'pending');assert.equal(value.staffId,'fixture');assert.equal(value.comment,comment);}
    assert.match(elements.reqResult.textContent,comment?/承認待ち/:/理由/);
  }
});
test('goal creation and editing still persist target and actual values without sending',async()=>{
  for(const editingId of [null,'fixture-goal']){
    const values={fItem:'Fixture goal',fMonth:'2026-10',fTarget:'10',fUnit:'件',fDetail:'fixture',fDirection:'up',fCurrent:'2',fActual:'3',fOwner:'Fixture',fNote:''};
    const elements=Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value}]));for(const k of ['saveBtn','monthFilter','entryMonthFilter'])elements[k]={value:''};
    const writes=[],targets=[];let closed=0;
    const h=harness({isEditor:()=>true,saving:false,editingId,allGoals:{'fixture-goal':{department:'fixture dept',targetValue:'old'}},currentUser:{name:'Fixture'},HISTORY_MONTH_COUNT:0,DB_PATH:'monthlyGoals',db:{},document:{getElementById:id=>elements[id]},canonicalGoalItem:x=>x,parseNumber:Number,showToast(){},halfYearTargetRecord:()=>null,saveHalfYearTarget:async(...a)=>targets.push(a),ref:(_,p)=>p,set:async(p,v)=>writes.push([p,v]),push:async(p,v)=>writes.push([p,v]),halfYearStart:m=>m,populateEntryMonthFilter(){},closeGoalModal:()=>closed++});
    vm.runInContext(section(goal,'window.saveGoal = async function() {','window.deleteGoal ='),h.ctx);await h.ctx.window.saveGoal();
    assert.equal(writes.length,1);assert.equal(targets.length,1);assert.equal(targets[0][3],'10');assert.equal(writes[0][1].actualValue,'3');assert.equal(writes[0][1].owner,'Fixture');
    assert.equal(writes[0][0],editingId?'monthlyGoals/fixture-goal':'monthlyGoals');assert(!('targetValue' in writes[0][1]));assert.equal(closed,1);assert.equal(h.ctx.saving,false);assert.equal(h.network.length,0);
  }
});
