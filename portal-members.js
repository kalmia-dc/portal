import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, get, onValue, runTransaction, serverTimestamp, update } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { startPortalAuth } from './portal-auth.js?v=labor-20261014-2';
import { createPageLifecycle } from './portal-page-lifecycle.mjs';
import { performMemberChange } from './portal-members-model.mjs';

const firebaseConfig={apiKey:'AIzaSyDdMe7feUF6CKPHH0YIx7Suk-WnXtOYUu8',authDomain:'kalmia-shift.firebaseapp.com',databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'kalmia-shift',storageBucket:'kalmia-shift.firebasestorage.app',messagingSenderId:'714175473480',appId:'1:714175473480:web:7d6626a46e4a9dcb1fb57d'};
import { setupLifecycleAdmin } from './portal-lifecycle-admin.js';
import { setupJoinAdmin } from './portal-join-admin.js';
import { defaultStaff } from './portal-default-staff.mjs';
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const $ = id => document.getElementById(id);
const page = createPageLifecycle();
const actor = await startPortalAuth(app,{pageName:'ログインアカウント一覧'});
if(page.active) {
let busy = false;
const liveGet=async(...args)=>{page.assertActive();const result=await get(...args);page.assertActive();return result;};
const liveOnValue=(target,next,error,...rest)=>{if(!page.active)return ()=>{};return page.add(onValue(target,page.guard(next),page.guard(error),...rest));};
const liveUpdate=(...args)=>{page.assertActive();return update(...args);};
const liveTransaction=(target,transform,...rest)=>{page.assertActive();return runTransaction(target,page.guard(transform),...rest);};
const joinAdmin=setupJoinAdmin({actor,db,page,api:{get:liveGet,ref,update:liveUpdate,serverTimestamp},lock,isBusy:()=>busy,message,reloadManagement:()=>load('承認が完了しました。').catch(()=>{})});
const lifecycleAdmin=setupLifecycleAdmin({actor,db,page,api:{get:liveGet,ref,onValue:liveOnValue,runTransaction:liveTransaction,serverTimestamp},lock,isBusy:()=>busy,reload:()=>load(),defaultStaff});
function message(text, error = false) { if(!page.active)return; $('status').textContent=text; $('status').classList.toggle('error',error); }
function lock(value) {
  busy=value;
  document.querySelectorAll('#management button,#management select,#management input').forEach(el => {el.disabled=value || el.dataset.protected === 'true';});
}
function text(parent, value, className='') { const p=document.createElement('p'); p.textContent=value; p.className=className; parent.append(p); }
function row(parent, uid, data) {
  const node=document.createElement('div'); node.className='row';
  text(node,data.name || data.displayName || '名前未入力');
  text(node,data.email || 'メール情報なし（UIDで照合してください）');
  text(node,`UID: ${uid}`,'details'); parent.append(node); return node;
}
function confirmChange(description,label) {
  if(!page.active)return Promise.resolve(false);
  const dialog=$('confirmation');dialog.returnValue='cancel';
  $('confirmText').textContent=description;$('confirmApply').textContent=`${label}する`;
  return new Promise(resolve=>{
    const cancel=page.add(()=>resolve(false));
    dialog.addEventListener('close',()=>{resolve(page.active&&dialog.returnValue==='apply');cancel();},{once:true});
    dialog.showModal();
  });
}
async function change(uid, expected, action, staff, accountEmail='') {
  if(!page.active||busy) return;
  if(await liveGet(ref(db,'laborConfig/enabled')).then(s=>s.val()===true).catch(()=>false)){message('入退社・アカウントの変更は労務管理で行ってください。');location.assign('./labor-management.html');return;}
  if(!page.active)return;
  lock(true);
  try {
    page.assertActive();
    const labels={register:'登録',revoke:'許可解除',restore:'再許可'};
    const result=await performMemberChange({actor,uid,expected,action,staff,timestamp:serverTimestamp(),
      confirm:() => confirmChange(`${expected?.name || staff?.name || ''}\n${expected?.email || accountEmail}\nUID: ${uid}\n${labels[action]}しますか？\n勤務・勤怠・履歴データは削除されません。`,labels[action]),
      readRequest:async id => {
        const request=(await liveGet(ref(db,`portalAccessRequests/${id}`))).val();
        if(request?.email!==accountEmail) throw Error('申請のメールアドレスが変わりました。一覧を再読み込みして本人と照合してください。');
        const extra=(await liveGet(ref(db,'extra_staff'))).val() || {};
        const fresh=extra[staff?.id] || defaultStaff.find(s=>s.id===staff?.id);
        if(!fresh || fresh.name!==staff?.name || fresh.role!==staff?.role) throw Error('スタッフ名簿が変わりました。一覧を再読み込みしてください。');
        return request;
      },
      transact:async(id, transform) => {
        const target=ref(db,`portalAccess/users/${id}`);
        // Keep a listener alive so the transaction's cache contains the record.
        // get() alone does not retain it for runTransaction in the Firebase SDK.
        let off;
        try {
          await new Promise((resolve,reject)=>{off=liveOnValue(target,resolve,reject);});
          await liveGet(target);
          return await liveTransaction(target,transform,{applyLocally:false});
        } finally { off?.(); }
      },
    });
    if(result.cancelled) { message('操作を取り消しました。'); return; }
    await load(`${labels[action]}しました。`).catch(()=>message(`${labels[action]}は完了しました。一覧の再取得に失敗しました。「一覧を再読み込み」を押してください。`,true));
  } catch(error) {
    // Keep the selected staff after a failed write; the retry rechecks the request,
    // roster and entire account record before changing permissions.
    message(`処理を完了できませんでした。選択は残っています。 ${error.message}`,true);
  } finally { lock(false); }
}
function button(parent,label,handler,protectedAccount=false) {
  const b=document.createElement('button'); b.type='button';b.textContent=label;
  b.dataset.protected=String(protectedAccount); b.disabled=protectedAccount;
  b.addEventListener('click',handler); parent.append(b);return b;
}
async function load(success='一覧を読み込みました。') {
  if(!page.active)return;
  const selections=new Map([...document.querySelectorAll('#requests select')].map(el=>[el.dataset.uid,el.value]));
  lock(true); $('requests').replaceChildren(); $('members').replaceChildren();message('一覧を読み込んでいます。');
  try {
    // Resolve the current mode before exposing any legacy mutation controls.
    $('legacyManagement').hidden=true;$('accountReview').hidden=true;
    const laborEnabled=(await liveGet(ref(db,'laborConfig/enabled'))).val()===true;
    if(laborEnabled){
      document.title='ログインアカウント一覧 | カルミアDC';$('pageTitle').textContent='ログインアカウント一覧';
      const [accounts,lifecycle]=await Promise.all(['portalAccess/users','staffLifecycle'].map(path=>liveGet(ref(db,path))));
      if(!page.active)return;
      const users=accounts.val()||{},states=lifecycle.val()||{};$('accountReviewRows').replaceChildren();
      for(const [uid,member] of Object.entries(users)){
        const node=row($('accountReviewRows'),uid,member);
        text(node,`${states[member.staffId]?.state==='stopped'?'スタッフ単位で利用停止中':member.active===true?'個別許可あり':'個別解除済み'} / ${member.role} / スタッフID: ${member.staffId}`);
      }
      if(!Object.keys(users).length)text($('accountReviewRows'),'登録済みアカウントはありません。');
      $('accountReview').hidden=false;message('アカウント一覧を読み込みました。変更は労務管理で行ってください。');return;
    }
    document.title='ログインメンバー管理 | カルミアDC';$('pageTitle').textContent='ログインメンバー管理';
    $('legacyManagement').hidden=false;
    const [u,r,s]=await Promise.all(['portalAccess/users','portalAccessRequests','extra_staff'].map(path=>liveGet(ref(db,path))));
    if(!page.active)return;
    const users=u.val()||{}, requests=r.val()||{};
    const roster=new Map(defaultStaff.map(staff=>[staff.id,staff]));
    for(const staff of Object.values(s.val()||{})) if(staff?.id && staff.name && ['DR','DH','DA'].includes(staff.role)) roster.set(staff.id,{...staff});
    const lifecycle=await lifecycleAdmin.load([...roster.values()],users);
    if(!page.active)return;
    const renderRoster=()=>{ $('currentRoster').replaceChildren();for(const staff of roster.values())if($('showAllRoster').checked||!lifecycleAdmin.isStopped(staff.id))text($('currentRoster'),`${staff.name} (${staff.role})${lifecycleAdmin.isStopped(staff.id)?'・利用停止中':''}`);};$('showAllRoster').onchange=renderRoster;renderRoster();
    const joinIds=await joinAdmin.load([...roster.values()].filter(s=>!lifecycleAdmin.isStopped(s.id)));
    if(!page.active)return;
    for(const [uid,request] of Object.entries(requests)) {
      if(users[uid] || joinIds.has(uid)) continue;
      const node=row($('requests'),uid,request);
      text(node,`申請されたスタッフ: ${request.requestedName || request.requestedStaffId || '指定なし'}`,'details');
      const actions=document.createElement('div');actions.className='actions';node.append(actions);
      const select=document.createElement('select');select.setAttribute('aria-label',`${request.email || uid} に対応するスタッフ`);
      select.dataset.uid=uid;
      select.add(new Option('スタッフを選択してください',''));
      for(const staff of roster.values()) if(!lifecycleAdmin.isStopped(staff.id)) select.add(new Option(`${staff.name} (${staff.role} / ${staff.id})`,staff.id));
      // Preserve explicit choices; never automatically bind a new name to an account.
      if(roster.has(selections.get(uid))) select.value=selections.get(uid);
      actions.append(select);
      button(actions,'一般スタッフとして登録',()=>change(uid,null,'register',roster.get(select.value),request.email));
    }
    if(!$('requests').children.length) text($('requests'),'未登録の申請はありません。');
    for(const [uid,member] of Object.entries(users)) {
      const node=row($('members'),uid,member);
      text(node,`${lifecycleAdmin.isStopped(member.staffId)?'スタッフ単位で利用停止中':member.active === true ? '個別許可あり' : '個別解除済み'} / ${member.role} / スタッフID: ${member.staffId}`);
      const protectedAccount=lifecycleAdmin.isStopped(member.staffId)||uid===actor.uid || !['staff','trainingAdmin'].includes(member.role);
      const label=protectedAccount?'保護されたアカウント':member.active===true?'許可解除':'再許可';
      const b=button(node,label,()=>change(uid,member,member.active===true?'revoke':'restore'),protectedAccount);
      if(!protectedAccount && member.active===true) b.className='danger';
    }
    if(!$('members').children.length) text($('members'),'登録済みメンバーはありません。');
    message(success);
  } catch(error) {
    if(!page.active)return;
    lifecycleAdmin.unavailable();
    $('requests').replaceChildren();$('members').replaceChildren();
    message('一覧を取得できませんでした。通信状況と管理者権限、DBルールの適用状況を確認して再読み込みしてください。',true);
    throw error;
  } finally { lock(false); }
}
if(actor.portalRole!=='admin') message('管理者専用です。ポータルへ戻ってください。',true);
else {
  $('management').hidden=false;
  $('reload').addEventListener('click',()=>{if(!busy) void load().catch(()=>{});});
  await load().catch(()=>{});
}

}
