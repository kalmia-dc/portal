import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPortalUsages} from '../onboarding-functions/portal-usage.mjs';

test('onboarding states follow the actual gate, required documents and Japan-time start boundary',async()=>{
  const startAt=Date.parse('2026-11-21T00:00:00+09:00'),endAt=startAt+86400000;
  let now=startAt-1,opened=false,complete=false,fail=false;
  const life={hrManaged:true,state:'active',startAt,endAt,currentPeriod:'p'};
  const access={staff:'s',period:'p',pending:true};
  const member={staffId:'s',role:'staff',active:true};
  const paths=[];
  const read=async path=>{
    paths.push(path);
    if(path==='portalAccess/users/u')return member;
    if(path==='staffLifecycle/s')return life;
    if(path==='onboardingAccess/u')return access;
    if(path==='onboardingV1/cases/s/p')return opened?{role:'DH'}:null;
    throw Error('Unexpected read');
  };
  const metadata=async ({key})=>{
    if(fail)throw Error('Storage unavailable');
    // Optional records without a required flag need no submission.
    if(['pass','drivingLicense','drivingInsurance','employment','withholding'].includes(key))return null;
    return complete?{state:key==='myNumber'?'purged':'accepted',privateValue:'must stay private'}:null;
  };
  const usage=async()=>(await loadPortalUsages({read,metadata,now,uids:['u']})).s;
  assert.deepEqual(await usage(),{status:'opening'});
  opened=true;
  assert.deepEqual(await usage(),{status:'documents'});
  complete=true;
  assert.deepEqual(await usage(),{status:'start',startDate:'2026-11-21'});
  now=startAt;
  assert.deepEqual(await usage(),{status:'activation'});
  access.pending=false;
  assert.deepEqual(await usage(),{status:'active',administrator:false});
  access.pending=true;
  fail=true;
  assert.deepEqual(await usage(),{status:'unknown'});
  fail=false;
  access.period='old';
  assert.deepEqual(await usage(),{status:'unknown'});
  access.period='p';
  member.active=false;
  assert.deepEqual(await usage(),{status:'stopped'});
  member.active=true;
  now=endAt;
  assert.deepEqual(await usage(),{status:'stopped'});
  assert.ok(paths.every(path=>!path.includes('Files') && !path.includes('vault')));
});

test('unavailable staff stays unknown while other accounts remain readable and optional required additions block completion',async()=>{
  const users={a:{staffId:'a',role:'admin',active:true},b:{staffId:'b',role:'staff',active:true}};
  const read=async path=>{
    if(path==='portalAccess/users')throw Error('The runtime cannot list accounts');
    if(path.startsWith('portalAccess/users/'))return users[path.split('/')[2]];
    if(path==='staffLifecycle/b')return null;
    if(path==='onboardingAccess/b')return {staff:'b',period:'p',pending:true};
    if(path==='onboardingV1/cases/b/p')return {role:'DA'};
    return null;
  };
  const metadata=async({key})=>key==='pass'?{required:true,state:'returned'}:{state:'accepted'};
  const result=await loadPortalUsages({read,metadata,now:1,uids:['a','b']});
  assert.deepEqual(result,{a:{status:'active',administrator:true},b:{status:'documents'}});
  assert.deepEqual(Object.keys(result.b),['status']);
  const broken=await loadPortalUsages({read:async path=>{if(path==='staffLifecycle/b')throw Error('unavailable');return read(path);},metadata,now:1,uids:['a','b']});
  assert.equal(broken.a.status,'active');
  assert.equal(broken.b.status,'unknown');
  await assert.rejects(loadPortalUsages({read:async()=>{throw Error('unavailable');},metadata,now:1,uids:['a']}),/unavailable/);
});
