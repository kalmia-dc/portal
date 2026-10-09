// Offline-only visual fixture: no Firebase SDK, real identities or outbound requests.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const fixture=`<script>
window.portalAuthReady=Promise.resolve({portalRole:'admin',staffId:'test_admin',name:'検証管理者'});
STAFF=[{id:'test_dr',name:'架空医師A',role:'DR',type:'spot'},{id:'test_dh',name:'架空衛生士B',role:'DH',type:'full'},{id:'test_da',name:'未申請スタッフC',role:'DA',type:'part'}];
currentYear=2026;currentMonth=9;
const params=new URLSearchParams(location.search),fixtureKey='shift-admin-fixture-'+(params.get('case')||'default');
let fixtureStore=JSON.parse(localStorage.getItem(fixtureKey)||'null')||{'2026-10':{test_dr:{'2026-10-05':'early','2026-10-06':'paid','2026-10-07':'off'},test_dh:{'2026-10-05':'late'},__manualTimes:{test_dr:{'2026-10-05':{key:'early',start:'09:00',end:'17:00',breakMinutes:60}}}}};
const revokedMembers={test_account:{staffId:'test_dr',role:'staff',active:false}};
let fixtureMembers=params.has('revoked')?revokedMembers:{};receiveShiftMembers(fixtureMembers);if(params.has('unread'))shiftMembersLoaded=false;staffOrderRecord=fixtureStore.__displayOrder||null;staffOrderLoaded=true;
window._fb={shiftConnected:true,readMembersFromServer:async()=>params.has('revoke-on-save')?revokedMembers:fixtureMembers,db:{},ref:(_,p)=>p,get:async()=>({val:()=>params.has('locked')}),runTransaction:async(p,fn)=>{
await new Promise(r=>setTimeout(r,500));if(params.has('denied'))throw Error('PERMISSION_DENIED');
const key=p.replace('shifts/',''),next=fn(structuredClone(fixtureStore[key]??null));if(next===undefined)return {committed:false};fixtureStore[key]=next;localStorage.setItem(fixtureKey,JSON.stringify(fixtureStore));return {committed:true,snapshot:{val:()=>structuredClone(next)}};
}};
if(params.has('offline'))window._fb.shiftConnected=false;
allShiftData=structuredClone(fixtureStore);loadShiftForMonth(2026,9);
document.title='ローカル検証・架空データのみ';
const fixtureControls=document.createElement('div');fixtureControls.style='padding:8px;background:#fff';
fixtureControls.innerHTML='<strong>架空データ検証：</strong><button id="fixtureAllow">再許可</button><button id="fixtureRevoke">解除</button><button id="fixtureFail">読取失敗</button>';
document.body.prepend(fixtureControls);
document.getElementById('fixtureAllow').onclick=()=>{fixtureMembers={};receiveShiftMembers(fixtureMembers);render()};
document.getElementById('fixtureRevoke').onclick=()=>{fixtureMembers=revokedMembers;receiveShiftMembers(fixtureMembers);render()};
document.getElementById('fixtureFail').onclick=()=>{shiftMembersLoaded=false;shiftMembersVersion++;render()};
</script>`;
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/shift-mobile.html'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><title>シフト・スマートフォン幅の検証</title><h1>390px幅・架空データのローカル検証</h1><iframe title="スマートフォン幅のシフト" src="/shift.html?case=visibility-mobile&revoked" style="width:390px;height:844px;border:1px solid #ddd"></iframe></html>');return;
 }
 if(url.pathname==='/updates-mobile.html'){
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><h1>390px幅・更新情報検証</h1><iframe title="スマートフォン幅のホーム" src="/updates.html" style="width:390px;height:844px;border:1px solid #ddd"></iframe></html>');return;
 }
 if(url.pathname==='/updates.html'){
  const original=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const functions=original.slice(original.indexOf('let noticeHistoryExpanded'),original.indexOf('async function deleteNotice'));
  const visibility=original.slice(original.indexOf('let homeViewMode'),original.indexOf('// Firebaseからシフトデータを読む'));
  const staff=url.searchParams.has('staff');
  let page=original.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/@import url\([^;]+;/g,'');
  const boot='<script>const ADMIN_STAFF=["test_admin"];const currentUser={staffId:'+JSON.stringify(staff?'test_staff':'test_admin')+',name:"架空ユーザー"};const authenticatedProfile={portalRole:'+JSON.stringify(staff?'staff':'admin')+',isAdmin:'+!staff+'};function isGuestUser(){return false};'+functions+visibility+';_portalUpdateNotices=normalizePortalUpdateNotices('+fs.readFileSync(path.join(root,'portal-updates.json'),'utf8')+');renderNotices();updateMenuVisibility();document.getElementById("heroTitle").textContent="架空ユーザーさん";</script>';
  page=page.replace('</head>','<style>#loginScreen{display:none!important}#app{display:block!important}</style></head>').replace('</body>',boot+'</body>');
  res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'none'; img-src 'self' data:");res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);return;
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{let content=fs.readFileSync(file);
 if(file.endsWith('shift.html'))content=content.toString().replace(/<script type="module">[\s\S]*?<\/script>/,'').replace(/@import url\([^;]+;/,'').replace(/<script defer src="\.\/portal-common.js[^>]+><\/script>/,'').replace('</body>',fixture+'</body>');
 res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'none'; img-src 'self' data:");
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(content);
 }catch{res.writeHead(404).end();}
}).listen(8772,'127.0.0.1',()=>console.log('Offline fixture: http://127.0.0.1:8772/shift.html'));
