import {showContract} from './staff-contract.js?v=20261114-renewal';
import {connectOnboarding,onboardingApi} from './staff-onboarding-runtime.js?v=20261114-renewal';
import {connectLabor} from './labor-runtime.js?v=20261114-renewal';
import {renewalUpdate} from './labor-contract-renewal.mjs';
import {today} from './labor-model.mjs';
import {createPageLifecycle} from './portal-page-lifecycle.mjs';

const query=new URLSearchParams(location.search);
const review=query.get('mode')==='review',staff=query.get('staff');
const el=id=>document.getElementById(id);
const dialog=el('detail'),fields=el('fields'),actions=el('actions');
const lifecycle=createPageLifecycle();
let call,store,context,recipientUid,opening=false;
const urls=[];

function element(tag,text=''){
  const node=document.createElement(tag);node.textContent=text;return node;
}
function notice(id,text,error=false){
  const node=el(id);
  node.textContent=text;
  node.classList.toggle('error',error);
}
function input(label,type,value=''){
  const wrap=element('label',label),control=element('input');
  control.type=type;control.value=value;wrap.append(control);fields.append(wrap);
  return control;
}
function button(parent,label,handler,primary=false){
  const control=element('button',label);
  control.type='button';
  if(primary)control.className='primary';
  control.onclick=handler;parent.append(control);return control;
}
function request(action,extra={}){
  lifecycle.assertActive();
  return call({scope:'renewals',mode:review?'review':'self',staff,recipientUid,action,...extra});
}
function closeDetail(){
  urls.splice(0).forEach(url=>URL.revokeObjectURL(url));
  fields.replaceChildren();actions.replaceChildren();
  if(dialog.open)dialog.close();
}
function lock(){
  lifecycle.stop();
  context=null;recipientUid=undefined;
  closeDetail();
  el('case').hidden=true;
  el('staffName').textContent='';
  el('renewals').replaceChildren();
  notice('message','利用を再開するには画面を再読み込みしてください。');
}
window.addEventListener('pagehide',lock);
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
for(const event of ['portalAccessLost','portalSessionLost','laborAccessLost'])window.addEventListener(event,lock);
dialog.addEventListener('submit',event=>event.preventDefault());
dialog.addEventListener('cancel',event=>{
  event.preventDefault();
  if(dialog.dataset.pending!=='true')closeDetail();
});

function status(item){
  if(item.stage==='withdrawn')return '提示を取り下げ済み';
  if(item.stage==='preparing')return '準備中';
  return {draft:'本人の署名待ち',submitted:'署名済み・労務担当の確認待ち',accepted:'更新確定済み'}[item.state]||'確認中';
}
async function loadCase(){
  if(review){
    const employee=await store.renewalContext(staff);
    lifecycle.assertActive();
    recipientUid=employee.uid;
  }
  const result=await request('list');
  lifecycle.assertActive();
  context=result;
  el('staffName').textContent=result.name;
  el('newRenewal').hidden=!review||!result.canPrepare;
  const list=el('renewals');
  list.replaceChildren();
  for(const item of result.items){
    const row=element('div');row.className='item';
    row.append(element('strong',item.version||'更新契約書'),element('small',status(item)));
    button(row,'開く',()=>openRenewal(item.id));
    list.append(row);
  }
  if(!result.items.length)list.append(element('p','表示できる更新契約書はありません。'));
  notice('message',review&&!result.canPrepare?'契約書を提示するには、職員の入社日と利用可能な本人アカウントを確認してください。':'');
  el('case').hidden=false;
}
async function applyRenewal(saved){
  const {renewal}=saved;
  if(renewal.start>today(store.now()))throw Error('更新開始日以降に職員情報へ反映できます。');
  if(!window.confirm(`本人の署名を確認し、${renewal.start}からの雇用条件を職員情報に反映しますか？`))throw Error('更新確定を取り消しました。');
  const {record,uid}=await store.renewalContext(staff);
  lifecycle.assertActive();
  if(!record)throw Error('職員情報を確認できません。');
  if(uid!==saved.signerUid)throw Error('提示時の職員アカウントを確認してください。');
  const next=renewalUpdate(record.data,saved,today(store.now()));
  if(next)await store.save(next,record.revision,crypto.randomUUID());
  lifecycle.assertActive();
}
async function openRenewal(id){
  if(!lifecycle.active||!context||opening||dialog.open)return;
  opening=true;
  try{
    const saved=id?await request('detail',{id}):{revision:0,state:'draft',stage:'preparing'};
    lifecycle.assertActive();
    const itemId=id||crypto.randomUUID();
    showContract({saved:{...saved,id:itemId},review,dialog,fields,actions,element,input,button,notice,closeDetail,loadCase,urls,
      signerName:context.name,presets:context.presets,renewalDefaults:context.current||{},
      applyRenewal:review?applyRenewal:undefined,active:()=>lifecycle.active&&dialog.open,
      request:(action,extra)=>request(action,{id:itemId,...extra})});
  }catch(error){
    if(lifecycle.active)notice('message',error.message,true);
  }finally{opening=false;}
}
async function init(){
  if(review){
    el('back').textContent='労務管理へ戻る';el('back').href='labor-management.html';
    if(!/^[-_A-Za-z0-9]{1,120}$/.test(staff||''))throw Error('労務管理から職員を選んでください。');
    store=await connectLabor();call=onboardingApi();
  }else call=await connectOnboarding();
  lifecycle.assertActive();
  el('newRenewal').onclick=()=>openRenewal();
  el('refreshRenewals').onclick=()=>loadCase().catch(error=>{if(lifecycle.active)notice('message',error.message,true);});
  await loadCase();
}
init().catch(error=>{if(lifecycle.active)notice('message',error.message,true);});
