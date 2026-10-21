import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../task-manager.html',import.meta.url),'utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function harness(task={}) {
  const element=tag=>({tag,dataset:{},style:{},children:[],classList:{add(){}},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];}});
  const nodes={assigneeGrid:element('div')};
  const inputs=()=>nodes.assigneeGrid.children.flatMap(e=>e.children).filter(e=>e.tag==='input');
  const document={createElement:element,getElementById:id=>nodes[id]??=(element('div')),
    querySelector:s=>nodes[s]??=element('input'),querySelectorAll:s=>inputs().filter(e=>!s.endsWith(':checked')||e.checked)};
  const c=vm.createContext({document,businessRoster:{members:[
    {id:'alpha',name:'同名',label:'同名',availability:'active'},
    {id:'beta',name:'乙',label:'乙',availability:'unknown'},
    {id:'stopped',name:'停止',label:'停止',availability:'stopped'}]},
    personName:n=>n,currentUser:{staffId:'alpha',name:'別の表示名'},tasks:{sample:task},editingId:null,
    isGuestUser:()=>false,setModalReadonly:()=>{},renderProgressLogs:()=>'',normalizeRecurrence:()=> 'none',
    normalizeStatus:s=>s||'未着手',ACTIVE_STATUSES:['未着手'],gAccessToken:null,
    pageLifecycle:{timeout(){throw Error('Unexpected delayed focus');}}});
  vm.runInContext(section('function taskAssigneeRows(','function closeModal('),c);
  const saved=()=>JSON.parse(vm.runInContext("JSON.stringify([...document.querySelectorAll('.assignee-checkbox:checked')].map(cb => ({staffId:cb.dataset.staffId || '', name:cb.value})))",c));
  return {c,nodes,inputs,saved};
}
test('editing retains unlinked names separately from matching roster names and keeps source intact',()=>{
  const task={assignees:['同名','旧担当']},before=JSON.stringify(task),h=harness(task);
  vm.runInContext("openModal('sample')",h.c);
  assert.deepEqual(h.saved(),[{staffId:'',name:'同名'},{staffId:'',name:'旧担当'}]);
  const regular=h.inputs().find(e=>e.dataset.staffId==='alpha'),legacy=h.inputs().find(e=>e.value==='同名'&&!e.dataset.staffId);
  assert.equal(regular.checked,false);assert.equal(legacy.checked,true);
  regular.checked=true;legacy.checked=false;
  assert.deepEqual(h.saved(),[{staffId:'alpha',name:'同名'},{staffId:'',name:'旧担当'}]);
  assert.equal(JSON.stringify(task),before);
  assert.equal(new Set(h.inputs().map(e=>e.id)).size,h.inputs().length);
  for(const row of h.nodes.assigneeGrid.children){assert.equal(row.children[1].htmlFor,row.children[0].id);assert.equal(row.children[0].type,'checkbox');}
});
test('explicit stopped and missing IDs remain historical choices with their original snapshots',()=>{
  const refs=[{staffId:'alpha',name:'旧表示名'},{staffId:'stopped',name:'保存名'},{staffId:'missing',name:'削除か不明'}];
  const h=harness({assigneeRefs:refs});vm.runInContext("openModal('sample')",h.c);
  assert.deepEqual(h.saved(),refs);
});
test('new task selects self by exact staff ID only; editing never adds self',()=>{
  const h=harness({assignees:['旧担当']});vm.runInContext('openModal()',h.c);
  assert.deepEqual(h.saved(),[{staffId:'alpha',name:'同名'}]);
  vm.runInContext("openModal('sample')",h.c);assert.deepEqual(h.saved(),[{staffId:'',name:'旧担当'}]);
  vm.runInContext("currentUser={name:'同名'};openModal()",h.c);assert.deepEqual(h.saved(),[]);
});
test('controls declare visible native checkbox, label-sized target, wrapping and keyboard focus style',()=>{
  assert.match(html,/id="assigneeGrid" class="assignee-grid"/);
  assert.match(html,/\.assignee-grid\s*\{[^}]*flex-wrap:\s*wrap/);
  const css=html.match(/\.assignee-checkbox\s*\{([^}]+)\}/)[1];
  assert(!/display:\s*none|visibility:\s*hidden|appearance:\s*none/.test(css));
  assert.match(html,/\.assignee-label\s*\{[^}]*min-height:\s*44px/);
  assert.match(html,/\.assignee-checkbox:focus-visible \+ \.assignee-label/);
  assert(!section('function openModal(','function closeModal(').includes('.focus('));
});
