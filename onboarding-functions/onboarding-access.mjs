import {roleDocuments} from './catalog.mjs';

const finalStates = new Set(['accepted','exempt','purged']);
const mutations = new Set(['save','submit','accept','return','exempt','purge','require',
  'contract-prepare','contract-release','contract-agree','contract-accept']);

export function changesOnboardingStatus(action) {
  return mutations.has(action);
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
