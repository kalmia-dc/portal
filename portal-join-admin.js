import {personName} from './portal-person-display.mjs?v=20261019-director';
import {approveApplication} from './portal-join-model.mjs';
import {staffNameKey} from './portal-roster-model.mjs';
import {defaultStaff} from './portal-default-staff.mjs';
export function setupJoinAdmin({actor,db,page={active:true},api,lock,isBusy,message,reloadManagement}) {
  const {get,ref,update,serverTimestamp}=api,$=id=>document.getElementById(id);
  let roster=[],selected=null,saving=false,completed=false,newStaffId='';
  $('registrationUrl').value=new URL('./google-account-register.html',location.href).href.split('?')[0];
  $('copyRegistrationUrl').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText($('registrationUrl').value);if(!page.active)return;$('copyRegistrationStatus').textContent='登録URLをコピーしました。本人へ渡してください。';}
    catch{if(!page.active)return;$('registrationUrl').select();$('copyRegistrationStatus').textContent='URLを選択しました。コピーして本人へ渡してください。';}
  });
  function modeChanged() {
    const existing=$('joinMode').value==='existing';$('joinExistingLabel').hidden=!existing;$('joinTypeLabel').hidden=existing;
    $('joinName').readOnly=existing;$('joinRole').disabled=existing;$('joinType').disabled=existing;
    if(existing) {
      const staff=roster.find(s=>s.id===$('joinExisting').value);
      $('joinName').value=staff?.name||'';$('joinRole').value=staff?.role||'DH';$('joinType').value=['full','part','spot'].includes(staff?.type)?staff.type:'full';
      $('joinApprovalHint').textContent='既存名簿の氏名・職種・雇用形態は変更せず、このGoogleアカウントを紐付けます。';
    } else {
      $('joinName').value=selected.name;$('joinRole').value=selected.jobRole;$('joinType').value='full';
      $('joinApprovalHint').textContent='氏名・職種は本人の申告です。雇用形態の初期値は常勤のため、必ず確認してください。';
    }
    $('joinIdentityChecked').checked=false;
  }
  async function open(request) {
    if(await get(ref(db,'laborConfig/enabled')).then(s=>s.val()===true).catch(()=>false)){location.assign('./labor-management.html');return;}
    if(isBusy()||actor.portalRole!=='admin')return;
    // Auth reconnect can close a pending dialog. Preserve that draft and its ID
    // when the same revision is opened again, but require a fresh identity check.
    if(selected?.uid===request.uid && selected.revision===request.revision && !completed) {
      lock(true);const previousId=$('joinExisting').value;$('joinExisting').replaceChildren(new Option('選んでください',''));for(const staff of roster)$('joinExisting').add(new Option(`${personName(staff.name,staff.id)} (${staff.role})`,staff.id));$('joinExisting').value=previousId;if($('joinMode').value==='existing')modeChanged();$('joinIdentityChecked').checked=false;$('joinApproval').showModal();return;
    }
    selected=request;completed=false;$('cancelJoinApproval').textContent='取り消す';$('joinApprovalForm').querySelectorAll('input,select,button').forEach(el=>el.disabled=false);newStaffId='staff_join_'+crypto.randomUUID();lock(true);
    $('joinApplicant').textContent=`${request.name} / ${request.email}\n申告職種：${request.jobRole}`;
    $('joinExisting').replaceChildren(new Option('選んでください',''));
    for(const staff of roster)$('joinExisting').add(new Option(`${personName(staff.name,staff.id)} (${staff.role})`,staff.id));
    const matches=roster.filter(s=>staffNameKey(s.name)===staffNameKey(request.name));
    $('joinMode').value=matches.length===1?'existing':'new';
    if(matches.length===1)$('joinExisting').value=matches[0].id;
    $('joinApprovalStatus').textContent='';modeChanged();$('joinApproval').showModal();
  }
  $('joinMode').addEventListener('change',modeChanged);$('joinExisting').addEventListener('change',modeChanged);
  $('cancelJoinApproval').addEventListener('click',()=>{if(!saving)$('joinApproval').close();});
  $('joinApproval').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  $('joinApproval').addEventListener('close',()=>{if(!saving){lock(false);if(completed)void reloadManagement();}});
  $('joinApprovalForm').addEventListener('submit',async event=>{
    event.preventDefault();if(saving||!selected||!$('joinIdentityChecked').checked)return;
    const selection={mode:$('joinMode').value,staffId:$('joinMode').value==='new'?newStaffId:$('joinExisting').value,name:$('joinName').value,role:$('joinRole').value,type:$('joinType').value};
    saving=true;$('joinApprovalForm').querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
    $('joinApprovalStatus').textContent='承認内容を保存しています。通信が切れた場合は接続復帰を待ってください。';
    try {
      const result=await approveApplication({actor,expected:selected,selection,timestamp:serverTimestamp(),
        readFresh:async uid=>{
          const [request,extra,member]=await Promise.all([`portalJoinRequests/${uid}`,'extra_staff',`portalAccess/users/${uid}`].map(p=>get(ref(db,p))));
          const freshRoster=new Map(defaultStaff.map(s=>[s.id,s]));for(const s of Object.values(extra.val()||{}))freshRoster.set(s.id,s);
          return {current:request.val(),roster:[...freshRoster.values()],member:member.val()};
        },commit:updates=>update(ref(db),updates)});
      if(!$('joinApproval'))return;
      if(result.approval){$('joinName').value=result.approval.name;$('joinRole').value=result.approval.role;$('joinType').value=result.approval.type;}
      $('joinApprovalStatus').textContent=result.alreadyApproved?'すでに承認が完了しています。保存済みの内容を表示しています。':'承認が完了しました。本人へポータルの利用開始を案内してください。';
      completed=true;$('cancelJoinApproval').textContent='閉じる';$('submitJoinApproval').hidden=true;message('承認が完了しました。「一覧を再読み込み」で表示を更新できます。');
    } catch(error){if($('joinApprovalStatus'))$('joinApprovalStatus').textContent=`承認を完了できませんでした。入力は残っています。再試行できます。申請更新・名簿重複の場合は閉じて一覧を再読み込みしてください。 ${error.message}`;}
    finally{
      saving=false;
      if($('joinApprovalForm')){
        $('joinApprovalForm').querySelectorAll('input,select,button').forEach(el=>el.disabled=completed && el.id!=='cancelJoinApproval');
        const existing=$('joinMode').value==='existing';$('joinRole').disabled=completed||existing;$('joinType').disabled=completed||existing;
        if(!$('joinApproval').open){lock(false);if(completed)void reloadManagement();else message('承認は未確認です。「確認して承認」を開くと入力から再開できます。',true);}
      }
    }
  });
  return {async load(currentRoster) {
    if(!page.active)return new Set();
    roster=currentRoster;$('joinRequests').replaceChildren();
    if(actor.portalRole!=='admin')return new Set();
    try {
      const requests=(await get(ref(db,'portalJoinRequests'))).val()||{};
      if(!page.active)return new Set();
      const pending=Object.values(requests).filter(r=>r.state==='pending');
      $('joinStatus').textContent=pending.length?`${pending.length}件の申請があります。本人のメールアドレスを照合して承認してください。`:'承認待ちの申請はありません。';
      for(const request of pending){const row=document.createElement('div');row.className='row';const p=document.createElement('p');p.textContent=`${request.name}（${request.jobRole}） / ${request.email}`;const b=document.createElement('button');b.type='button';b.textContent='確認して承認';b.addEventListener('click',()=>{$('submitJoinApproval').hidden=false;open(request)});row.append(p,b);$('joinRequests').append(row);}
      return new Set(Object.keys(requests));
    } catch{if(!page.active)return new Set();$('joinStatus').textContent='本人からの申請を読み込めません。通信状況・申請用DBルールを確認してください。以前のログイン申請は下で確認できます。';return new Set();}
  }};
}
