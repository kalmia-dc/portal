// A staff-month cancellation is one atomic update of the existing month node.
let staffMonthOperation=null;
function staffMonthSnapshot(data,sid,month){
  const dates=new Set([...Object.keys(data?.[sid]||{}),...Object.keys(data?.__manualTimes?.[sid]||{}),...Object.keys(data?.__cancelledShifts?.[sid]||{})]);
  const entries={};
  for(const ds of [...dates].sort())if(ds.startsWith(month+'-')&&/^\d{4}-\d{2}-\d{2}$/.test(ds))entries[ds]=shiftEntrySnapshot(data,sid,ds);
  return {entries,undo:data?.__staffMonthUndo?.[sid]??null};
}
function sameStaffMonthState(a,b){
  const canonical=v=>v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
function staffMonthRestoreDates(snapshot){
  const batch=snapshot.undo,dates=Object.keys(batch?.dates||{}).sort();
  if(!batch?.id||!dates.length)return [];
  return dates.every(ds=>{
    const e=snapshot.entries[ds];
    return e&&!e.key&&!e.time&&e.cancelled?.key&&e.cancelled.batchId===batch.id;
  })?dates:[];
}
function mutateStaffMonth(data,op){
  if(!sameStaffMonthState(staffMonthSnapshot(data,op.sid,op.month),op.expected))return;
  const dates=op.restore?staffMonthRestoreDates(op.expected):Object.keys(op.expected.entries).filter(ds=>op.expected.entries[ds].key);
  if(!dates.length||!sameStaffMonthState(dates,op.dates))return;
  const next=structuredClone(data||{}),sid=op.sid;
  for(const ds of dates){
    if(op.restore){
      const saved=next.__cancelledShifts[sid][ds];
      (next[sid]??={})[ds]=saved.key;
      if(saved.time)((next.__manualTimes??={})[sid]??={})[ds]=saved.time;
      delete next.__cancelledShifts[sid][ds];
    }else{
      const saved=op.expected.entries[ds];
      ((next.__cancelledShifts??={})[sid]??={})[ds]={key:saved.key,cancelledAt:op.createdAt,batchId:op.id,...(saved.time?{time:saved.time}:{})};
      delete next[sid][ds];
      if(next.__manualTimes?.[sid])delete next.__manualTimes[sid][ds];
    }
  }
  if(op.restore)delete next.__staffMonthUndo[sid];
  else (next.__staffMonthUndo??={})[sid]={id:op.id,createdAt:op.createdAt,dates:Object.fromEntries(dates.map(ds=>[ds,true]))};
  return next;
}
function renderStaffMonthActions(){
  document.getElementById('staffMonthLabel').textContent=`対象：表示中の ${currentYear}年${currentMonth+1}月（勤務日入力とは別です）`;
}
function openStaffMonthOperation(restore=false){
  const status=document.getElementById('staffMonthStatus');status.textContent='';
  if(manualSavePending||staffMonthOperation||staffOrderDraft||shiftEntryConfirmation||modalStaffId)return;
  if(currentUser?.role!=='admin'){status.textContent='管理者のみ操作できます。';return;}
  if(isCurrentMonthLocked()){status.textContent='確定済みの月は変更できません。';return;}
  if(!window._fb||window._fb.shiftConnected!==true){status.textContent='接続を確認して、もう一度操作してください。';return;}
  const sid=document.getElementById('monthStaff').value,staff=STAFF.find(s=>s.id===sid);
  if(!staff){status.textContent='スタッフを選択してください。';return;}
  const month=monthKey(currentYear,currentMonth),expected=structuredClone(staffMonthSnapshot(shiftData,sid,month));
  const dates=restore?staffMonthRestoreDates(expected):Object.keys(expected.entries).filter(ds=>expected.entries[ds].key);
  if(!dates.length){status.textContent=restore?'一括復元できる記録がありません。個別に編集・復元した場合は、残った「取消済」セルから復元してください。':'このスタッフの表示月にはクリアするシフトがありません。';return;}
  const createdAt=new Date().toISOString();
  staffMonthOperation={sid,month,expected,dates,restore,createdAt,id:crypto.randomUUID()};
  const counts={};
  for(const ds of dates){const e=expected.entries[ds],key=restore?e.cancelled.key:e.key;counts[key]=(counts[key]||0)+1;}
  const summary=Object.entries(counts).map(([key,n])=>(Object.values(SHIFT).find(s=>s.key===key)?.shortLabel||key)+` ${n}件`).join(' / ');
  document.getElementById('staffBulkTitle').textContent=restore?'スタッフ1人分を一括復元':'スタッフ1人分を一括クリア';
  document.getElementById('staffMonthTarget').textContent=`${staff.name}（${staff.role}）\n${currentYear}年${currentMonth+1}月：${dates.length}件\n${summary}`;
  document.getElementById('staffMonthDetail').textContent=restore?'直前の一括クリアを全件復元します。対象日に再登録や個別復元があれば、全件を中止します。':
    '勤務・有給・希望休・公休・休診等の登録を取り消します。直前の一括クリアを復元できます。以前の取消分は各セルから復元してください。';
  document.getElementById('staffMonthError').textContent='';
  document.getElementById('staffMonthConfirmButton').textContent=restore?`${dates.length}件を復元する`:`${dates.length}件をクリアする`;
  document.getElementById('staffMonthModal').classList.add('open');
}
function closeStaffMonthOperation(){
  if(manualSavePending)return;
  staffMonthOperation=null;document.getElementById('staffMonthModal').classList.remove('open');
}
async function confirmStaffMonthOperation(){
  if(!staffMonthOperation||manualSavePending)return;
  const op=staffMonthOperation,error=document.getElementById('staffMonthError');
  try{
    if(currentUser?.role!=='admin')throw Error('管理者のみ操作できます。');
    if(shiftLocks[op.month])throw Error('確定済みの月は変更できません。');
    if(!window._fb||window._fb.shiftConnected!==true)throw Error('接続を確認して、もう一度操作してください。');
    manualSavePending=true;
    document.getElementById('staffMonthModal').querySelectorAll('button').forEach(el=>el.disabled=true);
    error.textContent='サーバー確認中です。通信が切れた場合は再接続までお待ちください。';
    const memberVersion=op.restore?await assertShiftStaffCanRegister(op.sid):null;
    const {db,ref,get,runTransaction}=window._fb;
    if((await get(ref(db,'shift_locks/'+firebaseSafeKey(op.month)))).val())throw Error('確定済みの月は変更できません。');
    const result=await runTransaction(ref(db,'shifts/'+op.month),data=>{
      if(currentUser?.role!=='admin'||window._fb.shiftConnected!==true||(op.restore&&!shiftRegistrationStillAllowed(op.sid,memberVersion))||shiftLocks[op.month])return;
      return mutateStaffMonth(data,op);
    },{applyLocally:false});
    if(!result.committed)throw Error('対象スタッフのシフトまたは権限・確定状態が変わりました。全件の処理を中止しました。閉じて確認し直してください。');
    allShiftData[op.month]=result.snapshot.val()||{};
    if(monthKey(currentYear,currentMonth)===op.month)loadShiftForMonth(currentYear,currentMonth);
    if(!op.restore)for(const ds of op.dates){if(paidData[op.sid])delete paidData[op.sid][ds];if(wishData[op.sid])delete wishData[op.sid][ds];}
    manualSavePending=false;closeStaffMonthOperation();render();
    document.getElementById('staffMonthStatus').textContent=`${op.month} の対象スタッフ ${op.dates.length}件を${op.restore?'復元':'クリア'}しました。`;
  }catch(e){error.textContent='変更できません：'+e.message;}
  finally{manualSavePending=false;document.getElementById('staffMonthModal').querySelectorAll('button').forEach(el=>el.disabled=false);}
}
