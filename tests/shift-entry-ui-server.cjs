// Offline-only visual fixture: no Firebase SDK, real identities or outbound requests.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const fixture=`<script>
window.portalAuthReady=Promise.resolve({portalRole:'admin',staffId:'test_admin',name:'検証管理者'});
STAFF=[{id:'test_dr',name:'架空医師A',role:'DR',type:'spot'},{id:'test_dh',name:'架空衛生士B',role:'DH',type:'full'}];
currentYear=2026;currentMonth=9;
let fixtureData=JSON.parse(localStorage.getItem('shift-entry-fixture')||'null')||{test_dr:{'2026-10-05':'early'},test_dh:{'2026-10-05':'late'},__manualTimes:{test_dr:{'2026-10-05':{key:'early',start:'09:00',end:'17:00',breakMinutes:60}}}};
window._fb={shiftConnected:true,db:{},ref:(_,p)=>p,get:async()=>({val:()=>false}),runTransaction:async(p,fn)=>{
await new Promise(r=>setTimeout(r,500));if(new URLSearchParams(location.search).has('denied'))throw Error('PERMISSION_DENIED');
const next=fn(structuredClone(fixtureData));if(next===undefined)return {committed:false};fixtureData=next;localStorage.setItem('shift-entry-fixture',JSON.stringify(next));return {committed:true,snapshot:{val:()=>structuredClone(next)}};
}};
if(new URLSearchParams(location.search).has('offline'))window._fb.shiftConnected=false;
allShiftData={'2026-10':structuredClone(fixtureData)};loadShiftForMonth(2026,9);
document.title='ローカル検証・架空データのみ';
</script>`;
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{let content=fs.readFileSync(file);
 if(file.endsWith('shift.html'))content=content.toString().replace(/<script type="module">[\s\S]*?<\/script>/,'').replace(/@import url\([^;]+;/,'').replace(/<script defer src="\.\/portal-common.js[^>]+><\/script>/,'').replace('</body>',fixture+'</body>');
 res.setHeader('Content-Security-Policy',"default-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'none'; img-src 'self' data:");
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(content);
 }catch{res.writeHead(404).end();}
}).listen(8772,'127.0.0.1',()=>console.log('Offline fixture: http://127.0.0.1:8772/shift.html'));
