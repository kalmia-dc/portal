import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHarness} from './shift-admin-harness.mjs';
const read=f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
const task=read('task-manager.html');
const slice=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
function taskHarness(source,days,status){
 const el={innerHTML:''},record={id:'fixture',title:'確認用',status,date:'2026-10-21',priority:'med'};
 const c=vm.createContext({normalizeStatus:s=>s,isOverdue:()=>days<0,daysLeft:()=>days,isToday:()=>days===0,fmtDate:()=> '10/21',esc:String,assigneeChips:()=>'',taskAssigneeRows:()=>[],latestProgress:()=>null,recurrenceBadge:()=>'',currentUser:{name:'確認用'},taskCreatedForDisplay:()=>false,taskAssignedTo:()=>false,personMatchesForDisplay:()=>false,personName:s=>s,isGuestUser:()=>true,getFiltered:()=>[record],document:{getElementById:()=>el}});
 vm.runInContext(slice(source,'function taskCardHtml(','function renderBoard(')+slice(source,'function renderList()','// ===== ASSIGNEE GRID ====='),c);
 return {card:c.taskCardHtml(record),list:()=>{c.renderList();return el.innerHTML;},record};
}
test('completed cards and lists never show countdowns; pending rendering remains byte-identical',()=>{
 const original=execFileSync('git',['show','HEAD:task-manager.html'],{encoding:'utf8'});
 for(const days of [-23,-1,0,1,3,4])for(const status of ['完了','未着手','着手中','保留']){
   const result=taskHarness(task,days,status),before=JSON.stringify(result.record);
   if(status==='完了'){for(const html of [result.card,result.list()]){assert.doesNotMatch(html,/あと-?\d+日|今日|期限切れ/);assert.match(html,/10\/21/);}}
   else {const old=taskHarness(original,days,status);assert.equal(result.card,old.card);assert.equal(result.list(),old.list());}
   assert.equal(JSON.stringify(result.record),before);
 }
});
test('exact staff ID alone excludes test; same-name and similar IDs remain',()=>{
 const c=vm.createContext({});vm.runInContext(read('portal-statistics.js'),c);
 assert.equal(c.isNormalStatisticsStaff('test'),false);
 for(const id of ['test2','contest','TEST','sugihira',''])assert.equal(c.isNormalStatisticsStaff(id),true);
});
test('shift counts, monthly summary, print and CSV exclude test while records remain',async()=>{
 const h=await makeHarness();
 h.run(`STAFF=[{id:'test',name:'test',role:'DH',type:'full'},{id:'test2',name:'test',role:'DH',type:'full'}];shiftData={test:{'2026-10-21':'early'},test2:{'2026-10-21':'early'}};orderedShiftStaff=()=>STAFF;visibleShiftStaff=()=>STAFF;`);
 const before=h.run('JSON.stringify(shiftData)');
 assert.equal(h.run("countRoleStaffing('DH','2026-10-21')"),1);
 assert.equal(h.run("countCoreDh('2026-10-21')"),1);
 assert.equal(h.run("countCoreDrDh('2026-10-21')"),1);
 assert.ok(h.run("getHours('test',2026,9)")>0);
 h.run('renderSummary();renderClinicHours()');
 assert.equal((h.field('summaryList').innerHTML.match(/<span>test<\/span>/g)||[]).length,1);
 assert.equal((h.field('clinicHoursSummary').innerHTML.match(/test：/g)||[]).length,1);
 h.run('printShift();');assert.equal((h.field('printArea').innerHTML.match(/class="print-staff-row"/g)||[]).length,2);
 h.run('printShiftOnePage();');assert.equal((h.field('printArea').innerHTML.match(/class="one-staff /g)||[]).length,1);
 h.run(`var exported='';Blob=function(parts){exported=parts.join('')};URL={createObjectURL:()=>''};const create=document.createElement;document.createElement=tag=>tag==='a'?{click(){}}:create(tag);exportCSV();`);
 assert.equal(h.run("exported.split('\\n').length"),2);
 assert.equal(h.run('JSON.stringify(shiftData)'),before);assert.equal(h.state.writes.length,0);
});
test('home attendance display excludes the test ID without dropping same-name staff',async()=>{
 const html=read('index.html'),el={innerHTML:''};
 const c=vm.createContext({document:{getElementById:()=>el},rosterPage:{active:true},businessRoster:{members:[{id:'test',label:'EXCLUDED',role:'DH'},{id:'test2',label:'test',role:'DH'}]},ROLE_LABELS:{DH:'衛生士'},escHtml:String,getMonthShifts:async()=>({test:{'2026-10-21':'early'},test2:{'2026-10-21':'early'}})});
 vm.runInContext(read('portal-statistics.js')+slice(html,'async function buildTodayStaff','// ─────────────────────────────────────────\n// Firebase'),c);
 await c.buildTodayStaff(new Date(2026,9,21));assert.doesNotMatch(el.innerHTML,/EXCLUDED/);assert.match(el.innerHTML,/test/);
});
test('attendance normal month display/export exclude test but personal history and backups retain it',()=>{
 const html=read('attendance.html'),fields=new Map(),field=id=>{if(!fields.has(id))fields.set(id,{value:'2026-10',innerHTML:''});return fields.get(id)};
 const members=[{id:'test',name:'EXCLUDED'},{id:'test2',name:'test'}];let downloaded;
 const c=vm.createContext({user:{staffId:'owner'},isAdmin:()=>true,corrections:{},shiftRequests:{},monthLocks:{},allStaff:()=>members,monthStaff:()=>members,leaveCompliance:()=>null,focusApprovalFromUrl(){},$:field,personName:s=>s,fmtMin:String,calcMonth:()=>({rows:[{work:60}],totals:{work:60,scheduledOver:0,statutoryOver:0,missing:0}}),excelRows:id=>[['header'],[id,60]],rowsToExcel:x=>JSON.stringify(x),downloadBlob:x=>{downloaded=x;}});
 vm.runInContext(read('portal-statistics.js')+slice(html,'function renderAdmin()','window.approveItem=')+html.split('\n').find(l=>l.startsWith('function exportAllStaff()')),c);
 c.renderAdmin();assert.doesNotMatch(field('adminMonthlyBody').innerHTML,/EXCLUDED/);assert.match(field('adminMonthlyBody').innerHTML,/test/);
 c.exportAllStaff();assert.deepEqual(JSON.parse(downloaded),[['header'],['test2',60]]);
 const original=execFileSync('git',['show','HEAD:attendance.html'],{encoding:'utf8'});
 for(const prefix of ['const monthStaff=','function exportBackup()','function exportExcel()','async function lockMonth()','function initSelects()'])assert.equal(html.split('\n').find(l=>l.startsWith(prefix)),original.split('\n').find(l=>l.startsWith(prefix)));
});
