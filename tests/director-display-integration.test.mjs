import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {personName,taskAssignedForDisplay,taskCreatedForDisplay} from '../portal-person-display.mjs';
import {buildBusinessRoster,historyStaffLabel} from '../portal-business-roster.mjs';
import {todayItems} from '../portal-today.mjs';
const html=fs.readFileSync('task-manager.html','utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
test('roster canonical labels preserve raw names, keys and separate explicit persons',()=>{
 const extra={other:{id:'sugihira',name:'杉平',role:'DR'}};const before=JSON.stringify(extra);
 const roster=buildBusinessRoster({extra});
 assert.equal(roster.find(s=>s.id==='sugihira').name,'杉平');
 assert.equal(roster.find(s=>s.id==='sugihira').label,'院長');
 assert.equal(roster.find(s=>s.id==='other').label,'杉平');
 assert.equal(JSON.stringify(extra),before);
 assert.equal(historyStaffLabel(roster,'sugihira','杉平'),'院長');
 assert.equal(historyStaffLabel(roster,'other','杉平'),'杉平');
});
test('task filters and counts agree with home for both director names, preserve ID conflicts and raw data',()=>{
 const base={status:'未着手',date:'2026-01-01',title:'Mock'};
 const tasks={legacy:{...base,assignees:['院長']},legacySurname:{...base,assignees:['杉平']},explicit:{...base,assigneeRefs:[{staffId:'sugihira',name:'Old label'}]},other:{...base,assignees:['院長'],assigneeRefs:[{staffId:'other',name:'院長'}]},creator:{...base,createdBy:'杉平（Google）'},creatorOther:{...base,createdBy:'杉平',createdByStaffId:'other'}};
 const before=JSON.stringify(tasks);
 for(const name of ['杉平','院長']){
  const currentUser={staffId:'sugihira',name,portalRole:'admin'};const nodes={statsBar:{}};
  const c=vm.createContext({currentUser,tasks,currentFilter:'all',taskAssignedForDisplay,taskCreatedForDisplay,BOARD_STATUSES:['未着手','完了'],isOverdue:()=>true,document:{getElementById:id=>nodes[id]}});
  vm.runInContext(section('function taskAssignedTo(','function taskAssigneeRows(')+section('function getFiltered()','// ===== RENDER =====')+section('function renderStats()','function assigneeChips('),c);
  assert.deepEqual(Array.from(vm.runInContext('getFiltered().map(t=>t.id)',c)).sort(),['creator','explicit','legacy','legacySurname']);
  c.currentFilter='mine';const mine=Array.from(vm.runInContext('getFiltered().map(t=>t.id)',c)).sort();
  assert.deepEqual(mine,todayItems({tasks},currentUser).map(t=>t.id).sort());
  vm.runInContext('renderStats()',c);assert(nodes.statsBar.innerHTML.includes('>3</div><div class="stat-label">担当中'));
 }
 assert.equal(JSON.stringify(tasks),before);
});
test('task assignee chips and creator display respect explicit IDs and escape labels',()=>{
 const c=vm.createContext({personName,ROLE_OF:{},esc:s=>String(s).replaceAll('<','&lt;')});
 vm.runInContext(section('function assigneeChips(','function taskCardHtml('),c);
 assert.match(vm.runInContext("assigneeChips(['杉平'],[{staffId:'sugihira',name:'杉平'}])",c),/>院長<\/span>/);
 assert.match(vm.runInContext("assigneeChips(['杉平'],[{staffId:'other',name:'杉平'}])",c),/>杉平<\/span>/);
 assert.match(vm.runInContext("assigneeChips(['<script>'])",c),/&lt;script>/);
});
test('attendance display uses canonical name while Jobcan name matching remains available',()=>{
 const source=fs.readFileSync('attendance.html','utf8');const c=vm.createContext({personName,allStaff:()=>[{id:'sugihira',name:'杉平'}]});
 vm.runInContext(source.slice(source.indexOf('function staffName('),source.indexOf('function isAdmin(')),c);
 assert.equal(vm.runInContext("staffName('sugihira')",c),'院長');
 assert(source.includes("id:'sugihira',name:'杉平'"));
 assert(source.includes('s.name===normalized||s.name===surname'));
});

test('actual task list renders canonical assignee and creator labels; inputs retain historical snapshots',()=>{
 const currentUser={staffId:'sugihira',name:'杉平'};
 const task={title:'Mock old task',status:'未着手',date:'2026-01-01',priority:'med',assignees:['杉平'],assigneeRefs:[{staffId:'sugihira',name:'杉平'}],createdBy:'杉平',createdByStaffId:'sugihira'};
 const children=[];const nodes={viewContainer:{},assigneeGrid:{replaceChildren:()=>children.splice(0),append:(...x)=>children.push(...x)}};
 const c=vm.createContext({personName,taskAssignedForDisplay,taskCreatedForDisplay,currentUser,tasks:{sample:task},currentFilter:'all',BOARD_STATUSES:['未着手','完了'],ROLE_OF:{},businessRoster:{members:buildBusinessRoster()},esc:String,isOverdue:()=>true,daysLeft:()=>-1,fmtDate:()=> '1/1',isToday:()=>false,normalizeStatus:s=>s,latestProgress:()=>null,recurrenceBadge:()=>'',document:{getElementById:id=>nodes[id],createElement:tag=>({tag,dataset:{},children:[],append(...items){this.children.push(...items);}})}});
 vm.runInContext(section('function getFiltered()','// ===== RENDER =====')+section('function assigneeChips(','function taskCardHtml(')+section('function renderList()','// ===== MODAL ====='),c);
 vm.runInContext('renderList()',c);
 assert.match(nodes.viewContainer.innerHTML,/作成: 院長/);
 assert.match(nodes.viewContainer.innerHTML,/>院長<\/span>/);
 assert(!nodes.viewContainer.innerHTML.includes('杉平'));
 c.task=task;vm.runInContext('buildAssigneeGrid(task)',c);
 const controls=children.flatMap(x=>x.children);
 const checkbox=controls.find(x=>x.tag==='input'&&x.dataset.staffId==='sugihira');
 assert.equal(checkbox.value,'杉平');assert.equal(checkbox.checked,true);
 assert.equal(controls.find(x=>x.tag==='label'&&x.htmlFor===checkbox.id).textContent,'院長');
});
