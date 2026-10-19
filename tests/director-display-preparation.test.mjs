import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {personDisplayName,personMatchesForDisplay,taskAssignedForDisplay,taskCreatedForDisplay,withPersonDisplay} from '../portal-person-display.mjs';
import {todayItems} from '../portal-today.mjs';
const director=Object.freeze({staffId:'sugihira',name:'杉平',portalRole:'admin'});

test('director aliases display consistently without changing IDs or historical names',()=>{
 for(const name of ['杉平','院長','杉平院長']){
  const raw=Object.freeze({id:'sugihira',name,role:'DR',active:true});
  assert.equal(personDisplayName({staffId:raw.id,name}),'院長');
  assert.equal(personDisplayName({name}),'院長');
  assert.deepEqual(withPersonDisplay(raw),{...raw,displayName:'院長'});
  assert.equal(raw.name,name);
 }
 assert.equal(personDisplayName({name:'杉平（Google）'}),'院長（Google）');
 assert.equal(personDisplayName({staffId:'sugihira',name:'Older name'}),'院長');
});

test('explicit other IDs override name aliases; no substring replacements',()=>{
 for(const name of ['杉平','院長','杉平院長']){
  assert.equal(personDisplayName({staffId:'different-person',name}),name);
  assert.equal(personMatchesForDisplay({staffId:'different-person',name},director),false);
 }
 for(const name of ['杉平さんからの連絡','副院長','杉平 太郎'])assert.equal(personDisplayName({name}),name);
 assert.equal(personMatchesForDisplay({name:'院長'},null),false);
});

test('legacy assignment and creator aliases agree; explicit and empty references stay authoritative',()=>{
 for(const name of ['杉平','院長','杉平院長']){
  assert(taskAssignedForDisplay({assignees:[name]},director));
  assert(taskAssignedForDisplay({assigneeRefs:[{name}]},director));
  assert(taskCreatedForDisplay({createdBy:name},director));
  assert(taskCreatedForDisplay({createdBy:name+'（Google）'},director));
  assert.equal(taskCreatedForDisplay({createdBy:name,createdByStaffId:'different-person'},director),false);
  assert.equal(taskAssignedForDisplay({assignees:[name],assigneeRefs:[]},director),false);
  assert.equal(taskAssignedForDisplay({assignees:[name],assigneeRefs:[{staffId:'different-person',name}]},director),false);
 }
 assert(taskAssignedForDisplay({assigneeRefs:[{staffId:'sugihira',name:'Old label'}]},director));
});

test('top and task page share legacy and explicit-ID ownership rules',()=>{
 const html=fs.readFileSync('task-manager.html','utf8');
 const c=vm.createContext({currentUser:director,taskAssignedForDisplay});
 vm.runInContext(html.slice(html.indexOf('function taskAssignedTo('),html.indexOf('function taskAssigneeRows(')),c);
 const task={title:'Mock',status:'未着手',date:'2026-01-01',assignees:['院長']};
 c.task=task;
 assert.equal(vm.runInContext('taskAssignedTo(task)',c),true);
 assert.equal(todayItems({tasks:{sample:task}},director,'2026-10-19').length,1);
 assert.equal(taskAssignedForDisplay(task,director),true);
 const different={...task,assigneeRefs:[{staffId:'other',name:'院長'}]};
 assert.equal(taskAssignedForDisplay(different,director),false);
 assert.equal(todayItems({tasks:{sample:different}},director,'2026-10-19').length,0);
});

test('Momo paid-action ownership and director correction/proxy routes are unchanged',()=>{
 const source={requests:{paid:{type:'paid',status:'pending'}},corrections:{correction:{status:'pending'}}};
 assert.equal(todayItems(source,director).some(x=>x.id==='paid'),false);
 assert.equal(todayItems(source,{staffId:'momo',portalRole:'admin'}).some(x=>x.id==='paid'),true);
 assert(todayItems(source,director).some(x=>x.id==='correction'));
 const html=fs.readFileSync('attendance.html','utf8');
 assert(html.includes("function isAdmin(){return authenticatedProfile.portalRole==='admin'}"));
});
