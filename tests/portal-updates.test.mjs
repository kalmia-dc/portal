import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8'),raw=JSON.parse(fs.readFileSync('portal-updates.json','utf8'));
function setup(){
 const nodes={};const field=id=>nodes[id]??={innerHTML:'',style:{},setAttribute(){},classList:{add(){},remove(){}}};
 const c=vm.createContext({Date,URL,console,document:{getElementById:field},window:{location:{href:'https://kalmia-dc.github.io/portal/index.html',origin:'https://kalmia-dc.github.io'}},currentUser:{staffId:'sugihira',name:'検証'},authenticatedProfile:{isAdmin:true},homeViewMode:null,ADMIN_STAFF:['sugihira','momo'],isGuestUser:()=>false,raw});
 const run=s=>vm.runInContext(s,c);
 run(html.slice(html.indexOf('let noticeHistoryExpanded'),html.indexOf('async function deleteNotice')));
 run('_portalUpdateNotices=normalizePortalUpdateNotices(raw)');return {run,c,field};
}
test('home updates newest first, links retain existing routing, no metadata or unpublished notification claims',()=>{
 const h=setup();h.run('noticeHistoryExpanded=true;renderNotices()');const out=h.field('heroNoticeList').innerHTML;
 assert(out.indexOf('解除済みスタッフは')<out.indexOf('スタッフ1人の表示月'));
 assert(out.includes('shift.html?admin=1&amp;sid=sugihira'));assert(out.includes('portal-members.html?sid=sugihira'));
 assert(out.includes('シフト管理で履歴を確認'));assert(!out.includes('bf25bb5'));assert(!out.includes('Worker'));assert(!out.includes('朝サマリー'));
 for(const row of raw.filter(x=>x.createdAt.startsWith('2026-10')))assert(fs.existsSync(row.linkUrl.split(/[?#]/)[0]));
});
test('staff, guest, terminal and limited administrator do not receive inappropriate administrator update links',()=>{
 const h=setup();
 for(const role of ['staff','terminal']){h.c.authenticatedProfile={isAdmin:false,portalRole:role};h.c.currentUser={staffId:'unlinked',name:'検証'};h.run('renderNotices()');assert(!h.field('heroNoticeList').innerHTML.includes('shift.html'));assert(!h.field('heroNoticeList').innerHTML.includes('portal-members.html'));}
 h.c.authenticatedProfile={isAdmin:true};h.run('noticeHistoryExpanded=true;renderNotices()');assert(!h.field('heroNoticeList').innerHTML.includes('shift.html'));assert(h.field('heroNoticeList').innerHTML.includes('portal-members.html'));
 h.c.isGuestUser=()=>true;h.run('renderNotices()');assert(!h.field('heroNoticeList').innerHTML.includes('portal-members.html'));
 assert.equal(h.run("canViewPortalUpdate({portalUpdate:true,audience:'unknown'})"),false);
});
test('static history stays visible without expiry; explicit expiry and ordinary Firebase notices keep behavior; text escaped',()=>{
 const h=setup();assert.equal(h.run("isActiveNotice({portalUpdate:true,createdAt:'2020-01-01'})"),true);
 assert.equal(h.run("isActiveNotice({portalUpdate:true,createdAt:'2020-01-01',expiresAt:'2020-02-01'})"),false);
 assert.equal(h.run("isActiveNotice({createdAt:'2020-01-01'})"),false);
 h.run("_firebaseNotices={fixture:{text:'<script>test</script>',createdAt:Date.now(),type:'new'}};renderNotices()");assert(h.field('heroNoticeList').innerHTML.includes('&lt;script&gt;'));
});

test('verified incident fix is dated, public, newest and remains in expandable history',()=>{
 const row=raw.find(x=>x.id==='2026-10-10-incident-owner-edit-fix');assert.equal(row.type,'fix');assert.equal(row.audience,'all');assert.match(row.createdAt,/^2026-10-10T/);assert(!row.expiresAt);
 const h=setup();h.c.authenticatedProfile={isAdmin:false,portalRole:'staff'};h.c.currentUser={staffId:'fixture',name:'架空'};h.run('renderNotices()');const out=h.field('heroNoticeList').innerHTML;assert(out.includes(row.text));assert(out.includes('不具合修正'));assert(out.includes('meeting-management.html'));assert(!out.includes('portal-members.html'));assert(!out.includes('shift.html?admin'));
 h.run('noticeHistoryExpanded=true;renderNotices()');assert(h.field('heroNoticeList').innerHTML.includes(row.text));
 for(const privateTerm of ['田宮','DB','ルール','権限','Worker','通知復旧'])assert(!row.text.includes(privateTerm));
});
