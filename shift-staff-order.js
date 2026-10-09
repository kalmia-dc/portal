// Shared presentation metadata. Never sort STAFF: generation relies on its order.
let staffOrderRecord=null,staffOrderLoaded=false,staffOrderDraft=null;
function staffOrderIds(record,roster=STAFF){
  const known=new Set(roster.map(s=>s.id)),saved=Array.isArray(record?.ids)?record.ids:[];
  return [...new Set([...saved.filter(id=>known.has(id)),...roster.map(s=>s.id)])];
}
function orderedShiftStaff(){
  const roster=new Map(STAFF.map(s=>[s.id,s]));
  return staffOrderIds(staffOrderRecord).map(id=>roster.get(id));
}
function staffRosterSignature(){return [...new Set(STAFF.map(s=>s.id))].sort().join('\n');}
function openStaffOrder(){
  const status=document.getElementById('staffMonthStatus');
  if(manualSavePending||staffOrderDraft||staffMonthOperation||shiftEntryConfirmation||modalStaffId)return;
  if(currentUser?.role!=='admin'){status.textContent='管理者のみ操作できます。';return;}
  if(!staffOrderLoaded||!window._fb?.shiftConnected){status.textContent='表示順を読み込めません。接続を確認してください。';return;}
  staffOrderDraft={expected:structuredClone(staffOrderRecord),ids:staffOrderIds(staffOrderRecord),roster:staffRosterSignature()};
  document.getElementById('staffOrderError').textContent='';renderStaffOrderDraft();
  document.getElementById('staffOrderModal').classList.add('open');
}
function moveStaffOrder(id,delta){
  if(manualSavePending||!staffOrderDraft)return;
  const ids=staffOrderDraft.ids,index=ids.indexOf(id),target=index+delta;
  if(index<0||target<0||target>=ids.length)return;
  [ids[index],ids[target]]=[ids[target],ids[index]];renderStaffOrderDraft();
}
function renderStaffOrderDraft(){
  const list=document.getElementById('staffOrderList');list.innerHTML='';
  staffOrderDraft.ids.forEach((id,index)=>{
    const staff=STAFF.find(s=>s.id===id),row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee';
    const label=document.createElement('span');label.style.flex='1';label.textContent=`${index+1}. ${staff?.name||id}（${staff?.role||''}）`;
    if(shiftMembersLoaded&&staffAccessIssue(id))label.textContent+='・解除/要確認';row.appendChild(label);
    for(const [delta,text]of [[-1,'↑ 上へ'],[1,'↓ 下へ']]){
      const button=document.createElement('button');button.className='btn btn-secondary';button.textContent=text;
      button.setAttribute('aria-label',`${staff?.name||id}を${delta<0?'上':'下'}へ`);
      button.disabled=index+delta<0||index+delta>=staffOrderDraft.ids.length;
      button.onclick=()=>moveStaffOrder(id,delta);row.appendChild(button);
    }
    list.appendChild(row);
  });
}
function closeStaffOrder(){
  if(manualSavePending)return;
  staffOrderDraft=null;document.getElementById('staffOrderModal').classList.remove('open');
}
async function saveStaffOrder(){
  if(!staffOrderDraft||manualSavePending)return;
  const draft=structuredClone(staffOrderDraft),error=document.getElementById('staffOrderError');
  try{
    if(currentUser?.role!=='admin')throw Error('管理者のみ操作できます。');
    if(!window._fb?.shiftConnected||!staffOrderLoaded)throw Error('接続を確認してください。');
    if(draft.roster!==staffRosterSignature())throw Error('スタッフ構成が変わりました。閉じて確認し直してください。');
    manualSavePending=true;document.getElementById('staffOrderModal').querySelectorAll('button').forEach(el=>el.disabled=true);
    error.textContent='サーバー確認中です。通信が切れた場合は再接続までお待ちください。';
    const {db,ref,runTransaction}=window._fb;
    const missing=(Array.isArray(draft.expected?.ids)?draft.expected.ids:[]).filter(id=>!draft.ids.includes(id));
    const record={ids:[...draft.ids,...missing],revision:crypto.randomUUID()};
    const result=await runTransaction(ref(db,'shifts/__displayOrder'),current=>{
      if(currentUser?.role!=='admin'||!window._fb.shiftConnected||draft.roster!==staffRosterSignature()||!sameStaffMonthState(current,draft.expected))return;
      return record;
    },{applyLocally:false});
    if(!result.committed)throw Error('他の管理者の変更またはスタッフ構成の変更があります。閉じて確認し直してください。');
    staffOrderRecord=result.snapshot.val();manualSavePending=false;closeStaffOrder();render();
    document.getElementById('staffMonthStatus').textContent='スタッフ表示順を保存しました。全管理者・全月で共通です。';
  }catch(e){error.textContent='保存できません：'+e.message;}
  finally{
    manualSavePending=false;document.getElementById('staffOrderModal').querySelectorAll('button').forEach(el=>el.disabled=false);
    if(staffOrderDraft)renderStaffOrderDraft();
  }
}
