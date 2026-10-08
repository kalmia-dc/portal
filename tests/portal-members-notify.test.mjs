import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {buildMemberRuleCandidate} from '../tools/build-member-rule-candidate.mjs';
const require=createRequire(process.env.PORTAL_TEST_DEPS?path.join(process.env.PORTAL_TEST_DEPS,'package.json'):import.meta.url);
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {ref,get,set,update,remove,serverTimestamp}=require('firebase/database');
const reviewed=JSON.parse(fs.readFileSync(new URL('../database.rules.json',import.meta.url),'utf8'));
const base=JSON.parse(execFileSync('git',['show','c129854a5cbddde35d7e7a9893afee271f274126:database.rules.json'],{cwd:new URL('..',import.meta.url),encoding:'utf8'}));
test('merge helper refuses unreviewed access changes and preserves unrelated branches',()=>{
  const unrelated=structuredClone(base);unrelated.rules.unrelated={'.read':false};
  assert.deepEqual(buildMemberRuleCandidate(unrelated).rules.unrelated,unrelated.rules.unrelated);
  const drift=structuredClone(base);drift.rules.portalAccess.users.$uid['.write']='true';
  assert.throws(()=>buildMemberRuleCandidate(drift),/manual merge/);
});
test('both notification/member application orders reserve service UID without altering service permissions',{skip:!process.env.NOTIFY_RULE_BUILDER},async()=>{
  const {buildRuleCandidate}=await import(pathToFileURL(process.env.NOTIFY_RULE_BUILDER));
  const notification=buildRuleCandidate(base);
  const merged=buildMemberRuleCandidate(notification);
  for(const key of Object.keys(notification.rules))if(!['portalAccess','portalAccessRequests'].includes(key))assert.deepEqual(merged.rules[key],notification.rules[key],key);
  for(const [i,candidate] of [merged,buildRuleCandidate(reviewed)].entries()) {
    const env=await initializeTestEnvironment({projectId:`demo-members-notify-${i}`,database:{host:'127.0.0.1',port:9015,rules:JSON.stringify(candidate)}});
    try{
      await env.withSecurityRulesDisabled(async c=>set(ref(c.database()),{serviceAccess:{notifications:{uid:'notification-service',active:true}},portalAccess:{users:{admin:{role:'admin',active:true,staffId:'admin',name:'Admin'}}},tasks:{x:1},custom_holidays:{x:1},meetingManagement:{tasks:{x:1},notices:{x:1}}}));
      const db=uid=>env.authenticatedContext(uid,{email:`${uid}@example.test`}).database();
      const admin=db('admin'),service=db('notification-service');
      for(const p of ['tasks','meetingManagement/tasks','meetingManagement/notices','custom_holidays'])await assertSucceeds(get(ref(service,p)));
      await assertSucceeds(set(ref(service,'portalDailySummaryNotifications/2026-10-08'),{status:'test'}));
      await assertFails(get(ref(service,'portalAccess/users')));
      await assertFails(get(ref(service,'portalAccess/users/notification-service')));
      await assertFails(set(ref(service,'portalAccessRequests/notification-service'),{uid:'notification-service',email:'notification-service@example.test'}));
      await assertFails(set(ref(admin,'portalAccessRequests/notification-service'),{uid:'notification-service',email:'notification-service@example.test'}));
      await assertFails(set(ref(admin,'portalAccess/users/notification-service'),{role:'staff',active:true,staffId:'x',name:'x'}));
      await assertFails(get(ref(admin,'serviceAccess')));await assertFails(update(ref(admin,'serviceAccess/notifications'),{active:false}));
      await env.withSecurityRulesDisabled(async c=>{
        await update(ref(c.database(),'serviceAccess/notifications'),{active:false});
        await set(ref(c.database(),'portalAccessRequests/notification-service'),{uid:'notification-service',email:'notification-service@example.test'});
      });
      await assertFails(get(ref(service,'tasks/disabled-probe')));
      await assertFails(set(ref(admin,'portalAccess/users/notification-service'),{role:'staff',active:true,staffId:'x',name:'x',email:'notification-service@example.test',updatedBy:'admin',updatedAt:serverTimestamp()}));
      await env.withSecurityRulesDisabled(async c=>set(ref(c.database(),'portalAccess/users/notification-service'),{role:'staff',active:true,staffId:'service',name:'service'}));
      await assertFails(update(ref(admin,'portalAccess/users/notification-service'),{active:false,updatedBy:'admin',updatedAt:serverTimestamp()}));
      // A malformed privileged import must not let client admins revoke or edit
      // the service UID, nor give the service account inherited parent reads.
      await env.withSecurityRulesDisabled(async c=>set(ref(c.database(),'portalAccess/users/notification-service'),{role:'admin',active:true,staffId:'service',name:'service'}));
      await assertFails(update(ref(admin,'portalAccess/users/notification-service'),{active:false}));
      await assertFails(remove(ref(admin,'portalAccess/users/notification-service')));
      await assertFails(get(ref(service,'portalAccess/users')));
      await assertFails(get(ref(service,'portalAccessRequests')));
    }finally{await env.cleanup();}
  }
});
