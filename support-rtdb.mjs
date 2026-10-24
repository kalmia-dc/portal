import {canUseStaff,canAssignStaff} from './portal-staff-usage.mjs?v=20261024-usage';
import {changeThread,projectThread} from './support-model.mjs';
// Atomic Firebase REST multipath PATCH + rules revision check is the CAS boundary.
// No offline write queue,
// automatic retry, periodic polling, service account, or application server.
export function createRtdbTransport({databaseURL,user,profile,fetcher=fetch,isAccessLost=()=>false,emulator=false,senderSource='portal-ui'}){
 const base=new URL(databaseURL);
 if(emulator){if(base.hostname!=='127.0.0.1'||base.port!=='43828')throw Error('専用エミュレーターだけ利用できます。');}
 else if(base.protocol!=='https:'||base.hostname!=='kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app')throw Error('承認された既存DBではありません。');
 const actor={uid:user.uid,role:profile.portalRole,name:profile.name};
 async function call(path,{method='GET',body,query={}}={}){
  if(isAccessLost())throw Error('利用許可を再確認してください。');
  const token=await user.getIdToken();
  const url=new URL(base);url.pathname='/supportChats'+(path?'/'+path:'')+'.json';
  url.searchParams.set('auth',token);for(const [k,v] of Object.entries(query))url.searchParams.set(k,JSON.stringify(v));
  let r;try{r=await fetcher(url.href,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});}catch{throw Error('通信を確認できません。保存済みの可能性があるため、同じ内容で再試行してください。');}
  if(isAccessLost())throw Error('利用許可が変更されました。再読み込みしてください。');
  if(r.status===412)throw Error('新しい発言・状態変更があります。「更新」で確認してから送信してください。');
  if(!r.ok){const error=Error(r.status===401||r.status===403?'利用許可または保存内容を確認してください。':'保存を確認できません。同じ内容で再試行してください。');error.status=r.status;throw error;}
  return {value:await r.json()};
 }
 return Object.freeze({async request(path,p,options={}){
  if(isAccessLost())throw Error('利用許可を再確認してください。');
  if(path==='me'&&!p)return actor;
  if(path==='threads'&&!p){const query=actor.role==='admin'?{}:{orderBy:'meta/ownerUid',equalTo:actor.uid};const r=await call('',{query});return Object.entries(r.value||{}).map(([id,t])=>projectThread(id,t)).sort((a,b)=>b.updatedAt-a.updatedAt);}
  const match=path.match(/^threads\/([a-zA-Z0-9-]{8,80})$/);
  const creating=path==='threads'&&p?.kind==='create';
  if(creating&&!canUseStaff(profile.staffId))throw Error('この枠は勤怠・シフト専用です。新しい相談には使用できません。');
  if(!creating&&!match)throw Error('操作先が不正です。');
  const id=creating?p.requestId:match[1];
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw Error('相談IDが不正です。');
  const existing=await call(id);
  if(!p){if(!existing.value)throw Error('相談が見つかりません。');return projectThread(id,existing.value);}
  const next=changeThread(existing.value,p,actor,{senderSource:options.senderSource??senderSource});
  if(next.replayed)return projectThread(id,next.value);
  try{await call(id,{method:'PATCH',body:{meta:next.value.meta,['events/'+p.requestId]:next.value.events[p.requestId]}});}catch(error){
   if(error.status===401||error.status===403){let fresh;try{fresh=(await call(id)).value;}catch{}if(fresh&&fresh.meta.revision!==existing.value?.meta.revision)throw Error('新しい発言・状態変更があります。「更新」で確認してから送信してください。');}
   throw error;
  }
  // Only return the authoritative server-timestamped snapshot after acknowledgment.
  const saved=await call(id);return projectThread(id,saved.value);
 }});
}
