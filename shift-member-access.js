let shiftMembers={},shiftMembersLoaded=false,shiftMembersVersion=0;
function staffAccessIssue(sid,users=shiftMembers){
  const linked=Object.values(users).filter(u=>u?.staffId===sid&&['staff','trainingAdmin','admin'].includes(u.role));
  // No login mapping is not a revocation. Mixed mappings fail closed until reviewed.
  const revoked=linked.some(u=>u.active!==true),active=linked.some(u=>u.active===true);
  return revoked?(active?'メンバーの許可状態が混在しています。メンバー管理で確認してください。':'メンバー管理で解除済みのスタッフです。新規登録・編集・復元はできません。'):'';
}
function canRegisterShiftStaff(sid){return shiftMembersLoaded&&!staffAccessIssue(sid);}
function receiveShiftMembers(users){
  shiftMembers=users||{};shiftMembersLoaded=true;shiftMembersVersion++;
}
async function refreshShiftMembers(){
  if(!window._fb?.shiftConnected||!window._fb.readMembersFromServer)throw Error('メンバーの最新状態を確認できません。接続を確認してください。');
  try{
    const data=await window._fb.readMembersFromServer();
    if(!window._fb.shiftConnected)throw Error('offline');
    receiveShiftMembers(data);redrawShiftMemberViews();
  }catch(e){shiftMembersLoaded=false;shiftMembersVersion++;redrawShiftMemberViews();throw e;}
  return shiftMembersVersion;
}
async function assertShiftStaffCanRegister(sid){
  if(!STAFF.some(s=>s.id===sid))throw Error('登録済みスタッフを確認できません。');
  const version=await refreshShiftMembers();const issue=staffAccessIssue(sid);
  if(!STAFF.some(s=>s.id===sid))throw Error('スタッフ構成が変わりました。再読込してください。');
  if(issue)throw Error(issue);
  return version;
}
function shiftRegistrationStillAllowed(sid,version){
  return currentUser?.role==='admin'&&window._fb?.shiftConnected===true&&shiftMembersLoaded&&shiftMembersVersion===version&&STAFF.some(s=>s.id===sid)&&!staffAccessIssue(sid);
}
function assertMonthRegistrationAllowed(next,current){
  for(const sid of new Set([...Object.keys(next||{}),...Object.keys(current||{})])){
    if(sid.startsWith('__')||!staffAccessIssue(sid))continue;
    for(const [ds,key]of Object.entries(next?.[sid]||{})){
      if(key&&(key!==current?.[sid]?.[ds]||!sameStaffMonthState(next?.__manualTimes?.[sid]?.[ds]??null,current?.__manualTimes?.[sid]?.[ds]??null)))
        throw Error((STAFF.find(s=>s.id===sid)?.name||sid)+'：'+staffAccessIssue(sid));
    }
  }
}
function snapshotRevokedShiftData(){
  const snapshot={};
  for(const staff of STAFF)if(staffAccessIssue(staff.id))snapshot[staff.id]={shifts:structuredClone(shiftData[staff.id]??null),times:structuredClone(shiftData.__manualTimes?.[staff.id]??null)};
  return snapshot;
}
function restoreRevokedShiftData(snapshot){
  for(const [sid,data]of Object.entries(snapshot)){
    if(data.shifts)shiftData[sid]=data.shifts;else delete shiftData[sid];
    if(data.times)(shiftData.__manualTimes??={})[sid]=data.times;
    else if(shiftData.__manualTimes)delete shiftData.__manualTimes[sid];
  }
}

// Display preference is local to this open page; data, totals and saved order are unchanged.
let showRevokedShiftStaff=false;
function visibleShiftStaff(){
  return orderedShiftStaff().filter(s=>!shiftMembersLoaded||showRevokedShiftStaff||!staffAccessIssue(s.id));
}
function setShowRevokedShiftStaff(value){showRevokedShiftStaff=value===true;render();}
function renderShiftStaffVisibility(){
  const toggle=document.getElementById('showRevokedShiftStaff'),status=document.getElementById('staffVisibilityStatus');
  toggle.checked=showRevokedShiftStaff;toggle.disabled=!shiftMembersLoaded;
  const count=STAFF.filter(s=>!!staffAccessIssue(s.id)).length;
  status.textContent=!shiftMembersLoaded?'解除状態を確認できていないため、全員を表示しています。登録時は最新状態を確認します。':
    showRevokedShiftStaff?'解除・要確認のスタッフ '+count+'人を含めて表示中です。':'解除・要確認のスタッフ '+count+'人を非表示にしています。';
}
function redrawShiftMemberViews(){if(currentUser?.role==='admin')render();}
