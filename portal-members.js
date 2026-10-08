import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, get, onValue, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { startPortalAuth } from './portal-auth.js';
import { performMemberChange } from './portal-members-model.mjs';

const firebaseConfig={apiKey:'AIzaSyDdMe7feUF6CKPHH0YIx7Suk-WnXtOYUu8',authDomain:'kalmia-shift.firebaseapp.com',databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'kalmia-shift',storageBucket:'kalmia-shift.firebasestorage.app',messagingSenderId:'714175473480',appId:'1:714175473480:web:7d6626a46e4a9dcb1fb57d'};
const defaultStaff = [
  ['sugihira','杉平','DR'],['shimanaka','嶋中','DR'],['hokari','保刈','DR'],['shinoda','篠田','DR'],['kyosei','矯正医','DR'],
  ['tsuruta','鶴田','DH'],['yoshida','吉田','DH'],['takagi','高木','DH'],['matsumoto','松本','DH'],['yamada','山田','DH'],['hanowa','ハノワ','DH'],
  ['tamiya','田宮','DA'],['tanaka','田中','DA'],['momo','百々','DA'],
].map(([id,name,role]) => ({id,name,role}));
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const $ = id => document.getElementById(id);
const actor = await startPortalAuth(app,{pageName:'ログインメンバー管理'});
let busy = false;
function message(text, error = false) { $('status').textContent=text; $('status').classList.toggle('error',error); }
function lock(value) {
  busy=value;
  document.querySelectorAll('#management button,#management select').forEach(el => {el.disabled=value || el.dataset.protected === 'true';});
}
function text(parent, value, className='') { const p=document.createElement('p'); p.textContent=value; p.className=className; parent.append(p); }
function row(parent, uid, data) {
  const node=document.createElement('div'); node.className='row';
  text(node,data.name || data.displayName || '名前未入力');
  text(node,data.email || 'メール情報なし（UIDで照合してください）');
  text(node,`UID: ${uid}`,'details'); parent.append(node); return node;
}
function confirmChange(description,label) {
  const dialog=$('confirmation');dialog.returnValue='cancel';
  $('confirmText').textContent=description;$('confirmApply').textContent=`${label}する`;
  return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue==='apply'),{once:true});dialog.showModal();});
}
async function change(uid, expected, action, staff, accountEmail='') {
  if(busy) return;
  lock(true);
  try {
    const labels={register:'登録',revoke:'許可解除',restore:'再許可'};
    const result=await performMemberChange({actor,uid,expected,action,staff,timestamp:serverTimestamp(),
      confirm:() => confirmChange(`${expected?.name || staff?.name || ''}\n${expected?.email || accountEmail}\nUID: ${uid}\n${labels[action]}しますか？\n勤務・勤怠・履歴データは削除されません。`,labels[action]),
      readRequest:async id => (await get(ref(db,`portalAccessRequests/${id}`))).val(),
      transact:async(id, transform) => {
        const target=ref(db,`portalAccess/users/${id}`);
        // Keep a listener alive so the transaction's cache contains the record.
        // get() alone does not retain it for runTransaction in the Firebase SDK.
        let off;
        try {
          await new Promise((resolve,reject)=>{off=onValue(target,resolve,reject);});
          await get(target);
          return await runTransaction(target,transform,{applyLocally:false});
        } finally { off?.(); }
      },
    });
    if(result.cancelled) { message('操作を取り消しました。'); return; }
    await load(`${labels[action]}しました。`);
  } catch(error) {
    // Clear actionable stale data after every failure. A fresh explicit read is required.
    $('requests').replaceChildren(); $('members').replaceChildren();
    message(`処理を完了できませんでした。一覧を再読み込みしてください。 ${error.message}`,true);
  } finally { lock(false); }
}
function button(parent,label,handler,protectedAccount=false) {
  const b=document.createElement('button'); b.type='button';b.textContent=label;
  b.dataset.protected=String(protectedAccount); b.disabled=protectedAccount;
  b.addEventListener('click',handler); parent.append(b);return b;
}
async function load(success='一覧を読み込みました。') {
  lock(true); $('requests').replaceChildren(); $('members').replaceChildren();message('一覧を読み込んでいます。');
  try {
    const [u,r,s]=await Promise.all(['portalAccess/users','portalAccessRequests','extra_staff'].map(path=>get(ref(db,path))));
    const users=u.val()||{}, requests=r.val()||{};
    const roster=new Map(defaultStaff.map(staff=>[staff.id,staff]));
    for(const staff of Object.values(s.val()||{})) if(staff?.id && staff.name && ['DR','DH','DA'].includes(staff.role)) roster.set(staff.id,{id:staff.id,name:staff.name,role:staff.role});
    for(const [uid,request] of Object.entries(requests)) {
      if(users[uid]) continue;
      const node=row($('requests'),uid,request);
      text(node,`申請されたスタッフ: ${request.requestedName || request.requestedStaffId || '指定なし'}`,'details');
      const actions=document.createElement('div');actions.className='actions';node.append(actions);
      const select=document.createElement('select');select.setAttribute('aria-label',`${request.email || uid} に対応するスタッフ`);
      select.add(new Option('スタッフを選択してください',''));
      for(const staff of roster.values()) select.add(new Option(`${staff.name} (${staff.role} / ${staff.id})`,staff.id));
      actions.append(select);
      button(actions,'一般スタッフとして登録',()=>change(uid,null,'register',roster.get(select.value),request.email));
    }
    if(!$('requests').children.length) text($('requests'),'未登録の申請はありません。');
    for(const [uid,member] of Object.entries(users)) {
      const node=row($('members'),uid,member);
      text(node,`${member.active === true ? '許可中' : '解除済み'} / ${member.role} / スタッフID: ${member.staffId}`);
      const protectedAccount=uid===actor.uid || !['staff','trainingAdmin'].includes(member.role);
      const label=protectedAccount?'保護されたアカウント':member.active===true?'許可解除':'再許可';
      const b=button(node,label,()=>change(uid,member,member.active===true?'revoke':'restore'),protectedAccount);
      if(!protectedAccount && member.active===true) b.className='danger';
    }
    if(!$('members').children.length) text($('members'),'登録済みメンバーはありません。');
    message(success);
  } catch(error) {
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
