// Single-entry edits stay in the existing month transaction and admin permission scope.
let modalEntrySnapshot = null;
let shiftEntryConfirmation = null;
function requestShiftEntryConfirmation(message){
  document.getElementById('shiftEntryConfirmText').textContent=message;
  document.getElementById('shiftEntryConfirm').hidden=false;
  for(const id of ['applyShiftButton','deleteShiftButton','restoreShiftButton'])document.getElementById(id).disabled=true;
  return new Promise(resolve=>{shiftEntryConfirmation=resolve;});
}
function finishShiftEntryConfirmation(answer){
  document.getElementById('shiftEntryConfirm').hidden=true;
  const resolve=shiftEntryConfirmation;shiftEntryConfirmation=null;
  for(const id of ['applyShiftButton','deleteShiftButton','restoreShiftButton'])document.getElementById(id).disabled=false;
  if(resolve)resolve(answer);
}
function shiftEntrySnapshot(data, sid, ds){
  return {key:data?.[sid]?.[ds]??null,time:data?.__manualTimes?.[sid]?.[ds]??null,
    cancelled:data?.__cancelledShifts?.[sid]?.[ds]??null};
}
function sameShiftEntry(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function renderShiftEntryPicker(){
  const select=document.getElementById('entryStaff');
  const selected=select.value;
  select.innerHTML='';
  for(const role of ['DR','DH','DA']){
    const group=document.createElement('optgroup');
    group.label={DR:'DR（歯科医師）',DH:'DH（歯科衛生士）',DA:'DA（歯科助手）'}[role];
    for(const staff of orderedShiftStaff().filter(s=>s.role===role&&canRegisterShiftStaff(s.id))){
      const option=document.createElement('option');option.value=staff.id;
      option.textContent=staff.name+'（'+shiftEmploymentLabel(staff)+'）';group.appendChild(option);
    }
    select.appendChild(group);
  }
  if(STAFF.some(s=>s.id===selected))select.value=selected;
  select.disabled=!shiftMembersLoaded;
  const management=document.getElementById('monthStaff'),previous=management.value;
  management.innerHTML='';
  for(const staff of orderedShiftStaff()){
    const option=document.createElement('option');option.value=staff.id;
    option.textContent=`${staff.name}（${staff.role}）`+(shiftMembersLoaded&&staffAccessIssue(staff.id)?'・解除/要確認（取消可）':'');
    management.appendChild(option);
  }
  if(STAFF.some(s=>s.id===previous))management.value=previous;
  renderStaffMonthActions();
  const date=document.getElementById('entryDate');
  if(!date.value)date.value=dateStr(currentYear,currentMonth,1);
}
function openSelectedShift(){
  if(currentUser?.role!=='admin'||manualSavePending||shiftEntryConfirmation||staffMonthOperation||staffOrderDraft)return;
  if(!canRegisterShiftStaff(document.getElementById('entryStaff').value))return alert('登録できるスタッフを選択してください。メンバーの許可状態を確認できない場合も登録できません。');
  const ds=document.getElementById('entryDate').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ds))return alert('日付を選択してください。');
  const [y,m,d]=ds.split('-').map(Number);
  if(y<2000||y>2100||d>daysInMonth(y,m-1))return alert('日付を確認してください。');
  if(shiftLocks[ds.slice(0,7)])return alert('確定済みのシフトは編集できません。');
  currentYear=y;currentMonth=m-1;loadShiftForMonth(y,m-1);render();updateLockUI();
  openModal(document.getElementById('entryStaff').value,ds);
}
function setShiftEntryPending(pending){
  manualSavePending=pending;
  document.getElementById('editModal').querySelectorAll('button,input').forEach(el=>el.disabled=pending);
  if(!pending)refreshManualTimeEditor();
}
async function cancelOrRestoreShift(restore=false){
  if(currentUser?.role!=='admin'||manualSavePending||shiftEntryConfirmation||staffMonthOperation||staffOrderDraft||isCurrentMonthLocked()||!modalStaffId)return;
  const sid=modalStaffId,ds=modalDateStr,month=ds.slice(0,7);
  const expected=structuredClone(modalEntrySnapshot),staff=STAFF.find(s=>s.id===sid);
  const entry=restore?expected.cancelled:expected;
  if(!entry?.key||!staff)return;
  const label=Object.values(SHIFT).find(s=>s.key===entry.key)?.shortLabel||entry.key;
  const detail=entry.time?` ${entry.time.start}〜${entry.time.end}（休憩${entry.time.breakMinutes}分）`:'';
  if(!await requestShiftEntryConfirmation(`${staff.name}（${staff.role}） ${ds}\n${label}${detail}\nこの1件を${restore?'復元':'削除（取り消し）'}しますか？\n${restore?'他の登録がある場合は上書きしません。':'このセルから復元できます。休暇申請・勤怠記録は変更しません。'}`))return;
  if(currentUser?.role!=='admin'||shiftLocks[month])return;
  const error=document.getElementById('manualTimeError');
  try{
    if(!window._fb||window._fb.shiftConnected!==true)throw Error('接続を確認して、もう一度操作してください。');
    setShiftEntryPending(true);error.textContent='サーバー確認中です。通信が切れた場合は再接続までお待ちください。';
    const memberVersion=restore?await assertShiftStaffCanRegister(sid):null;
    const {db,ref,get,runTransaction}=window._fb;
    if((await get(ref(db,'shift_locks/'+firebaseSafeKey(month)))).val())throw Error('確定済みのシフトは変更できません。');
    const cancelledAt=new Date().toISOString();
    const result=await runTransaction(ref(db,'shifts/'+month),data=>{
      if(currentUser?.role!=='admin'||window._fb.shiftConnected!==true||(restore&&!shiftRegistrationStillAllowed(sid,memberVersion))||shiftLocks[month]||!sameShiftEntry(shiftEntrySnapshot(data,sid,ds),expected))return;
      const next=data||{};
      if(restore){
        if(next[sid]?.[ds])return;
        (next[sid]??={})[ds]=entry.key;
        if(entry.time)((next.__manualTimes??={})[sid]??={})[ds]=entry.time;
        delete next.__cancelledShifts[sid][ds];
      }else{
        ((next.__cancelledShifts??={})[sid]??={})[ds]={key:entry.key,cancelledAt,...(entry.time?{time:entry.time}:{})};
        delete next[sid][ds];
        if(next.__manualTimes?.[sid])delete next.__manualTimes[sid][ds];
      }
      return next;
    },{applyLocally:false});
    if(!result.committed)throw Error('別の更新または権限・確定状態の変更があります。閉じて開き直してください。');
    allShiftData[month]=result.snapshot.val()||{};
    if(monthKey(currentYear,currentMonth)===month)loadShiftForMonth(currentYear,currentMonth);
    if(!restore){if(paidData[sid])delete paidData[sid][ds];if(wishData[sid])delete wishData[sid][ds];}
    setShiftEntryPending(false);closeModal();render();
  }catch(e){error.textContent='変更できません：'+e.message;}
  finally{setShiftEntryPending(false);}
}
