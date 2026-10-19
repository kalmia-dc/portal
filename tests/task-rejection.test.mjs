import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../meeting-management.html',import.meta.url),'utf8');
const actions=source.slice(source.indexOf('async function updateTaskStatus'),source.indexOf('async function saveProgress'));
const render=source.slice(source.indexOf('function taskRejectionHtml'),source.indexOf('function taskReadButtonHtml'));
const setup="let director=true,fail=false,counter=0;const pageLifecycle={active:true},state={tasks:[{id:'fixture',status:'review'}]},currentUser={staffId:'sugihira',name:'院長'},PATHS={tasks:'tasks'},db={},DIRECTOR_ID='sugihira';const isDirector=()=>director,isLeader=()=>!director,taskStatus=t=>t.status,ref=(_,p='')=>p,push=()=>({key:String(++counter)}),cssEscape=x=>x,showToast=()=>{},formatDate=x=>new Date(x).toLocaleString('ja-JP'),esc=x=>String(x).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));let writes=[];async function update(_,values){if(fail)throw Error('offline');writes.push(values);for(const [p,v]of Object.entries(values)){const keys=p.split('/').slice(2),last=keys.pop();let o=state.tasks[0];for(const k of keys)o=o[k]??={};if(v===null)delete o[last];else o[last]=v;}}";
test('director-only rejection requires reason, saves atomically, keeps history through resubmission and completion',async()=>{
const c=vm.createContext({});vm.runInContext(setup+actions+render,c);
await assert.rejects(vm.runInContext("updateTaskStatus('fixture','in_progress',{rejected:true,reason:'  '})",c));
assert.equal(vm.runInContext('writes.length',c),0);
vm.runInContext('director=false',c);await vm.runInContext("updateTaskStatus('fixture','in_progress',{rejected:true,reason:'denied'})",c);assert.equal(vm.runInContext('writes.length',c),0);
vm.runInContext('director=true;fail=true',c);await assert.rejects(vm.runInContext("updateTaskStatus('fixture','in_progress',{rejected:true,reason:'retry'})",c));assert.equal(vm.runInContext('state.tasks[0].status',c),'review');
vm.runInContext('fail=false',c);await vm.runInContext("updateTaskStatus('fixture','in_progress',{rejected:true,reason:' <修正>を確認\\n再申請してください '})",c);
assert.equal(vm.runInContext('writes.length',c),1);assert.equal(vm.runInContext('state.tasks[0].status',c),'in_progress');assert.match(vm.runInContext('taskRejectionHtml(state.tasks[0])',c),/&lt;修正&gt;/);
vm.runInContext('director=false',c);await vm.runInContext("updateTaskStatus('fixture','review')",c);assert.match(vm.runInContext('taskRejectionHtml(state.tasks[0])',c),/再申請してください/);
vm.runInContext('director=true',c);await vm.runInContext("updateTaskStatus('fixture','confirmed')",c);assert.match(vm.runInContext('taskRejectionHtml(state.tasks[0])',c),/再申請してください/);
});