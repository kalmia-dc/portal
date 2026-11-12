import {roleDocuments, ROLES} from './catalog.mjs';
import {safeKey} from './service.mjs';

const finalStates = new Set(['accepted','exempt','purged']);
const mutations = new Set(['save','submit','accept','return','exempt','purge','require',
  'contract-prepare','contract-release','contract-agree','contract-accept']);

export function changesOnboardingStatus(action) {
  return mutations.has(action);
}

export function onboardingEmployment(record, now) {
  const data=record?.data;
  const period=data?.periods?.[data.currentPeriod];
  if(!data || !['confirmed','retiring'].includes(data.status) || !safeKey(data.currentPeriod) ||
     !Object.hasOwn(ROLES,data.role) || !period || period.cancelled || !Number.isFinite(period.startAt) ||
     !(period.startAt<period.endAt && now<period.endAt)) return null;
  return {period:data.currentPeriod,role:data.role,name:data.basic?.fullName||data.basic?.name||'',startAt:period.startAt};
}

export function prehireAccess(lifecycle, access, staff, now) {
  return lifecycle?.hrManaged===true && lifecycle.state==='active' && lifecycle.currentCancelled!==true &&
    Number.isFinite(lifecycle.startAt) && lifecycle.startAt>now && lifecycle.startAt<lifecycle.endAt &&
    access?.pending===true && access.staff===staff && access.period===lifecycle.currentPeriod;
}

export function onboardingAccessPending(complete, lifecycle, period, now) {
  return !complete || lifecycle?.hrManaged!==true || lifecycle.state!=='active' ||
    lifecycle.currentCancelled===true || lifecycle.currentPeriod!==period ||
    !(lifecycle.startAt<=now && now<lifecycle.endAt);
}

export async function onboardingIsComplete({staff, period, role, metadata}) {
  const documents = roleDocuments(role);
  if (!documents.length) return false;
  const completed = await Promise.all(documents.map(async ([key, doc]) => {
    const record = await metadata({staff, period, key, restricted: !!doc.restricted});
    return doc.optional && record?.required !== true || finalStates.has(record?.state);
  }));
  return completed.every(Boolean);
}
