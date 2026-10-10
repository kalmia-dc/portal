import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCandidate,ownerPayload,ownerFields} from '../tools/build-incident-owner-rule-candidate.mjs';
import {harness} from './incident-edit-harness.mjs';
const require=createRequire(process.env.PORTAL_TEST_DEPS?path.join(process.env.PORTAL_TEST_DEPS,'package.json'):import.meta.url);
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {ref,set,update,get}=require('firebase/database');
const baseline=JSON.parse(fs.readFileSync(process.env.INCIDENT_RULE_BASELINE||'database.rules.json','utf8'));
test('candidate changes only explicit incident fields and preserves all existing grants',()=>{
 const next=buildCandidate(baseline),stripped=structuredClone(next);
 for(const key of ownerFields)delete stripped.rules.meetingManagement.incidentReports.$reportId[key];
 assert.deepEqual(stripped,baseline);
 assert.deepEqual(ownerPayload({details:'text',createdById:'bad',reporterName:'bad',reportNumber:'bad',countermeasure:'bad',updatedAt:1}),{details:'text',updatedAt:1});
});
test('actual UI save handler with candidate rules saves own content, preserves fixed fields, and retains input after server rejection',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-incident-ui-integration',database:{host:'127.0.0.1',port:9015,rules:JSON.stringify(buildCandidate(baseline))}});
 try{
  const user={active:true,role:'staff',staffId:'author',name:'架空'};
  const report={createdById:'author',reporterId:'author',reporterName:'登録時の名前',reportNumber:'ORIGINAL',type:'near_miss',details:'旧本文',countermeasure:'管理者対策',confirmedBy:'管理者',linkedTaskId:'keep'};
  await env.withSecurityRulesDisabled(c=>set(ref(c.database()),{portalAccess:{users:{owner:user}},meetingManagement:{incidentReports:{one:report}}}));
  const h=harness('staff'),db=env.authenticatedContext('owner').database();
  Object.assign(h.context,{db,ref,update,PATHS:{incidentReports:'meetingManagement/incidentReports'}});
  await h.run("saveIncidentReportEdit('one')");assert.equal(h.messages.at(-1),'報告内容を保存しました');
  const saved=(await get(ref(db,'meetingManagement/incidentReports/one'))).val();
  assert.equal(saved.details,'未保存の架空入力');assert.equal(saved.reportNumber,'ORIGINAL');assert.equal(saved.reporterName,'登録時の名前');assert.equal(saved.countermeasure,'管理者対策');assert.equal(saved.confirmedBy,'管理者');assert.equal(saved.linkedTaskId,'keep');
  // Simulate role revocation after the editor was opened, without changing local identity.
  await env.withSecurityRulesDisabled(c=>set(ref(c.database(),'portalAccess/users/owner/active'),false));
  h.fields.details.value='失敗時も保持';await h.run("saveIncidentReportEdit('one')");assert.match(h.messages.at(-1),/権限がありません/);assert.equal(h.fields.details.value,'失敗時も保持');assert.equal(h.button.disabled,false);
  let writes=0;h.context.update=async()=>{writes++};
  h.context.state.incidentReports[0].reporterId=null;await h.run("saveIncidentReportEdit('one')");assert.equal(writes,0);
  h.context.state.incidentReports[0].reporterId='other';await h.run("saveIncidentReportEdit('one')");assert.equal(writes,0);
 }finally{await env.cleanup()}
});
test('candidate permits only own content update and protects authorship, management, routing, deletion and legacy records',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-incident-owner-candidate',database:{host:'127.0.0.1',port:9015,rules:JSON.stringify(buildCandidate(baseline))}});
 try{
  const users={owner:{active:true,role:'staff',staffId:'a',name:'架空A'},other:{active:true,role:'staff',staffId:'b',name:'架空B'},admin:{active:true,role:'admin',staffId:'admin'},leader:{active:true,role:'staff',staffId:'momo'},terminal:{active:true,role:'terminal',staffId:'a'},revoked:{active:false,role:'staff',staffId:'a'}};
  const report={createdById:'a',reporterId:'a',createdBy:'架空A',reporterName:'架空A',createdAt:1,reportNumber:'TEST',type:'near_miss',occurredDate:'2026-10-10',details:'架空',counterStatus:'confirmed',countermeasure:'保護',linkedTaskId:'keep',extension:{future:'keep'}};
  await env.withSecurityRulesDisabled(c=>set(ref(c.database()),{portalAccess:{users},meetingManagement:{incidentReports:{one:report,legacy:{...report,reporterId:null},imported:{...report,createdById:'admin'},review:{...report,type:'review_required'}}}}));
  const target=(uid,id='one')=>ref(env.authenticatedContext(uid).database(),'meetingManagement/incidentReports/'+id);
  const payload={details:'本人編集',occurredDate:'2026-10-09',type:'accident',category:['1','2'],overview:null,updatedAt:Date.now(),updatedBy:'架空A'};
  await assertSucceeds(update(target('owner'),payload));
  const saved=(await get(target('owner'))).val();assert.equal(saved.details,'本人編集');assert.equal(saved.countermeasure,'保護');assert.equal(saved.linkedTaskId,'keep');assert.equal(saved.extension.future,'keep');
  for(const uid of ['other','terminal','revoked'])await assertFails(update(target(uid),{details:'改変'}));
  for(const id of ['legacy','imported'])await assertFails(update(target('owner',id),{details:'改変'}));
  for(const key of ['createdById','reporterId','createdBy','reporterName','createdAt','reportNumber','counterStatus','countermeasure','meetingReportDate','confirmedAt','confirmedBy','linkedTaskId','linkedNoticeId','routedAt','routedBy','extension']){
   await assertFails(update(target('owner'),{[key]:'forged'}));
   if(Object.hasOwn(report,key))await assertFails(update(target('owner'),{[key]:null}));
  }
  await assertFails(set(target('owner'),null));
  await assertFails(set(target('owner'),{...report,details:'parent overwrite'}));
  await assertFails(update(target('owner'),{details:null}));
  await assertFails(update(target('owner'),{updatedBy:'別人'}));
  await assertFails(update(target('owner'),{updatedAt:Date.now()+600000}));
  await assertFails(update(target('owner','review'),{type:'accident'}));
  await assertSucceeds(update(target('owner','review'),{type:'review_required',details:'確認待ちの本文修正'}));
  await assertFails(update(ref(env.authenticatedContext('owner').database()),{'meetingManagement/incidentReports/one/details':'mixed','meetingManagement/incidentReports/one/countermeasure':'bad'}));
  assert.equal((await get(target('owner'))).val().details,'本人編集');
  await assertSucceeds(set(target('owner','new'),{createdById:'a',reporterId:'a',details:'従来の新規作成'}));
  for(const uid of ['admin','leader'])await assertSucceeds(update(target(uid),{details:'管理者編集',countermeasure:'管理者対応'}));
 }finally{await env.cleanup()}
});
