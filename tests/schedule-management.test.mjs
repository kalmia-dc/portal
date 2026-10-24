import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=fs.readFileSync('schedule.html','utf8').replace(/\r\n/g,'\n');
const part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
test('management entry requires an authenticated administrator',()=>{
  const code=part('const managementMode =','const businessRoster =');
  for(const admin of [true,false,undefined]) {
    const notices=[];
    const c={URLSearchParams,location:{search:'?manage=1'},authenticatedProfile:{isAdmin:admin},document:{getElementById:()=>({before:n=>notices.push(n)}),createElement:()=>({setAttribute(){}})}};
    vm.createContext(c);
    if(admin) {vm.runInContext(code,c);assert.equal(notices.length,1);}
    else assert.throws(()=>vm.runInContext(code,c),/Administrator required/);
  }
});
test('actual boot reads events but never notifies or auto-answers in management mode',async()=>{
  const boot=part('(async function() {','</script>');
  for(const managementMode of [true,false]) {
    const calls=[];
    const c={managementMode,URLSearchParams,location:{search:'?manage=1&evid=event'},authenticatedProfile:{staffId:'sugihira'},STAFF:[{id:'sugihira'}],state:{events:{event:{}}},document:{body:{classList:{toggle(){}}}},render(){},rosterPage:{active:true},loadEvents:async()=>calls.push('read'),isGuestUser:()=>false,autoFillExpired:async()=>calls.push('answer'),checkScheduleDeadlines:()=>calls.push('notify'),window:{location:{}}};
    vm.createContext(c);await vm.runInContext(boot,c);
    assert.deepEqual(calls,managementMode?['read']:['read','answer','notify']);
    assert.equal(c.state.currentEventId,'event');
  }
});
test('opening edit attaches once, one click excludes one person, save executes once',async()=>{
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{dataset:{mid:id},style:{},listeners:{},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)},value:id==='edit-ev-name'?'fixture':'2026-10-24'});return elements.get(id)};
  const people=[{id:'shinoda',role:'DR'},{id:'test',role:'DH'},{id:'hanowa',role:'DH'}];
  const chips=people.map(s=>element(s.id)),writes=[];
  const c={window:{},state:{events:{e:{name:'fixture',dates:['2026-11-08']}},currentEventId:'e'},Date,Set,EVENT_STAFF:people,STAFF:people,document:{querySelectorAll:()=>chips,getElementById:id=>element(id)},refreshEditCalendar(){},cancelEditEvent(){},canManageCurrentEvent:()=>true,toast(){},rosterPage:{active:true},businessRoster:{complete:true},scheduleMembers:(staff,event)=>staff.filter(s=>event.members?.includes(s.id)),ref:()=>null,db:{},DB_PATH:'events',update:async(_,patch)=>writes.push(patch)};
  vm.createContext(c);
  vm.runInContext(part('function attachMemberHandlers(','// ───'),c);
  vm.runInContext(part('function attachEditEventHandlers()','window.cancelEditEvent'),c);
  c.render=()=>{if(c.state.view==='editEvent')vm.runInContext('attachEditEventHandlers()',c)};
  vm.runInContext(part('window.openEditEvent =','function renderEditEventForm'),c);
  c.window.openEditEvent();
  assert.equal(element('shinoda').listeners.click.length,1);
  element('shinoda').listeners.click[0]();
  assert.deepEqual([...c.state.editMembers],['test','hanowa']);
  assert.equal(element('edit-save-btn').listeners.click.length,1);
  await element('edit-save-btn').listeners.click[0]();
  assert.equal(writes.length,1);assert.deepEqual([...writes[0].members],['test','hanowa']);
});
test('inline scripts parse',()=>{for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(m[2].trim()) /type=["\x27]module/.test(m[1])?new vm.SourceTextModule(m[2]):new vm.Script(m[2]);}});