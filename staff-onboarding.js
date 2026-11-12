import {showContract} from './staff-contract.js';
import {consentBlocks, documents, roleDocuments, ROLES, VERSION} from './onboarding-functions/catalog.mjs';
import {connectOnboarding} from './staff-onboarding-runtime.js';

const el = id => document.getElementById(id);
const review = new URLSearchParams(location.search).get('mode')==='review';
const states = {draft:'未提出',submitted:'確認待ち',returned:'差し戻し',accepted:'確認済み',exempt:'対象外',purged:'確認済み・画像削除済み'};
const dialog = el('detail');
const form = el('form');
const fields = el('fields');
const actions = el('actions');
let call, candidates=[], selected=null, current=null, active=true;
let urls=[];

function element(tag,text='') {
  const node=document.createElement(tag);
  node.textContent=text;
  return node;
}
function notice(id,text,error=false) {
  el(id).textContent=text;
  el(id).classList.toggle('error',error);
}
function button(parent,label,handler,primary=false) {
  const b=element('button',label);
  b.type='button';
  if(primary) b.className='primary';
  b.addEventListener('click',handler);
  parent.append(b);
  return b;
}
function request(action,extra={}) {
  if(!active) throw Error('利用を再開するには画面を読み込んでください。');
  return call({action,mode:review?'review':'self',staff:selected?.staff,period:selected?.period,...extra});
}
function wipe() {
  urls.forEach(url=>URL.revokeObjectURL(url));
  urls=[];
  fields.replaceChildren();
  actions.replaceChildren();
}
function closeDetail() {
  wipe();
  if(dialog.open) dialog.close();
}
dialog.addEventListener('cancel',event=>{
  event.preventDefault();
  if(dialog.dataset.pending!=='true') closeDetail();
});
form.addEventListener('submit',event=>event.preventDefault());
function lock() {
  active=false;
  closeDetail();
  el('case').hidden=true;
  el('casePicker').hidden=true;
  el('items').replaceChildren();
  el('staff').replaceChildren();
  candidates=[];
  selected=current=null;
  notice('message','利用を再開するには画面を読み込んでください。');
}
window.addEventListener('pagehide',lock);
window.addEventListener('pageshow',event=>{if(event.persisted) location.reload();});
for(const event of ['portalAccessLost','portalSessionLost','laborAccessLost']) window.addEventListener(event,lock);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden && dialog.open && dialog.dataset.restricted==='true') closeDetail();
});

async function loadCase() {
  el('case').hidden=true;
  current=null;
  if(review && !selected?.opened) {
    el('openCase').hidden=!selected;
    notice('message',selected?'この職員の提出を受け付けるには手続きを開始してください。':'職員を選んでください。');
    return;
  }
  el('openCase').hidden=true;
  const target=selected;
  const result=await request('status');
  if(!active || selected!==target) return;
  current=result;
  el('caseTitle').textContent=review?`${selected.name}（${ROLES[current.role]}）`:ROLES[current.role]+'の提出書類';
  notice('message',review?'確認する書類を選んでください。':'書類ごとに入力・提出してください。');
  const list=el('items');
  list.replaceChildren();
  for(const [key,doc] of roleDocuments(current.role)) {
    const item=current.items[key];
    if(!item) continue;
    const row=element('div');
    row.className='item';
    row.append(element('strong',doc.label));
    const required=doc.optional && !item.required && item.state==='draft'?'（該当する場合）':'';
    row.append(element('small',doc.contract && item.stage!=='released' ? '準備中' : item.available ? states[item.state]+required : '準備中'));
    const restricted=doc.restricted && review && !current.vault;
    if(doc.restricted && current.canEnablePrehireVault) {
      button(row,'入社前の画像受付を開始',async()=>{
        if(!window.confirm('雇用が確定していることを確認し、マイナンバー画像の受付を開始しますか？')) return;
        try {await request('enable-prehire-vault',{confirm:true});if(selected===target) await loadCase();}
        catch(error) {notice('message',error.message,true);}
      });
    }
    if(item.available && !restricted) {
      const label=review?'開く':['draft','returned'].includes(item.state)?'入力・添付':'確認する';
      button(row,label,()=>showItem(key).catch(error=>notice('message',error.message,true)));
    }
    list.append(row);
  }
  el('case').hidden=false;
}

function input(label,type,value='',required=false) {
  const wrap=element('label',label);
  const field=document.createElement('input');
  field.type=type;
  if(type!=='file') field.value=value;
  field.required=required;
  wrap.append(field);
  fields.append(wrap);
  return field;
}
async function compressPhoto(file) {
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    image.src=url;
    await image.decode();
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.round(image.naturalWidth*scale);
    canvas.height=Math.round(image.naturalHeight*scale);
    const context=canvas.getContext('2d',{alpha:false});
    context.fillStyle='#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [0.92,0.83,0.73]) {
      const photo=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(photo && photo.size<=3*1024*1024) return photo;
    }
    throw Error();
  } catch {
    throw Error('画像を変換できませんでした。JPEGまたはPNGで撮り直すか、写真アプリから書き出してください。');
  } finally {URL.revokeObjectURL(url);}
}
async function readFile(file) {
  if(!file) return Promise.resolve(null);
  const convertible=/^image\/(jpeg|png|heic|heif)$/.test(file.type) || /\.(heic|heif)$/i.test(file.name||'');
  if(convertible && (file.size>3*1024*1024 || !/^image\/(jpeg|png)$/.test(file.type))) file=await compressPhoto(file);
  if(file.size>3*1024*1024) throw Error('ファイルは1枚3MB以下にしてください。');
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error('ファイルを読み取れませんでした。'));
    reader.onload=()=>resolve({type:file.type,data:String(reader.result).split(',')[1]});
    reader.readAsDataURL(file);
  });
}
function renderFiles(files,doc) {
  files.forEach((file,i)=>{
    const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:file.type}));
    urls.push(url);
    if(file.type.startsWith('image/')) {
      const image=element('img');
      image.src=url;
      image.alt=doc.restricted?(i===0?'確認画像の表面':'確認画像の裏面'):'提出された画像';
      image.className='file-preview';
      fields.append(image);
    } else {
      const link=element('a','添付PDFを保存');
      link.href=url;
      link.download='提出書類.pdf';
      fields.append(link);
    }
  });
}

async function showItem(key) {
  if(dialog.open) return;
  if(documents[key].contract) {
    const snapshot=current;
    const saved=await request('detail',{item:key});
    if(!active || current!==snapshot || dialog.open) return;
    wipe();
    return showContract({saved,review,dialog,fields,actions,element,input,button,notice,request,readFile,closeDetail,loadCase,urls,signerName:review?selected.name:current.signerName,presets:current.contractPresets||[]});
  }
  const snapshot=current;
  const item=snapshot.items[key], doc=documents[key];
  const editable=!review && ['draft','returned'].includes(item.state);
  let saved={};
  const canRead=item.revision>0 && (!review || item.state!=='draft') &&
    (!doc.restricted || (review && item.hasFiles));
  if(canRead) saved=await request('detail',{item:key});
  if(!active || snapshot!==current || dialog.open || (doc.restricted && document.hidden)) return;
  wipe();
  dialog.dataset.restricted=String(!!doc.restricted);
  el('detailTitle').textContent=doc.label;
  notice('detailMessage',item.reason||states[item.state]);
  if(doc.help) fields.append(element('p',doc.help));
  if(key==='identity' && editable) {
    const link=element('a','身元確認書の記入用紙を開く');
    link.href='staff-identity-form.html';
    link.target='_blank';
    link.rel='noopener';
    fields.append(link);
  }
  const entries=Object.fromEntries((doc.fields||[]).map(([name,label,required])=>{
    const field=input(label,name==='payMonth'?'month':'text',saved.fields?.[name]||'',required);
    field.readOnly=!editable;
    field.maxLength=name==='route'?500:80;
    if(['account','oneWay','roundTrip','monthly','duration'].includes(name)) field.inputMode='numeric';
    if(name==='distance') field.inputMode='decimal';
    if(doc===documents.bank) field.autocomplete='off';
    return [name,field];
  }));
  const archived=saved.consent?.blocks || saved.consent?.paragraphs?.map(text=>['paragraph',text]);
  const blocks=(!editable && archived) || consentBlocks(doc);
  const checks=[];
  for(const [kind,text] of blocks) {
    if(kind==='title') continue;
    if(kind==='check' && editable && doc.approved) {
      checks.push(input(text,'checkbox'));
      continue;
    }
    const name=editable?snapshot.signerName:saved.consent?.signerName;
    const shown=kind==='record' && name ? text.replace('［ポータルの登録氏名］',()=>name) : text;
    const block=element(kind==='heading'?'h3':'p',shown);
    if(kind==='record') block.className='consent-record';
    if(kind==='check' && !doc.approved) block.className='consent';
    fields.append(block);
    if(kind==='check' && editable) checks.push(input('内容を確認し、同意します','checkbox'));
  }
  if(editable && doc.approved && blocks.length && checks.length===0) {
    checks.push(input('全文を確認し、本人として署名します','checkbox'));
  }
  if(saved.consent) fields.append(element('p',(editable?'前回の同意日時 ':'同意日時 ')+new Date(saved.consent.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})));
  renderFiles(saved.files||[],doc);
  const fileFields=[];
  if(editable && doc.file) {
    for(const label of doc.restricted?['表面の画像','裏面の画像']:['添付ファイル']) {
      const file=input(label,'file');
      const photos='image/jpeg,image/png,image/heic,image/heif,.heic,.heif';
      file.accept=doc.restricted?photos:photos+',application/pdf';
      fileFields.push(file);
    }
    fields.append(element('p','保存できる大きさは1枚3MBまでです。大きい写真は端末で縮小します。'));
    if(!doc.restricted) fields.append(element('p','マイナンバーの画像は「マイナンバーの確認画像」から提出してください。'));
  }
  const revision=saved.revision??item.revision;
  let pending=false;
  async function change(action,extra) {
    if(pending) return;
    pending=true;
    dialog.dataset.pending='true';
    const buttons=[...actions.querySelectorAll('button')];
    buttons.forEach(b=>{b.disabled=true;});
    try {
      notice('detailMessage','処理しています…');
      const details=await extra();
      await request(action,{item:key,revision,operation:crypto.randomUUID(),...details});
      if(dialog.open) closeDetail();
      if(active) await loadCase();
    } catch(error) {
      notice(dialog.open?'detailMessage':'message',error.message,true);
    } finally {
      pending=false;
      dialog.dataset.pending='false';
      buttons.forEach(b=>{b.disabled=false;});
    }
  }
  if(editable) {
    const payload=async()=>{
      const chosen=await Promise.all(fileFields.map(field=>readFile(field.files[0])));
      if(doc.restricted && chosen.some(file=>!file)) throw Error('表面と裏面を選択してください。');
      return {fields:Object.fromEntries(Object.entries(entries).map(([name,field])=>[name,field.value])),
        agreed:checks.map(check=>check.checked),version:VERSION,
        ...(chosen.some(Boolean)?{files:chosen.filter(Boolean)}:{})};
    };
    if(!doc.restricted) button(actions,'途中保存',()=>change('save',payload));
    button(actions,'提出する',()=>change('submit',payload),true);
  }
  if(review) {
    if(item.state==='submitted') button(actions,'確認済みにする',()=>change('accept',async()=>({})),true);
    if(['submitted','accepted'].includes(item.state)) {
      const reason=doc.restricted?null:input('差し戻し理由','text');
      if(reason) reason.maxLength=240;
      button(actions,'差し戻す',()=>change('return',async()=>({reason:reason?.value||''})));
    }
    if(['draft','returned'].includes(item.state) && (doc.optional||key==='license')) {
      button(actions,'対象外にする',()=>change('exempt',async()=>({})));
    }
    if(doc.optional && ['draft','exempt'].includes(item.state)) {
      button(actions,'提出を依頼する',()=>change('require',async()=>({})));
    }
    if(doc.restricted && item.state==='accepted' && item.hasFiles) {
      const confirm=input('必要な手続きが終わり、画像が不要になったことを確認しました','checkbox');
      button(actions,'画像を削除する',()=>change('purge',async()=>({confirm:confirm.checked})));
    }
  }
  button(actions,'閉じる',closeDetail);
  dialog.showModal();
}

async function init() {
  if(review) {
    el('title').textContent='入社手続きの確認';
    el('back').textContent='労務管理へ戻る';
    el('back').href='labor-management.html';
  }
  call=await connectOnboarding();
  if(!active) return;
  if(!review) {await loadCase();return;}
  candidates=(await request('list')).cases;
  if(!active) return;
  const select=el('staff');
  select.add(new Option('職員を選んでください',''));
  candidates.sort((a,b)=>Number(b.opened)-Number(a.opened)||a.name.localeCompare(b.name,'ja'));
  candidates.forEach((candidate,index)=>{
    const label=candidate.archived?`・過去の手続き（${candidate.startDate||'開始日未登録'}）`:candidate.opened?'・受付開始済み':'';
    select.add(new Option(`${candidate.name}（${ROLES[candidate.role]}）${label}`,index));
  });
  select.addEventListener('change',()=>{
    selected=select.value===''?null:candidates[Number(select.value)];
    loadCase().catch(error=>notice('message',error.message,true));
  });
  el('openCase').addEventListener('click',async()=>{
    const target=selected;
    el('openCase').disabled=true;
    try {
      await request('open');
      target.opened=true;
      if(selected===target) await loadCase();
    } catch(error) {notice('message',error.message,true);}
    finally {el('openCase').disabled=false;}
  });
  el('casePicker').hidden=false;
  await loadCase();
}
init().catch(error=>notice('message',error.message,true));
