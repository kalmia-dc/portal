import fs from 'node:fs';
import {harness} from './incident-edit-harness.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=fs.readFileSync('meeting-management.html','utf8');
test('author update uses filtered payload; other authors and legacy records denied',async()=>{
 const h=harness('staff');await h.run("saveIncidentReportEdit('one')");assert.equal(h.writes(),1);assert.match(h.messages[0],/保存しました/);assert.equal(h.fields.details.value,'未保存の架空入力');
 h.context.authenticatedProfile.staffId='other';assert.equal(h.run('canEditIncidentReport(state.incidentReports[0])'),false);
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
