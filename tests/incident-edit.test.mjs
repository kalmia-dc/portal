import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=fs.readFileSync('meeting-management.html','utf8');
function harness(role='admin',leader=false){
 const fields=Object.fromEntries(Object.entries({reportNumber:'TEST-1',type:'near_miss',occurredDate:'2026-10-10',details:'未保存の架空入力'}).map(([key,value])=>[key,{dataset:{field:key},value}]));
 const button={disabled:false};const panel={hidden:false,dataset:{incidentEditPanel:'one'},querySelectorAll:()=>Object.values(fields),querySelector:()=>button};
 const report={id:'one',createdById:'author',type:'near_miss'};const messages=[];let writes=0;
 const context=vm.createContext({Map,Set,Object,Date,authenticatedProfile:{portalRole:role},currentUser:{staffId:'author',name:'架空'},state:{incidentReports:[report]},isDirector:()=>role==='admin',isLeader:()=>leader,incidentTypeKey:()=>report.type,canChangeIncidentType:()=>true,buildIncidentReportNumber:()=>'',formatIncidentOccurredAt:()=>'',parseCategoryCodes:()=>[],cssEscape:x=>x,showToast:x=>messages.push(x),db:{},PATHS:{incidentReports:'reports'},ref:(_,p)=>p,update:async()=>{writes++},document:{querySelectorAll:()=>[panel],querySelector:q=>q.includes('data-action')?button:fields[/data-field="([^"]+)"/.exec(q)?.[1]]||{value:''}}});
 const run=s=>vm.runInContext(s,context);
 run('const incidentEditDrafts=new Map(),incidentEditSaving=new Set();');
 run(html.slice(html.indexOf('function rememberIncidentEdits()'),html.indexOf('function renderIncidentReports()')));
 run(html.slice(html.indexOf('function canEditIncidentReport('),html.indexOf('function canChangeIncidentType(')));
 run(html.slice(html.indexOf('async function saveIncidentReportEdit('),html.indexOf('async function saveIncidentFollowup(')));
 return {run,context,fields,panel,button,messages,writes:()=>writes};
}
test('author update is stopped under existing policy without losing input; other authors denied',async()=>{
 const h=harness('staff');await h.run("saveIncidentReportEdit('one')");assert.equal(h.writes(),0);assert.match(h.messages[0],/管理者・リーダーのみ/);assert.equal(h.fields.details.value,'未保存の架空入力');
 h.context.currentUser.staffId='other';assert.equal(h.run('canEditIncidentReport(state.incidentReports[0])'),false);
});
test('realtime rerender restores open draft rather than replacing it with server values',()=>{
 const h=harness();h.run('rememberIncidentEdits()');h.fields.details.value='古いサーバー値';h.panel.hidden=true;h.run('restoreIncidentEdits()');assert.equal(h.fields.details.value,'未保存の架空入力');assert.equal(h.panel.hidden,false);
});
test('permission and network failures retain draft and permit retry; double saves are blocked',async()=>{
 for(const code of ['PERMISSION_DENIED','NETWORK_ERROR']){
  const h=harness();let reject;let calls=0;h.context.update=()=>{calls++;return new Promise((_,r)=>reject=r)};
  const first=h.run("saveIncidentReportEdit('one')");await h.run("saveIncidentReportEdit('one')");assert.equal(calls,1);assert.equal(h.button.disabled,true);
  h.fields.details.value='old';h.panel.hidden=true;h.run('restoreIncidentEdits()');reject({code});await first;
  assert.equal(h.fields.details.value,'未保存の架空入力');assert.equal(h.button.disabled,false);assert.match(h.messages[0],code==='PERMISSION_DENIED'?/権限がありません/:/接続を確認/);
  h.context.update=async()=>{};await h.run("saveIncidentReportEdit('one')");assert.equal(h.messages.at(-1),'報告内容を保存しました');
 }
});
test('existing leader edit remains allowed and draft state initializes before boot',async()=>{
 const h=harness('staff',true);await h.run("saveIncidentReportEdit('one')");assert.equal(h.writes(),1);assert(html.indexOf('const incidentEditDrafts')<html.indexOf('  boot();'));
 assert(html.includes('function renderIncidentReports() {\n  rememberIncidentEdits();')||html.includes('function renderIncidentReports() {\r\n  rememberIncidentEdits();'));
});
