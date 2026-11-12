import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {onboardingDatabaseAuth} from '../onboarding-functions/database-identity.mjs';

const runtime = `auth != null && auth.uid === '${onboardingDatabaseAuth.uid}' && auth.token.onboardingRuntime === true`;
const readPaths = [
  'portalAccess/users/$uid',
  'serviceAccess/notifications/uid',
  'staffLifecycle/$staffId',
  'laborConfig/enabled',
  'laborConfig/owners/$uid',
  'laborRecords',
  'laborAccountBindings',
];

export function buildOnboardingRules(source) {
  const result = structuredClone(source);
  const rules = result.rules;
  if (rules?.['.read'] !== false || rules?.['.write'] !== false) {
    throw new Error('The database must deny access by default.');
  }

  for (const path of readPaths) {
    let node = rules;
    for (const key of path.split('/')) node = node[key] ??= {};
    const existing = node['.read'];
    if (typeof existing === 'string' && existing.includes(runtime)) continue;
    node['.read'] = existing ? `(${existing}) || (${runtime})` : runtime;
  }

  const expected = {
    '.read': false,
    '.write': false,
    config: {'.read': runtime},
    cases: {'.read': runtime, '$staff': {'$period': {'.write': runtime}}},
    vaultAudit: {'$staff': {'$period': {'$entry': {'.read': runtime, '.write': runtime}}}},
  };
  const current = rules.onboardingV1;
  if (current && JSON.stringify(current) !== JSON.stringify(expected) &&
      JSON.stringify(current) !== JSON.stringify({'.read': false, '.write': false})) {
    throw new Error('Review the existing onboardingV1 rules before replacing them.');
  }
  rules.onboardingV1 = expected;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node build-onboarding-rule-candidate.mjs input.json output.json');
  const candidate = buildOnboardingRules(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, JSON.stringify(candidate, null, 2) + '\n');
}
