// Local fake records only. Never loads Firebase or connects to production.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'");
 if(u.pathname==='/mobile') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>390px・架空データ検証</h1><iframe title="スマホ編集" src="/incident?'+u.searchParams.toString()+'" style="width:390px;height:844px"></iframe>');return;}
 if(u.pathname==='/incident'){
  const original=fs.readFileSync(path.join(root,'meeting-management.html'),'utf8');
  let code=original.slice(original.indexOf('const DIRECTOR_ID'),original.lastIndexOf('</script>')).replace('  boot();','  /* fixture boot below */');
  const prefix=`import {canEditOwnIncident,ownerPayload} from '/incident-owner-policy.mjs';
const params=new URLSearchParams(location.search),authenticatedProfile={staffId:'fixture_author',name:'架空報告者',portalRole:'staff'},db={};
const ref=(_,p)=>p;
async function update(p,payload){await new Promise(r=>setTimeout(r,350));renderIncidentReports();if(params.has('denied'))throw Error('PERMISSION_DENIED');if(params.has('offline'))throw Error('NETWORK_ERROR');Object.assign(state.incidentReports[0],payload);renderIncidentReports();}
`;
  const suffix=`
state.incidentReports=[{id:'one',reportNumber:'TEST-001',createdById:'fixture_author',reporterId:params.has('legacy')?null:'fixture_author',reporterName:'架空報告者',type:'near_miss',occurredDate:'2026-10-10',details:'架空の検証用報告です。実際の事故や患者情報は含みません。',counterStatus:'pending',createdAt:1}];
document.getElementById('app').hidden=false;document.getElementById('guard').hidden=true;
document.getElementById('incidentFormPanel').hidden=true;document.getElementById('incidentImportPanel').hidden=true;
document.addEventListener('click',e=>{handleActions(e).catch(x=>showToast(x.message))});
setupUser();renderIncidentReports();toggleIncidentEdit('one');document.title='架空データ・本人編集検証';
`;
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>','<script type="module">'+prefix+code+suffix+'</script></body>'));return;
 }
 if(['/incident-owner-policy.mjs','/portal-common.css'].includes(u.pathname)){res.setHeader('Content-Type',u.pathname.endsWith('.mjs')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(root,u.pathname)));return;}
 res.writeHead(404);res.end();
}).listen(8773,'127.0.0.1',()=>console.log('Incident fake UI http://127.0.0.1:8773/incident'));
