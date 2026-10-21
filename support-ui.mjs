import {speakerInfo} from './support-model.mjs?v=20261021-director';
import {accountPersonName} from './portal-person-display.mjs?v=20261021-director';
const $=id=>document.getElementById(id);
const statuses=['未確認','確認中','対応中','対応済み','保留'];
let me,current=null,threads=[],busy=false,pending=null,accessLost=false;
const drafts=new Map();
const senderLabel=document.createElement('label');senderLabel.id='sender-control';senderLabel.hidden=true;
senderLabel.append(document.createTextNode('返信の送信元（管理者申告）'));
const sender=document.createElement('select');sender.id='sender-source';sender.setAttribute('aria-label','返信の送信元（管理者申告）');
for(const [value,text] of [['portal-ui','本人名で返信（人間・既定）'],['hirasol-assisted','ヒラソル（AIアシスタント）として返信']]){const o=document.createElement('option');o.value=value;o.textContent=text;sender.append(o);}
senderLabel.append(sender);const note=document.createElement('small');note.textContent='ヒラソルがこの画面を操作して返信する場合だけ選択してください。管理者セッションによる申告であり、独立したAI本人認証ではありません。';senderLabel.append(note);$('composer').prepend(senderLabel);
sender.onchange=()=>{$('send').textContent=sender.value==='hirasol-assisted'?'ヒラソルとして送信':'送信';};
async function api(path,body,options){if(globalThis.supportTransport)return globalThis.supportTransport.request(path,body,options);let r;try{r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});}catch{throw new Error('通信を確認できません。保存済みの可能性があるため、同じ内容で再試行してください。');}const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
function feedback(message=''){if($('feedback'))$('feedback').textContent=message;}
function remember(){drafts.set(current?.id??'new',{body:$('body').value,page:$('page').value,occurredAt:$('occurred').value,pending,senderSource:sender.value});}
function restore(){const d=drafts.get(current?.id??'new')??{};$('body').value=d.body??'';$('page').value=d.page??'';$('occurred').value=d.occurredAt??'';pending=d.pending??null;sender.value=d.senderSource??'portal-ui';sender.onchange();}
function lock(value){value=value||accessLost;busy=value;document.querySelectorAll('main button,main select,main textarea,main input').forEach(e=>e.disabled=value);}
function renderList(){
  $('list-title').textContent=me.role==='admin'?'すべての相談':'自分の相談';$('filter-label').hidden=me.role!=='admin';
  $('threads').replaceChildren();
  const visible=threads.filter(t=>!$('unanswered').checked||me.role!=='admin'||t.unanswered);
  if(!visible.length)$('threads').textContent='該当する相談はありません。';
  for(const t of visible){const b=document.createElement('button');b.className='thread';b.dataset.threadId=t.id;b.setAttribute('aria-current',String(t.id===current?.id));const title=document.createElement('span');title.textContent=t.events.find(e=>e.type==='message').body.slice(0,55);const meta=document.createElement('small');meta.textContent=`${t.status} · ${accountPersonName(t.ownerName,t.ownerUid)} · #${t.id.slice(0,8)}`;b.append(title,meta);if(t.unanswered){const badge=document.createElement('span');badge.className='badge';badge.textContent='管理者から未返信';b.append(badge);}b.onclick=()=>select(t);$('threads').append(b);}
}
async function select(t){if(busy)return;remember();lock(true);try{const fresh=t?await api('threads/'+t.id):null;current=fresh;sender.value='portal-ui';sender.onchange();restore();render();feedback(t?'最新の会話を取得しました。返信先と内容を確認してください。':'');}catch(e){feedback(e.message);}finally{lock(false);}}
function render(){
  renderList();$('empty').hidden=true;$('detail').hidden=!current;$('composer').hidden=false;$('optional').hidden=!!current;
  $('compose-title').textContent=current?'この相談に追記する':'新しい相談';
  $('reply-target').textContent=current?`送信先：#${current.id} ／ ${accountPersonName(current.ownerName,current.ownerUid)} ／ 直前の発言 #${current.events.filter(e=>e.type==='message').at(-1).seq}`:'短い文章だけで始められます。';
  senderLabel.hidden=me.role!=='admin'||!current;
  if(!current)return;
  $('thread-title').textContent=`${accountPersonName(current.ownerName,current.ownerUid)} の相談`;
  $('thread-meta').textContent=`スレッドID：${current.id} ／ ${current.status} ／ 版 ${current.revision}${current.page?' ／ 画面：'+current.page:''}${current.occurredAt?' ／ 発生時刻（本人申告・端末現地時刻）：'+current.occurredAt:''}`;
  $('events').replaceChildren();
  for(const e of current.events){const speaker=speakerInfo(e);const item=document.createElement('article');item.dataset.eventId=e.id;item.className='event '+(e.type==='status'?'status':speaker.ai?'ai':e.actorRole==='admin'?'admin':'');const badge=document.createElement('strong');badge.className='author-badge';badge.textContent=speaker.label;const meta=document.createElement('small');meta.textContent=`#${e.seq} · ${new Date(e.at).toLocaleString('ja-JP')} · サーバー記録`;const body=document.createElement('p');body.textContent=e.type==='status'?`状態変更：${e.from} → ${e.to}`:e.body;const source=document.createElement('small');source.textContent=speaker.note;item.append(badge,meta,body,source);if(e.replyTo){const reply=document.createElement('small');reply.textContent=`返信先：発言 #${current.events.find(v=>v.id===e.replyTo)?.seq}`;item.append(reply);}$('events').append(item);}
  $('status-controls').hidden=me.role!=='admin';$('status').value=current.status;
}
async function refresh(){remember();threads=await api('threads');if(current){current=threads.find(t=>t.id===current.id)??null;}restore();render();}
for(const s of statuses){const o=document.createElement('option');o.value=s;o.textContent=s;$('status').append(o);}
$('new').onclick=()=>select(null);
$('unanswered').onchange=renderList;
$('refresh').onclick=async()=>{lock(true);try{await refresh();feedback('最新の会話を表示しました。入力内容は保持しています。');}catch(e){feedback(e.message)}finally{lock(false)}};
$('switch').onclick=async()=>{lock(true);try{me=await api('fixture-session',{user:$('identity').value});drafts.clear();pending=null;current=null;$('body').value='';$('page').value='';$('occurred').value='';$('unanswered').checked=false;threads=await api('threads');$('who').textContent=accountPersonName(me.name,me.uid);render();feedback();}catch(e){feedback(e.message)}finally{lock(false)}};
async function submit(kind){
  if(busy)return;
  const target=current?.id??null;
  const p=kind==='status'?{kind,status:$('status').value,expectedRevision:current.revision}:{kind:current?'message':'create',body:$('body').value,...(current?{expectedRevision:current.revision,replyTo:current.events.filter(e=>e.type==='message').at(-1).id}:{page:$('page').value,occurredAt:$('occurred').value})};
  const senderSource=kind==='status'||!target?'portal-ui':sender.value;
  const signature=JSON.stringify({target,p,senderSource});
  if(!pending||pending.signature!==signature)pending={signature,requestId:crypto.randomUUID()};
  remember();lock(true);feedback('送信しています…');
  try{
    const result=await api('threads'+(target?'/'+target:''),{...p,requestId:pending.requestId},{senderSource});
    // Acknowledged mutations are not retried when a subsequent list refresh fails.
    const oldKey=target??'new';
    if(kind!=='status'){drafts.delete(oldKey);$('body').value='';$('page').value='';$('occurred').value='';}
    pending=null;sender.value='portal-ui';sender.onchange();current=result;remember();
    threads=threads.filter(t=>t.id!==result.id);threads.unshift(result);render();feedback('保存しました。');
  }catch(e){feedback(e.message+' 入力は保持しています。');}
  finally{lock(false);}
}
$('composer').onsubmit=e=>{e.preventDefault();submit('message')};
$('set-status').onclick=()=>submit('status');
window.addEventListener('beforeunload',e=>{if($('body')?.value.trim()||busy){e.preventDefault();e.returnValue='';}});
window.addEventListener('portalAccessLost',()=>{accessLost=true;drafts.clear();pending=null;current=null;threads=[];me=null;$('threads').replaceChildren();$('events').replaceChildren();$('detail').hidden=true;$('composer').hidden=true;$('who').textContent='利用許可が失効しました';$('body').value='';$('page').value='';$('occurred').value='';lock(true);feedback('利用許可が失効しました。再ログインして確認してください。');});
try{me=await api('me');$('who').textContent=accountPersonName(me.name,me.uid);threads=await api('threads');render();}catch(e){if(globalThis.supportTransport){feedback(e.message);lock(true);}else $('switch').click();}
