import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {onboardingDatabaseAuth} from '../onboarding-functions/database-identity.mjs';

const gate = "auth == null || root.child('onboardingAccess').child(auth.uid).child('pending').val() !== true";
const runtime = `auth != null && auth.uid === '${onboardingDatabaseAuth.uid}' && auth.token.onboardingRuntime === true`;
const bootstrap = {
  'portalAccess/users/$uid': 'auth != null && auth.uid === $uid',
  'portalJoinRequests/$uid': 'auth != null && auth.uid === $uid',
  'staffLifecycle/$staffId': "auth != null && root.child('portalAccess/users').child(auth.uid).child('staffId').val() === $staffId",
};

export function buildOnboardingAccessRules(input) {
  const candidate = structuredClone(input);
  const rules = candidate.rules;
  if (rules?.['.read'] !== false || rules?.['.write'] !== false ||
      !rules.portalJoinRequests?.$uid?.['.write'] || !rules.onboardingV1?.config) {
    throw new Error('Expected the current Kalmia labor and onboarding rules.');
  }
  if (rules.onboardingAccess) throw new Error('Review existing onboarding access rules before applying the changes again.');

  const approval = rules.portalJoinRequests.$uid;
  const rootAfter = 'newData.parent().parent()';
  const staff = "newData.child('approval/staffId').val()";
  const period = `${rootAfter}.child('laborRecords').child(${staff}).child('data/currentPeriod').val()`;
  const oldPeriod = `root.child('laborRecords').child(${staff}).child('data/currentPeriod').val()`;
  const starts = `${rootAfter}.child('laborRecords').child(${staff}).child('data/periods').child(${period}).child('startAt').val()`;
  const marker = `${rootAfter}.child('onboardingAccess').child($uid)`;
  approval['.write'] = `(${approval['.write']}) && (newData.child('state').val() !== 'approved' || (${period} === ${oldPeriod} && (${period} === null || ${starts} <= now)) || (${marker}.child('staff').val() === ${staff} && ${marker}.child('period').val() === ${period} && ${marker}.child('pending').val() === true))`;

  function restrict(node, path = '') {
    for (const [key, value] of Object.entries(node)) {
      if ((key === '.read' || key === '.write') && value !== false) {
        const allow = key === '.read' && bootstrap[path];
        node[key] = `(${value}) && ((${gate})${allow ? ` || (${allow})` : ''})`;
      } else if (!key.startsWith('.') && value && typeof value === 'object') {
        restrict(value, path ? `${path}/${key}` : key);
      }
    }
  }
  restrict(rules);

  const selectedStaff = "newData.child('staff').val()";
  const approved = `${rootAfter}.child('portalJoinRequests').child($uid).child('approval')`;
  const owner = "auth != null && root.child('laborConfig/enabled').val() === true && root.child('laborConfig/owners').child(auth.uid).val() === true";
  const firstRegistration = `(${gate}) && (${owner}) && !data.exists() && newData.child('pending').val() === true && ${approved}.child('by').val() === auth.uid && ${approved}.child('at').val() === now && ${approved}.child('staffId').val() === ${selectedStaff} && ${rootAfter}.child('laborAccountBindings').child(${selectedStaff}).val() === $uid && ${rootAfter}.child('laborRecords').child(${selectedStaff}).child('data/currentPeriod').val() === newData.child('period').val()`;
  rules.onboardingAccess = {
    '$uid': {
      '.read': `(${runtime}) || (auth != null && auth.uid === $uid)`,
      '.write': `newData.exists() && ((${runtime}) || (${firstRegistration}))`,
      '.validate': "newData.hasChildren(['staff','period','pending']) && newData.child('staff').isString() && newData.child('period').isString() && newData.child('pending').isBoolean()",
    },
  };
  return candidate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node build-onboarding-access-rules.mjs input.json output.json');
  const rules = buildOnboardingAccessRules(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, JSON.stringify(rules, null, 2) + '\n');
}
