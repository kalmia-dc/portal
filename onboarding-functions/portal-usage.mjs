import {onboardingIsComplete,prehireAccess,onboardingException} from './onboarding-access.mjs';
import {ROLES} from './catalog.mjs';
import {safeKey} from './service.mjs';

export function employmentActive(life,now) {
  if(life?.state==='stopped')return false;
  if(life?.hrManaged!==true)return true;
  return (!life.currentCancelled && life.startAt<=now && now<life.endAt) ||
    (life.previousStartAt<=now && now<life.previousEndAt);
}

// Only access states leave the service. Document bodies and individual metadata stay private.
export async function loadPortalUsages({read,metadata,now,uids,config}) {
  const members=await Promise.all([...new Set(uids)].map(async uid=>[uid,await read('portalAccess/users/'+uid)]));
  const users=Object.fromEntries(members.filter(([,member])=>member));
  const staffIds=[...new Set(Object.values(users||{}).map(member=>member?.staffId).filter(safeKey))];
  const entries=await Promise.all(staffIds.map(async staff=>{
    try {
      const accounts=Object.entries(users).filter(([,member])=>member?.staffId===staff).map(([uid,member])=>({uid,...member}));
      const [member]=accounts;
      if(accounts.length!==1 || !['staff','trainingAdmin','admin'].includes(member.role) || typeof member.active!=='boolean') {
        return [staff,{status:'unknown'}];
      }
      if(!member.active)return [staff,{status:'stopped'}];
      const [lifecycle,access]=await Promise.all([
        member.role!=='admin'?read('staffLifecycle/'+staff):null,
        read('onboardingAccess/'+member.uid),
      ]);
      const active=employmentActive(lifecycle,now);
      const beforeStart=lifecycle?.hrManaged===true && lifecycle.state==='active' &&
        !lifecycle.currentCancelled && lifecycle.startAt>now && lifecycle.startAt<lifecycle.endAt;
      if(!active && !prehireAccess(lifecycle,access,staff,now)) {
        return [staff,beforeStart?{status:'scheduled',startDate:date(lifecycle.startAt)}:{status:'stopped'}];
      }
      if(access?.pending!==true)return [staff,{status:'active',administrator:member.role==='admin',
        ...(access?.staff===staff && onboardingException(config,staff,access.period,member.uid)?{exception:true}:{})}];
      if(access.staff!==staff || !safeKey(access.period) ||
        (lifecycle?.hrManaged===true && lifecycle.currentPeriod!==access.period))return [staff,{status:'unknown'}];
      const enrollment=await read('onboardingV1/cases/'+staff+'/'+access.period);
      if(!enrollment)return [staff,{status:'opening'}];
      if(!Object.hasOwn(ROLES,enrollment.role))return [staff,{status:'unknown'}];
      const complete=await onboardingIsComplete({staff,period:access.period,role:enrollment.role,metadata});
      if(!complete)return [staff,{status:'documents'}];
      return [staff,beforeStart?{status:'start',startDate:date(lifecycle.startAt)}:{status:'activation'}];
    } catch {
      return [staff,{status:'unknown'}];
    }
  }));
  return Object.fromEntries(entries);
}

function date(timestamp) {
  return new Date(timestamp+9*60*60*1000).toISOString().slice(0,10);
}
