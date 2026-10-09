import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {todayItems,localDay} from '../portal-today.mjs';
const html=fs.readFileSync('index.html','utf8');
function setup(admin=false){
 const nodes=new Map();const field=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',style:{},classList:{add(){},remove(){}},setAttribute(){}});return nodes.get(id)};
 const callbacks={};
 const c=vm.createContext({console:{warn(){}},Date,URL,Set,authenticatedProfile:{staffId:'test',name:'確認ユーザー',portalRole:admin?'admin':'staff',isAdmin:admin},currentUser:{staffId:'test',name:'確認ユーザー'},ADMIN_STAFF:['test'],homeViewMode:admin?'admin':'staff',isGuestUser:()=>false,todayItems:(s,p)=>todayItems(s,p,'2026-10-09'),window:{location:{href:'https://kalmia-dc.github.io/portal/index.html',origin:'https://kalmia-dc.github.io'}},document:{getElementById:field},_db:{},ref:(_,p)=>p,onValue:(p,ok,error)=>{callbacks[p]={ok,error}},fetch:async()=>({ok:true,json:async()=>[]})});
 const run=s=>vm.runInContext(s,c);
 run(html.slice(html.indexOf('let noticeHistoryExpanded'),html.indexOf('async function deleteNotice')));
 run(html.slice(html.indexOf('const todaySources='),html.indexOf('function loadMyTasks(')));
 return {c,run,field,callbacks};
}
test('priority lane precedes functions; independent subscriptions start before slower personal reads',()=>{
 for(const id of ['homePriorities','heroTaskCard','deadlineNotice','importantNoticeCard'])assert(html.indexOf('id="'+id+'"')<html.indexOf('id="homeFunctions"'),id);
 const init=html.slice(html.indexOf('async function initApp()'),html.indexOf('async function buildWeek('));
 assert(init.indexOf('loadMyTasks(u.name)')<init.indexOf('await '));assert(init.indexOf('loadScheduleEvents(u.staffId)')<init.indexOf('await '));assert(init.indexOf('startNoticeSync()')<init.indexOf('await '));
});
test('Japan date rollover preserves overdue/today/waiting rules without inventing future-task priority',()=>{
 assert.equal(localDay(new Date('2026-10-08T14:59:59Z')),'2026-10-08');assert.equal(localDay(new Date('2026-10-08T15:00:00Z')),'2026-10-09');
 const source={tasks:{old:{title:'期限切れ',assignees:['確認ユーザー'],date:'2026-10-08'},today:{title:'今日',assignees:['確認ユーザー'],date:'2026-10-09'},future:{title:'将来',assignees:['確認ユーザー'],date:'2026-10-10'},done:{title:'完了',status:'完了',assignees:['確認ユーザー'],date:'2026-10-08'},other:{title:'他人',assignees:['別人'],date:'2026-10-08'}},corrections:{approval:{status:'pending'}}};
 const staff=todayItems(source,{staffId:'test',name:'確認ユーザー',portalRole:'staff'},'2026-10-09');assert.deepEqual(staff.map(x=>x.title),['期限切れ','今日']);
 const admin=todayItems(source,{staffId:'test',name:'確認ユーザー',portalRole:'admin'},'2026-10-09');assert.deepEqual(admin.map(x=>x.group),['期限切れ','今日','確認待ち']);
});
test('task loading, empty and failure remain distinct; failed data does not masquerade as complete empty',()=>{
 const h=setup();h.run("watchToday('tasks','tasks','タスク')");assert.match(h.field('heroTaskList').innerHTML,/読み込み中/);
 h.callbacks.tasks.ok({val:()=>null});assert.match(h.field('heroTaskList').innerHTML,/確認待ちはありません/);assert(!h.field('heroTaskList').innerHTML.includes('取得できません'));
 h.callbacks.tasks.error();assert.match(h.field('heroTaskList').innerHTML,/一部を取得できません/);assert.match(h.field('heroTaskList').innerHTML,/取得できた情報/);
 h.callbacks.tasks.ok({val:()=>({t:{title:'確認',assignees:['確認ユーザー'],date:'2026-10-09'}})});assert.match(h.field('heroTaskList').innerHTML,/確認<\/span>/);assert(!h.field('heroTaskList').innerHTML.includes('取得できません'));
});
test('public home update appears for staff and both admin modes; restricted notices never widen',()=>{
 const raw=JSON.parse(fs.readFileSync('portal-updates.json','utf8'));
 for(const admin of [false,true])for(const mode of ['staff','admin']){
  const h=setup(admin);h.c.raw=raw;h.c.homeViewMode=mode;h.run('_portalUpdateNotices=normalizePortalUpdateNotices(raw);renderNotices()');assert.match(h.field('heroNoticeList').innerHTML,/ホームの機能入口を役割別/);
  if(!admin||mode==='staff'){assert(!h.field('heroNoticeList').innerHTML.includes('shift.html'));assert(!h.field('heroNoticeList').innerHTML.includes('portal-members.html'));}
 }
});
test('notice loader distinguishes loading, true empty, failure and existing typed requests',async()=>{
 const h=setup(true);assert.equal(h.run("noticeExpiryEndTime('2026-10-09')"),Date.parse('2026-10-09T23:59:59.999+09:00'));h.run('renderNotices()');assert.match(h.field('heroNoticeList').innerHTML,/読み込み中/);
 await h.run('loadPortalUpdateNotices()');h.run("firebaseNoticeLoadState='ready';renderNotices()");assert.match(h.field('heroNoticeList').innerHTML,/現在表示中の更新情報はありません/);
 h.c.fetch=async()=>{throw Error('offline')};h.run('_portalUpdateNoticeLoadStarted=false');await h.run('loadPortalUpdateNotices()');assert.match(h.field('heroNoticeList').innerHTML,/読み込めませんでした/);assert(!h.field('heroNoticeList').innerHTML.includes('現在表示中の更新情報はありません'));
 h.run("portalUpdateLoadState='ready';_firebaseNotices={request:{type:'request',text:'既存の確認依頼',createdAt:Date.now()},ordinary:{type:'new',text:'通常のお知らせ',createdAt:Date.now()}};renderNotices()");assert.match(h.field('importantNoticeList').innerHTML,/既存の確認依頼/);assert(!h.field('heroNoticeList').innerHTML.includes('既存の確認依頼'));assert.match(h.field('heroNoticeList').innerHTML,/通常のお知らせ/);
});
