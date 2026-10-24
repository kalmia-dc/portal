import {canUseStaff,canAssignStaff} from './portal-staff-usage.mjs?v=20261024-usage';
import {personName} from './portal-person-display.mjs?v=20261019-director';
import {defaultStaff} from './portal-default-staff.mjs';
import {isLifecycleStopped} from './portal-lifecycle-model.mjs';

// Business display fields only. Never spread source records into consumers.
export function buildBusinessRoster({defaults=defaultStaff,extra={},lifecycle={},now=Date.now()}={}) {
  const byId=new Map();
  const add=(id,value)=>{
    if(!id || /[.#$\[\]/]/.test(id) || !value || typeof value.name!=='string') return;
    const name=value.name.trim();
    if(!name) return;
    const role=['DR','DH','DA'].includes(value.role)?value.role:(byId.get(id)?.role||'');
    const record=lifecycle?.[id];
    const skillRole=role==='DA' ? ((value.uketsuke===true || (value.uketsuke!==false && ['tamiya','tanaka'].includes(id)))?'DA受付':'DA助手') : role;
    const hasWindow=(Number.isFinite(record?.startAt) && Number.isFinite(record?.endAt)) || (Number.isFinite(record?.previousStartAt) && Number.isFinite(record?.previousEndAt));
    const known=record && (record.state==='stopped' || (record.hrManaged===true ? hasWindow : record.state==='active'));
    const windows=record?.state==='stopped' ? [] : record?.hrManaged===true ? Object.values(record.periods||{}).filter(p=>!p.cancelled).map(p=>({start:p.startDate,end:p.endDate||'9999-12-31'})) : value.schedulePeriods;
    const schedulePeriods=Array.isArray(windows)?windows.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p?.start)&&/^\d{4}-\d{2}-\d{2}$/.test(p?.end)).map(p=>({start:p.start,end:p.end})):undefined;
    byId.set(id,{id,name,role,skillRole,businessEligible:canUseStaff(id),...(schedulePeriods?{schedulePeriods}:{}),availability:known ? (isLifecycleStopped(record,now)?'stopped':'active') : 'unknown'});
  };
  defaults.forEach(s=>add(s.id,s));
  // The database key is authoritative. A conflicting embedded id never rekeys a person.
  Object.entries(extra||{}).forEach(([id,s])=>add(id,s));
  const members=[...byId.values()];
  const counts=new Map();
  members.forEach(s=>{const label=personName(s.name,s.id);counts.set(label,(counts.get(label)||0)+1);});
  return members.map(s=>{const label=personName(s.name,s.id);return {...s,label:counts.get(label)>1?`${label} (${s.id})`:label};});
}

export function historyStaffLabel(roster,id,savedName) {
  if(typeof savedName==='string' && savedName.trim()) return personName(savedName,id);
  return (Array.isArray(roster)?roster:roster?.members)?.find(s=>s.id===id)?.label || id || '未紐付け';
}

// Dependency-injected read keeps Firebase credentials and any writes out of this adapter.
export async function loadBusinessRoster({read,profile,now=Date.now()}={}) {
  const issues=[];
  const safeRead=async path=>{try{return await read(path);}catch{issues.push({source:path,message:'名簿の一部を確認できません。再読み込みしてください。'});return null;}};
  const extra=await safeRead('extra_staff');
  let lifecycle={};
  if(profile?.isAdmin===true) lifecycle=await safeRead('staffLifecycle')||{};
  else if(profile?.staffId && !/[.#$\[\]/]/.test(profile.staffId)) {
    const record=await safeRead(`staffLifecycle/${profile.staffId}`);
    if(record) lifecycle[profile.staffId]=record;
  }
  return {members:buildBusinessRoster({extra,lifecycle,now}),issues,complete:issues.length===0};
}
