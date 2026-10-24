let shiftMembers={},shiftMembersLoaded=false,shiftMembersVersion=0;
let shiftLifecycle={},shiftLifecycleLoaded=false;
function laborShiftPeriod(sid,date){const life=shiftLifecycle[sid];if(!life?.hrManaged)return null;return Object.entries(life.periods||{}).find(([,p])=>!p.cancelled&&p.startDate<=date&&date<=p.endDate)?.[0]||null;}
function staffAccessIssue(sid,users=shiftMembers,date=null){
  if(!globalThis.PortalStaffUsage.canUseStaff(sid,'shift'))return '打刻テスト専用枠です。シフトの新規登録・編集・復元はできません。履歴は保持されています。';
  if(shiftLifecycle[sid]?.hrManaged){if(date)return laborShiftPeriod(sid,date)?'':'勤務日が在籍期間外です。';const month=typeof currentYear!=='undefined'?String(currentYear)+'-'+String(currentMonth+1).padStart(2,'0'):'';return Object.values(shiftLifecycle[sid].periods||{}).some(p=>!p.cancelled&&(!month||p.startDate<=month+'-31'&&p.endDate>=month+'-01'))?'':'表示月に在籍期間がありません。';}
  if(shiftLifecycle[sid]?.state==='stopped')return '退職・利用停止中のスタッフです。履歴は保持されています。';
  // Explicit staff-level restoration does not reactivate individually revoked logins.
  if(shiftLifecycle[sid]?.state==='active')return '';
  const linked=Object.values(users).filter(u=>u?.staffId===sid&&['staff','trainingAdmin','admin'].includes(u.role));
  // No login mapping is not a revocation. Mixed mappings fail closed until reviewed.
  const revoked=linked.some(u=>u.active!==true),active=linked.some(u=>u.active===true);
  return revoked?(active?'メンバーの許可状態が混在しています。メンバー管理で確認してください。':'メンバー管理で解除済みのスタッフです。新規登録・編集・復元はできません。'):'';
}
function canRegisterShiftStaff(sid){return (!window._fb?.readLifecycleFromServer||shiftLifecycleLoaded)&&shiftMembersLoaded&&!staffAccessIssue(sid);}
function receiveShiftMembers(users){
  shiftMembers=users||{};shiftMembersLoaded=true;shiftMembersVersion++;
}
async function refreshShiftMembers(){
  if(!window._fb?.shiftConnected||!window._fb.readMembersFromServer)throw Error('メンバーの最新状態を確認できません。接続を確認してください。');
  try{
    const data=await window._fb.readMembersFromServer();
    window.shiftPageLifecycle?.assertActive();
    if(window._fb.readLifecycleFromServer){shiftLifecycle=await window._fb.readLifecycleFromServer();shiftLifecycleLoaded=true;}
    window.shiftPageLifecycle?.assertActive();
    if(!window._fb.shiftConnected)throw Error('offline');
    receiveShiftMembers(data);redrawShiftMemberViews();
  }catch(e){shiftLifecycleLoaded=false;shiftMembersLoaded=false;shiftMembersVersion++;redrawShiftMemberViews();throw e;}
  return shiftMembersVersion;
}
async function assertShiftStaffCanRegister(sid,date=null){
  if(!STAFF.some(s=>s.id===sid))throw Error('登録済みスタッフを確認できません。');
  const version=await refreshShiftMembers();const issue=staffAccessIssue(sid,shiftMembers,date);
  if(!STAFF.some(s=>s.id===sid))throw Error('スタッフ構成が変わりました。再読込してください。');
  if(issue)throw Error(issue);
  return version;
}
function shiftRegistrationStillAllowed(sid,version){
  return currentUser?.role==='admin'&&window._fb?.shiftConnected===true&&shiftMembersLoaded&&shiftMembersVersion===version&&STAFF.some(s=>s.id===sid)&&!staffAccessIssue(sid);
}
function assertMonthRegistrationAllowed(next,current){
  for(const sid of new Set([...Object.keys(next||{}),...Object.keys(current||{})])){
    if(sid.startsWith('__'))continue;
    for(const [ds,key]of Object.entries(next?.[sid]||{})){
      if(key&&staffAccessIssue(sid,shiftMembers,ds)&&(key!==current?.[sid]?.[ds]||!sameStaffMonthState(next?.__manualTimes?.[sid]?.[ds]??null,current?.__manualTimes?.[sid]?.[ds]??null)))
        throw Error((STAFF.find(s=>s.id===sid)?.name||sid)+'：'+staffAccessIssue(sid,shiftMembers,ds));
    }
  }
}
function attachLaborShiftPeriods(next){for(const [sid,days]of Object.entries(next||{})){if(sid.startsWith('__')||!shiftLifecycle[sid]?.hrManaged)continue;for(const date of Object.keys(days||{})){const p=laborShiftPeriod(sid,date);if(p)((next.__laborPeriods??={})[sid]??={})[date]=p;}}return next;}
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
  return orderedShiftStaff().filter(s=>showRevokedShiftStaff||(globalThis.PortalStaffUsage.canUseStaff(s.id,'shift')&&(!shiftMembersLoaded||!staffAccessIssue(s.id))));
}
function setShowRevokedShiftStaff(value){showRevokedShiftStaff=value===true;render();}
function renderShiftStaffVisibility(){
  const toggle=document.getElementById('showRevokedShiftStaff'),status=document.getElementById('staffVisibilityStatus');
  toggle.checked=showRevokedShiftStaff;toggle.disabled=!shiftMembersLoaded;
  const count=STAFF.filter(s=>!!staffAccessIssue(s.id)).length;
  status.textContent=!shiftMembersLoaded?'解除状態を確認できていないため、全員を表示しています。登録時は最新状態を確認します。':
    showRevokedShiftStaff?'解除・要確認のスタッフ '+count+'人を含めて表示中です。':'解除・要確認のスタッフ '+count+'人を非表示にしています。';
}
function redrawShiftMemberViews(){if(window.portalAccessLost)return;if(currentUser?.role==='admin')render();}

function snapshotLaborOutsidePeriods(){const saved={};for(const staff of STAFF){if(!shiftLifecycle[staff.id]?.hrManaged)continue;for(let d=1;d<=daysInMonth(currentYear,currentMonth);d++){const ds=dateStr(currentYear,currentMonth,d);if(!laborShiftPeriod(staff.id,ds))(saved[staff.id]??={})[ds]={key:shiftData[staff.id]?.[ds]??null,time:structuredClone(shiftData.__manualTimes?.[staff.id]?.[ds]??null)};}}return saved;}
function restoreLaborOutsidePeriods(saved){for(const [sid,dates]of Object.entries(saved))for(const [ds,e]of Object.entries(dates)){if(e.key)(shiftData[sid]??={})[ds]=e.key;else if(shiftData[sid])delete shiftData[sid][ds];if(e.time)((shiftData.__manualTimes??={})[sid]??={})[ds]=e.time;else if(shiftData.__manualTimes?.[sid])delete shiftData.__manualTimes[sid][ds];}}
