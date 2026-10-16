import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCandidate} from '../tools/build-incident-owner-rule-candidate.mjs';
test('obsolete owner-edit patch refuses to overwrite versioned incident policy',()=>{
 const rules=JSON.parse(fs.readFileSync('database.rules.json','utf8'));
 assert(rules.rules.meetingManagement.incidentV2);
 assert.throws(()=>buildCandidate(rules),/Unexpected existing incident child rules/);
});
