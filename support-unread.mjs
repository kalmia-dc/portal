export function isReply(e,uid){
 return e?.type==='message' && e.actorRole==='admin' && !!e.replyTo &&
 (e.actorUid!==uid || (e.authorType==='ai' && e.source==='hirasol-assisted'));
}
export function unreadItems(records,reads,uid){
 if(!uid)return [];
 return Object.entries(records||{}).flatMap(([id,t])=>{
 if(t?.meta?.ownerUid!==uid)return [];
 const pending=Object.entries(t.events||{}).filter(([eid,e])=>isReply(e,uid)&&reads?.[id]?.[eid]!==true);
 if(!pending.length)return [];
 const ai=pending.some(([,e])=>e.authorType==='ai'&&e.source==='hirasol-assisted');
 return [{kind:'相談の返信',id,title:ai?'ヒラソルから返信があります':'管理者から返信があります',date:'',group:'確認待ち',url:'support-chat.html?thread='+encodeURIComponent(id)}];
 });
}
export function threadFromSearch(search){
 const id=new URLSearchParams(search).get('thread');
 return id&&/^[a-zA-Z0-9-]{8,80}$/.test(id)?id:null;
}
// Only observed, visible messages are acknowledged. Never infer read state from page entry.
export function observeReplies({thread,uid,root,mark,Observer=globalThis.IntersectionObserver,visible=()=>document.visibilityState==='visible',failed=()=>{}}){
 if(!Observer||thread?.ownerUid!==uid)return ()=>{};
 const events=new Map(thread.events.filter(e=>isReply(e,uid)).map(e=>[e.id,e]));
 const pending=new Set(),done=new Set();let stopped=false;
 const observer=new Observer(entries=>{
 if(stopped||!visible())return;
 for(const entry of entries){
 const id=entry.target.dataset.eventId;
 if(!entry.isIntersecting||entry.intersectionRatio<0.1||!events.has(id)||pending.has(id)||done.has(id))continue;
 pending.add(id);
 Promise.resolve().then(()=>stopped?undefined:mark(thread.id,id)).then(()=>{if(!stopped){done.add(id);observer.unobserve(entry.target);}}).catch(failed).finally(()=>pending.delete(id));
 }
 },{threshold:0.1});
 for(const el of root.querySelectorAll('p[data-event-id]'))if(events.has(el.dataset.eventId))observer.observe(el);
 return ()=>{stopped=true;observer.disconnect();};
}
