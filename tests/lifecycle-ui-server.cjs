// Local browser fixtures only. No Firebase network or real staff operations.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const mock=`
const mode=new URLSearchParams(location.search).get('mode'),key='lifecycle-fixture-v1';let attempt=0;
const initial={portalAccess:{users:{admin:{staffId:'boss',name:'架空 管理者',role:'admin',active:true},a:{staffId:'person',name:'架空 はな',role:'staff',active:true,email:'hana@example.test'},b:{staffId:'person',name:'架空 はな',role:'staff',active:true,email:'hana.second@example.test'},old:{staffId:'person',name:'架空 はな',role:'staff',active:false,email:'hana.old@example.test'}}},extra_staff:{person:{id:'person',name:'架空 はな',role:'DH',type:'part'},unlinked:{id:'unlinked',name:'架空 そら',role:'DR',type:'part'}},staffLifecycle:{},portalJoinRequests:{},portalAccessRequests:{}};
const all=()=>JSON.parse(localStorage.getItem(key)||JSON.stringify(initial));const read=p=>p==='.info/connected'?mode!=='offline':p.split('/').reduce((v,k)=>v?.[k],all())??null;
export const initializeApp=()=>({}),getDatabase=()=>({}),ref=(db,p='')=>p,serverTimestamp=()=>Date.now();
export async function get(p){if(mode==='read-failure')throw Error('読み取り拒否（架空）');return {val:()=>read(p)};}
export function onValue(p,fn,error){if(mode==='offline'){queueMicrotask(()=>error?.(Error('通信切断（架空）')));return ()=>{};}queueMicrotask(()=>fn({val:()=>read(p)}));return ()=>{};}
async function fail(){attempt++;if(mode==='slow')await new Promise(r=>setTimeout(r,4000));if(mode==='denied'||mode==='retry'&&attempt===1)throw Error('PERMISSION_DENIED（架空）');if(mode==='interrupted'&&attempt===1){document.querySelector('dialog[open]')?.close();throw Error('通信切断（架空）');}}
const put=(d,p,v)=>{const a=p.split('/');let n=d;for(const k of a.slice(0,-1))n=n[k]??={};n[a.at(-1)]=v;};
export async function runTransaction(p,fn){await fail();const d=all(),v=fn(read(p));if(v===undefined)return {committed:false};put(d,p,v);localStorage.setItem(key,JSON.stringify(d));if(mode==='lost-ack'&&attempt===1)throw Error('保存応答喪失（架空）');return {committed:true};}
export async function update(p,updates){await fail();const d=all();for(const [k,v]of Object.entries(updates))put(d,k,v);localStorage.setItem(key,JSON.stringify(d));}
export async function startPortalAuth(){return {uid:'admin',staffId:'boss',portalRole:mode==='staff'?'staff':'admin'};}
`;
http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'");
if(u.pathname==='/__mock.mjs'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(mock);return;}
if(u.pathname==='/portal-default-staff.mjs'){res.setHeader('Content-Type','text/javascript');res.end("export const defaultStaff=[{id:'boss',name:'架空 管理者',role:'DR'}];");return;}
if(u.pathname==='/mobile'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>390px・架空データ検証</h1><iframe title="スマホ操作" src="/portal-members.html?'+u.searchParams+'" style="width:390px;height:900px;border:1px solid #ccc"></iframe>');return;}
const file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/portal-members.html':u.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
try{let content=fs.readFileSync(file);if(path.basename(file)==='portal-members.js')content=content.toString().replace(/from 'https:\/\/www.gstatic.com\/[^']+'/g,"from './__mock.mjs'").replace("from './portal-auth.js'","from './__mock.mjs'");res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript; charset=utf-8');res.end(content)}catch{res.writeHead(404).end();}
}).listen(8771,'127.0.0.1',()=>console.log('Dummy-only lifecycle UI http://127.0.0.1:8771/'));
