import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
function setup(profile={portalRole:'admin',isAdmin:true},sid='allowed'){
 const nodes=new Map();const node=()=>({hidden:false,style:{},attrs:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v},scrollIntoView(){this.scrolled=true},focus(){this.focused=true}});
 const field=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const groups=['staff','staff','staff','admin','both'].map(scope=>({dataset:{homeScope:scope},style:{},querySelectorAll:()=>scope==='admin'?['adminToolBtn','privateMetricsToolBtn','memberManagementToolBtn','terminalSetupToolBtn'].map(field):[node()]}));
 const c=vm.createContext({console,Date,URL,URLSearchParams,authenticatedProfile:profile,currentUser:{staffId:sid,name:'架空'},ADMIN_STAFF:['allowed'],isGuestUser:()=>false,window:{location:{href:'https://kalmia-dc.github.io/portal/index.html',origin:'https://kalmia-dc.github.io'}},document:{getElementById:field,body:node(),querySelectorAll:s=>s==='[data-menu-section]'?groups:[]}});
 const run=s=>vm.runInContext(s,c);
 run(html.slice(html.indexOf('let homeViewMode'),html.indexOf('// Firebaseからシフトデータを読む')));
 run(html.slice(html.indexOf('let noticeHistoryExpanded'),html.indexOf('async function deleteNotice')));
 run('updateMenuVisibility()');return {run,c,field,groups};
}
test('admin switches view only, preserves identity/auth, and all functions remain available in the appropriate view',()=>{
 const h=setup(),identity=JSON.stringify(h.c.currentUser),profile=JSON.stringify(h.c.authenticatedProfile);
 assert.equal(h.run('homeViewMode'),'admin');assert.equal(h.groups[3].style.display,'');assert.equal(h.groups[0].style.display,'none');
 for(let i=0;i<20;i++){h.run("setHomeViewMode('staff');setHomeViewMode('admin')")}
 assert.equal(JSON.stringify(h.c.currentUser),identity);assert.equal(JSON.stringify(h.c.authenticatedProfile),profile);
 h.run("setHomeViewMode('staff')");assert.equal(h.groups[0].style.display,'');assert.equal(h.groups[3].style.display,'none');
 assert.equal(h.field('staffHomeButton').attrs['aria-pressed'],'true');
 h.run('togglePortalMenu()');assert(h.field('homeFunctions').scrolled);assert(h.field('homeFunctionsTitle').focused);
 assert.equal(h.c.window.location.href,'https://kalmia-dc.github.io/portal/index.html');
});
test('staff and trainingAdmin never acquire admin view; individual administrator restrictions remain',()=>{
 for(const role of ['staff','trainingAdmin']){
  const h=setup({portalRole:role,isAdmin:false},'allowed');h.run("setHomeViewMode('admin')");assert.equal(h.run('homeViewMode'),'staff');assert(h.field('homeModeSwitch').hidden);assert.equal(h.groups[3].style.display,'none');assert.equal(h.field('adminToolBtn').style.display,'none');
 }
 const h=setup({portalRole:'admin',isAdmin:true},'other-admin');assert.equal(h.field('adminToolBtn').style.display,'none');assert.equal(h.field('privateMetricsToolBtn').style.display,'none');assert.equal(h.field('memberManagementToolBtn').style.display,'block');assert.equal(h.field('terminalSetupToolBtn').style.display,'block');
});
test('unavailable login/profile hides entrances; lost role returns to staff; terminal retains dedicated routing',()=>{
 const h=setup();h.c.authenticatedProfile=null;h.run('updateMenuVisibility()');assert(h.field('homeFunctions').hidden);h.run("setHomeViewMode('admin')");assert(h.field('homeFunctions').hidden);
 h.c.authenticatedProfile={portalRole:'staff',isAdmin:false};h.run('updateMenuVisibility()');assert.equal(h.run('homeViewMode'),'staff');assert(h.field('homeModeSwitch').hidden);
 h.c.currentUser=null;h.run('updateMenuVisibility()');assert(h.field('homeFunctions').hidden);
 const terminal=setup({portalRole:'terminal',isAdmin:false},'terminal');assert(terminal.field('homeFunctions').hidden);
 const start=html.indexOf('function redirectTerminalProfile()'),end=html.indexOf('async function initApp()',start);
 terminal.c.savePortalUser=x=>x;terminal.c.TERMINAL_MODE_STORAGE_KEY='mode';terminal.c.localStorage={getItem:()=> 'attendance'};let target;
 terminal.c.location={replace:v=>target=v};terminal.run(html.slice(start,end));assert.equal(terminal.run('redirectTerminalProfile()'),true);assert.equal(target,'./attendance.html');
 terminal.c.localStorage.getItem=()=>null;terminal.run('redirectTerminalProfile()');assert.equal(target,'./meeting-management.html');
});
test('updates default to latest two; expansion preserves all and staff view has no admin article links',()=>{
 const h=setup();h.c.raw=JSON.parse(fs.readFileSync('portal-updates.json','utf8'));h.run('_portalUpdateNotices=normalizePortalUpdateNotices(raw);renderNotices()');
 assert.equal((h.field('heroNoticeList').innerHTML.match(/class="hero-notice-item"/g)||[]).length,2);
 h.run('toggleNoticeHistory()');assert.equal((h.field('heroNoticeList').innerHTML.match(/class="hero-notice-item"/g)||[]).length,6);
 h.run("setHomeViewMode('staff')");assert(!h.field('heroNoticeList').innerHTML.includes('shift.html'));assert(!h.field('heroNoticeList').innerHTML.includes('portal-members.html'));
 h.run("setHomeViewMode('admin')");assert.equal((h.field('heroNoticeList').innerHTML.match(/class="hero-notice-item"/g)||[]).length,2);
 const reloaded=setup();assert.equal(reloaded.run('homeViewMode'),'admin');
});
test('existing function routes retained, duplicate labels unified, entrances precede updates and remain initially hidden',()=>{
 assert(html.indexOf('id="homeFunctions"')<html.indexOf('id="heroNoticeCard"'));assert(html.includes('id="homeFunctions" hidden'));
 assert(!html.includes('院内研修<br>資料'));
 for(const page of ['task-manager','meeting-management','training-materials','attendance','shift','loan-management','goal-manager','schedule','skill','private-metrics','portal-members','terminal-setup'])assert(html.includes(page+'.html'),page);
 assert(html.includes('https://ssl.jobcan.jp/employee'));assert(html.includes('https://apo-toolboxes.stransa.co.jp/calendar/'));assert(html.includes('https://kalmia-dc.doctor-hr.com/'));
});
