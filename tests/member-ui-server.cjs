// Local-only visual fixture. Never connects to Firebase or a notification service.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const mock=`
const mode=new URLSearchParams(location.search).get('mode');
let attempt=0;
const data={ 'portalAccess/users':{admin:{staffId:'sugihira',name:'テスト管理者',role:'admin',active:true},staff:{staffId:'tanaka',name:'テスト田中',role:'staff',active:true,email:'staff@example.test'}}, 'portalAccessRequests':{pending:{uid:'pending',email:'pending@example.test',displayName:'テスト申請者',requestedName:'田中'}}, extra_staff:{} };
export const initializeApp=()=>({});export const getDatabase=()=>({});export const ref=(db,path)=>path;export const serverTimestamp=()=>123;
const read=p=>p.startsWith('portalAccess/users/')?data['portalAccess/users'][p.split('/').pop()]||null:p.startsWith('portalAccessRequests/')?data['portalAccessRequests'][p.split('/').pop()]||null:data[p]||null;
export async function get(p){if(mode==='failure')throw Error('mock read failure');return {val:()=>structuredClone(read(p))};}
export function onValue(p,fn){queueMicrotask(()=>fn({val:()=>read(p)}));return ()=>{};}
export async function runTransaction(p,fn){
 attempt++;
 if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,3000));
 if(mode==='denied' || (mode==='retry' && attempt===1))throw Error('PERMISSION_DENIED（架空テスト）');
 const v=fn(structuredClone(read(p)));if(v===undefined)return {committed:false};
 if(p==='extra_staff')data[p]=v;else data['portalAccess/users'][p.split('/').pop()]=v;
 if(mode==='lost-ack' && attempt===1)throw Error('保存応答が途切れました（架空テスト）');
 return {committed:true};
}
export async function startPortalAuth(){return {uid:mode==='staff'?'staff':'admin',portalRole:mode==='staff'?'staff':'admin'};}
`;
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'");
 if(url.pathname==='/mobile'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>390px・架空データ検証</h1><iframe title="スマホメンバー管理" src="/portal-members.html?'+url.searchParams.toString()+'" style="width:390px;height:844px;border:1px solid #ccc"></iframe>');return;}
 if(url.pathname==='/__mock.mjs'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(mock);return;}
 if(url.pathname==='/session-test.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>通信復旧テスト（架空データ）</title><h1>通信復旧テスト（架空データのみ）</h1><p>接続→サーバー確認まで画面はロック。入力を維持して再開します。</p><button data-signal="disconnect">通信を切断</button> <button data-signal="connect">再接続</button> <button data-signal="verify-ok">サーバー確認成功</button> <button data-signal="revoke">利用許可解除</button><iframe title="テスト用ポータル" src="/tests/fixtures/session-content.html" style="display:block;width:95%;height:700px;margin-top:20px"></iframe><script>document.querySelectorAll('button').forEach(b=>b.onclick=()=>document.querySelector('iframe').contentWindow.postMessage(b.dataset.signal,location.origin));</script></html>`);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{let content=fs.readFileSync(file);if(file.endsWith('portal-members.js'))content=content.toString().replace(/from 'https:\/\/www.gstatic.com\/[^']+'/g,"from './__mock.mjs'").replace("from './portal-auth.js'","from './__mock.mjs'");
 if(file.endsWith('portal-auth.js'))content=content.toString().replace(/from 'https:\/\/www.gstatic.com\/[^']+'/g,"from './tests/fixtures/session-sdk.mjs'");
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(content);
 }catch{res.writeHead(404).end();}
}).listen(8768,'127.0.0.1',()=>console.log('Offline member UI fixture: http://127.0.0.1:8768/portal-members.html'));
