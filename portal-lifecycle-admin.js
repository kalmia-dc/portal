import {isLifecycleStopped,linkedAccounts,lifecycleProtection,performLifecycleChange} from './portal-lifecycle-model.mjs';
export function setupLifecycleAdmin({actor,db,page={active:true},api,lock,isBusy,reload,defaultStaff}){
  const $=id=>document.getElementById(id),{get,ref,onValue,runTransaction,serverTimestamp}=api;
  let users={},roster=[],states={},ready=false,saving=false,selection=null,operationId='',completed=false;
  const route=async mode=>{if(isBusy())return;if(await get(ref(db,'laborConfig/enabled')).then(s=>s.val()===true).catch(()=>false)){location.assign('./labor-management.html');return;}if(!page.active)return;for(const el of document.querySelectorAll('[data-flow]'))el.hidden=el.dataset.flow!==mode;$('flowHome').hidden=!!mode;document.querySelector(`[data-flow="${mode}"] h2`)?.focus();};
  $('startRegistration').onclick=()=>route('register');$('startRetirement').onclick=()=>route('retire');
  for(const b of document.querySelectorAll('[data-flow-back]'))b.onclick=()=>route('');
  function render(){
    const stopped=$('showStoppedMembers').checked;$('lifecycleList').replaceChildren();
    for(const staff of roster.filter(s=>isLifecycleStopped(states[s.id])===stopped)){
      const row=document.createElement('div');row.className='row';const name=document.createElement('strong');name.textContent=`${staff.name}（${staff.role||'職種未設定'}）`;
      const linked=linkedAccounts(users,staff.id),p=document.createElement('p');p.textContent=`${stopped?'利用停止中':'通常表示'}・関連ログイン ${linked.length}件`;
      const b=document.createElement('button');b.type='button';b.textContent=stopped?'復帰の内容を確認':'このスタッフを選ぶ';
      const protectedReason=lifecycleProtection(actor,staff,users);b.disabled=!ready||!!protectedReason;b.dataset.protected=String(b.disabled);
      b.onclick=()=>open(staff,stopped?'restore':'stop');row.append(name,p,b);
      if(protectedReason){const hint=document.createElement('p');hint.className='details';hint.textContent=protectedReason;row.append(hint);} $('lifecycleList').append(row);
    }
    if(!$('lifecycleList').children.length)$('lifecycleList').textContent=stopped?'利用停止中のスタッフはいません。':'対象のスタッフはいません。';
  }
  $('showStoppedMembers').onchange=render;
  function open(staff,action){
    if(isBusy()||!ready||lifecycleProtection(actor,staff,users))return;
    if(completed||selection?.staff.id!==staff.id||selection?.action!==action||selection?.expected?.revision!==states[staff.id]?.revision){selection={staff,action,expected:states[staff.id]||null};operationId=crypto.randomUUID();}
    completed=false;lock(true);
    $('lifecycleTitle').textContent=action==='stop'?'2. 停止する内容を確認':'2. 復帰する内容を確認';
    $('lifecycleTarget').textContent=`${staff.name}（${staff.role||'職種未設定'}）`;
    $('lifecycleAccounts').replaceChildren();const linked=linkedAccounts(users,staff.id);
    for(const m of linked){const li=document.createElement('li');li.textContent=`${m.email||m.uid}：${m.active===true?(action==='stop'?'ログイン停止':'ログイン再開'):'個別解除済みのため、解除状態を維持'}`;$('lifecycleAccounts').append(li);}
    if(!linked.length)$('lifecycleAccounts').textContent='紐付いたログインはありません。名簿・シフト・勤怠の表示状態を変更します。';
    $('lifecycleEffects').textContent=action==='stop'?'通常の名簿・シフト・勤怠候補から非表示にし、関連する一般スタッフのログインをまとめて停止します。過去の勤務・勤怠・集計は残ります。保存済みの未来の予定も削除しません。':'通常一覧への表示を戻し、以前に個別許可されていたログインを再開します。個別解除済みのアカウントは再許可しません。';
    $('lifecycleChecked').checked=false;$('lifecycleStatus').textContent='';$('lifecycleSubmit').hidden=false;$('lifecycleSubmit').textContent=action==='stop'?'利用停止を確定':'復帰を確定';$('lifecycleClose').textContent='取り消す';$('lifecycleDialog').showModal();
  }
  $('lifecycleClose').onclick=()=>{if(!saving)$('lifecycleDialog').close();};
  $('lifecycleDialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  $('lifecycleDialog').addEventListener('close',()=>{if(!saving)lock(false);});
  $('lifecycleForm').onsubmit=async e=>{
    e.preventDefault();if(saving||!selection||!$('lifecycleChecked').checked)return;saving=true;
    $('lifecycleForm').querySelectorAll('button,input').forEach(el=>el.disabled=true);$('lifecycleStatus').textContent='保存しています。接続が切れた場合は復旧を待ってください。';
    try{
      const {staff,action,expected}=selection;
      await performLifecycleChange({actor,staff,expected,action,operationId,timestamp:serverTimestamp(),readFresh:async()=>{
        const [u,extra]=await Promise.all(['portalAccess/users','extra_staff'].map(p=>get(ref(db,p))));const fresh=new Map(defaultStaff.map(s=>[s.id,s]));for(const s of Object.values(extra.val()||{}))fresh.set(s.id,s);return {users:u.val()||{},roster:[...fresh.values()]};
      },transact:async(sid,transform)=>{const target=ref(db,'staffLifecycle/'+sid);let off;try{await new Promise((resolve,reject)=>{off=onValue(target,resolve,reject)});return await runTransaction(target,transform,{applyLocally:false});}finally{off?.();}}});
      completed=true;if(!$('lifecycleStatus'))return;$('lifecycleStatus').textContent=action==='stop'?'3. 利用停止が完了しました。履歴はそのまま確認できます。':'3. 復帰が完了しました。';$('lifecycleSubmit').hidden=true;$('lifecycleClose').textContent='閉じる';await reload();
    }catch(error){if($('lifecycleStatus'))$('lifecycleStatus').textContent=`完了を確認できませんでした。確認内容を保持しています。同じ操作を再試行できます。 ${error.message}`;}
    finally{saving=false;if($('lifecycleForm')){$('lifecycleForm').querySelectorAll('button,input').forEach(el=>el.disabled=false);if(!$('lifecycleDialog').open){lock(false);$('lifecycleLoadStatus').textContent=completed?'保存が完了しました。一覧を更新しました。':'保存結果を確認できません。同じ対象を選んで再試行するか、一覧を再読み込みしてください。';}}}
  };
  return {async load(currentRoster,currentUsers){roster=currentRoster;users=currentUsers;ready=false;
    try{states=(await get(ref(db,'staffLifecycle'))).val()||{};if(!page.active)return {states,ready:false};ready=true;$('lifecycleLoadStatus').textContent='1. 対象のスタッフを選んでください。';}catch{if(!page.active)return {states,ready:false};$('lifecycleLoadStatus').textContent='状態を取得できないため停止操作はできません。通信・在籍状態用ルールを確認して再読み込みしてください。';}
    render();return {states,ready};
  },unavailable(){if(!page.active)return;ready=false;$('lifecycleLoadStatus').textContent='状態を確認できません。一覧を再読み込みしてください。';render();},isStopped:sid=>isLifecycleStopped(states[sid])};
}
