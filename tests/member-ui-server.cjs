// Local-only visual fixture. Never connects to Firebase or a notification service.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const mock=`
const mode=new URLSearchParams(location.search).get('mode');
const data={ 'portalAccess/users':{admin:{staffId:'sugihira',name:'テスト管理者',role:'admin',active:true},staff:{staffId:'tanaka',name:'テスト田中',role:'staff',active:true,email:'staff@example.test'}}, 'portalAccessRequests':{pending:{uid:'pending',email:'pending@example.test',displayName:'テスト申請者',requestedName:'田中'}}, extra_staff:{} };
export const initializeApp=()=>({});export const getDatabase=()=>({});export const ref=(db,path)=>path;export const serverTimestamp=()=>123;
const read=p=>p.startsWith('portalAccess/users/')?data['portalAccess/users'][p.split('/').pop()]||null:p.startsWith('portalAccessRequests/')?data['portalAccessRequests'][p.split('/').pop()]||null:data[p]||null;
export async function get(p){if(mode==='failure')throw Error('mock read failure');return {val:()=>structuredClone(read(p))};}
export function onValue(p,fn){queueMicrotask(()=>fn({val:()=>read(p)}));return ()=>{};}
export async function runTransaction(p,fn){const v=fn(structuredClone(read(p)));if(v===undefined)return {committed:false};data['portalAccess/users'][p.split('/').pop()]=v;return {committed:true};}
export async function startPortalAuth(){return {uid:mode==='staff'?'staff':'admin',portalRole:mode==='staff'?'staff':'admin'};}
`;
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/__mock.mjs'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(mock);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{let content=fs.readFileSync(file);if(file.endsWith('portal-members.js'))content=content.toString().replace(/from 'https:\/\/www.gstatic.com\/[^']+'/g,"from './__mock.mjs'").replace("from './portal-auth.js'","from './__mock.mjs'");
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(content);
 }catch{res.writeHead(404).end();}
}).listen(8768,'127.0.0.1',()=>console.log('Offline member UI fixture: http://127.0.0.1:8768/portal-members.html'));
