import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {todayItems} from '../portal-today.mjs';
const html=fs.readFileSync('attendance.html','utf8');
const ctx=vm.createContext({Date,console});
vm.runInContext(fs.readFileSync('portal-shift-time.js','utf8'),ctx);
const time=ctx.PortalShiftTime;
const ds='2026-10-31',sid='sample';
const standard={early:{label:'通常',start:'08:30',end:'18:30',breakMinutes:90,workMinutes:540}};
const month={sample:{[ds]:'early'},__manualTimes:{sample:{[ds]:{key:'early',start:'09:30',end:'17:15',breakMinutes:45}}}};
test('manual schedule: defaults, validation, reset, category and month isolation',()=>{
 assert.equal(time.resolve({},sid,ds,standard).workMinutes,0);
 assert.equal(time.resolve({sample:{[ds]:'early'}},sid,ds,standard).workMinutes,540);
 assert.equal(time.resolve(month,sid,ds,standard).workMinutes,420);
 assert.equal(time.resolve(JSON.parse(JSON.stringify(month)),sid,ds,standard).start,'09:30');
 assert.equal(time.manualTime(month,sid,'2026-11-01'),null);
 for(const patch of [{key:'late'},{start:'25:00'},{end:'09:00'},{breakMinutes:''},{breakMinutes:-1},{breakMinutes:1.5},{breakMinutes:465}]){
 const m=structuredClone(month);Object.assign(m.__manualTimes.sample[ds],patch);assert.equal(time.manualTime(m,sid,ds),null);
 }
 const reset=structuredClone(month);delete reset.__manualTimes;assert.equal(time.resolve(reset,sid,ds,standard).start,'08:30');
 const paid=structuredClone(month);paid.sample[ds]='paid';assert.equal(time.manualTime(paid,sid,ds),null);
});
test('attendance calculation uses actual planned start, end and rest without altering punches',()=>{
 const lines=html.split('\n');
 for(const prefix of ['const SHIFT_DEF=','function calcDay('])vm.runInContext(lines.find(l=>l.startsWith(prefix)),ctx);
 vm.runInContext(`const shifts={'2026-10':${JSON.stringify(month)}};const punches={};function dayEvents(){return [{type:'in',occurredAt:'2026-10-31T09:40:00'},{type:'out',occurredAt:'2026-10-31T17:00:00'},{type:'breakStart',occurredAt:'2026-10-31T12:00:00'},{type:'breakEnd',occurredAt:'2026-10-31T12:45:00'}];}function parseTs(v){return new Date(v)}function minutesBetween(a,b){return a&&b?Math.max(0,(b-a)/60000):0}function dateKey(){return '2026-10-31'}`,ctx);
 const r=vm.runInContext(`calcDay('${ds}','sample')`,ctx);
 assert.equal(r.shift.workMinutes,420);assert.equal(r.late,10);assert.equal(r.early,15);assert.equal(r.work,395);assert.equal(r.breakMin,45);
});
const source={tasks:{a:{title:'Due',assignees:['Test'],date:'2026-10-04'},b:{assignees:['Other']},c:{assignees:['Test'],date:'2026-10-06'},d:{assignees:['Test'],status:'完了'}},schedule:{yes:{dates:['2026-10-07'],members:['tsuruta']},no:{dates:['2026-10-07'],members:['yamada']},done:{dates:['2026-10-07'],responses:{tsuruta:{'2026-10-07':'o'}}}},meetingTasks:{unread:{title:'Read'},read:{readBy:{tsuruta:{readAt:1}}},review:{status:'review'}},meetingNotices:{notice:{title:'Notice'}},corrections:{c:{status:'pending'}},requests:{r:{type:'paid',status:'pending'},cancel:{type:'paid',status:'pending',cancelled:true}}};
test('role scopes, existing read marks, membership, due groups and links',()=>{
 const staff=todayItems(source,{staffId:'tsuruta',name:'Test',portalRole:'staff'},'2026-10-05');
 assert.equal(staff.filter(x=>x.kind==='タスク').length,1);assert.equal(staff[0].group,'期限切れ');
 assert.equal(staff.filter(x=>x.kind==='日程回答').length,1);
 assert.equal(staff.some(x=>x.kind==='勤怠承認'),false);assert.equal(staff.some(x=>x.id==='read'),false);
 assert.ok(staff.every(x=>x.url.includes('?')));
 for(const p of [{staffId:'guest'},{staffId:'tsuruta',portalRole:'terminal'}])assert.equal(todayItems(source,p).length,0);
 const director=todayItems(source,{staffId:'sugihira',portalRole:'admin'});assert.equal(director.filter(x=>x.kind==='院長確認').length,1);assert.equal(director.filter(x=>x.kind==='勤怠承認').length,2);
 const restricted=todayItems(source,{staffId:'hokari',portalRole:'staff'});assert.equal(restricted.some(x=>x.kind.startsWith('ミーティング')),false);
});
test('all inline scripts parse and all pages include common assets',()=>{
 for(const name of fs.readdirSync('.').filter(n=>n.endsWith('.html'))){const s=fs.readFileSync(name,'utf8');assert.match(s,/portal-common.css/);assert.match(s,/portal-common.js/);for(const [,attrs,code] of s.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(attrs.includes('application/ld+json'))continue;if(attrs.includes('type="module"'))new vm.SourceTextModule(code);else new vm.Script(code);}}
});
test('home subscriptions never request approvals for non-admin or terminal profiles',()=>{
 const home=fs.readFileSync('index.html','utf8');
 const code=home.slice(home.indexOf('function loadMyTasks(staffName){'),home.indexOf('// ─────────────────',home.indexOf('function loadMyTasks(staffName){')));
 for(const [portalRole,staffId] of [['staff','tsuruta'],['trainingAdmin','yamada'],['terminal','sugihira'],['admin','sugihira']]){
   const paths=[];const c=vm.createContext({authenticatedProfile:{portalRole,staffId},noticeTargets:['tsuruta','yamada'],isGuestUser:()=>false,watchToday:(_,p)=>paths.push(p)});
   vm.runInContext('let todayExtraStarted=false;'+code+'loadMyTasks();',c);
   assert.equal(paths.includes('attendance/corrections'),portalRole==='admin');
   assert.equal(paths.includes('requests'),portalRole==='admin');
   if(portalRole==='terminal')assert.equal(paths.length,0);
 }
});
test('meeting deep link waits for its data and opens once through existing routing',()=>{
 const meeting=fs.readFileSync('meeting-management.html','utf8');
 const code=meeting.slice(meeting.indexOf('let initialCaseOpened=false;'),meeting.indexOf('function attachDataListeners()'));
 const state={notices:[],tasks:[]},opened=[];
 const c=vm.createContext({URLSearchParams,location:{search:'?caseKind=notices&caseId=sample'},state,canSeeNotices:()=>true,openRelatedCase:(...args)=>opened.push(args)});
 vm.runInContext(code+'openInitialCase();',c);assert.equal(opened.length,0);
 state.notices.push({id:'sample'});vm.runInContext('openInitialCase();openInitialCase();',c);assert.deepEqual(opened,[['notices','sample']]);
});
