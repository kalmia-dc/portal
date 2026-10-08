import assert from 'node:assert/strict';
import test from 'node:test';
import {watchPortalSession} from '../portal-session-watch.mjs';
import {readServerProfile} from '../portal-server-profile.mjs';
const record={active:true,role:'staff'};
const flush=()=>new Promise(setImmediate);
function fixture() {
  let connection,profile,auth;const requests=[],retries=[],events=[];
  watchPortalSession({userId:'u',initial:record,normalize:r=>r?.active?r:null,
    subscribe:n=>{profile=n;return()=>{}},subscribeAuth:n=>{auth=n;return()=>{}},subscribeConnection:n=>{connection=n;return()=>{}},
    suspend:()=>events.push('lock'),resume:()=>events.push('resume'),invalidate:r=>events.push(r),
    verify:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),retryLater:fn=>{retries.push(fn);return retries.length},cancelRetry:()=>{}});
  return {connection:v=>connection(v),profile:r=>profile(r),auth:u=>auth(u),requests,retries,events};
}
test('fresh successful response resumes without recreation; cached and late responses cannot unlock',async()=>{
  const f=fixture();f.connection(true);f.connection(false);f.connection(true);
  f.profile(record);assert.deepEqual(f.events,['lock']);
  f.connection(false);f.requests[0].resolve(record);await flush();assert.deepEqual(f.events,['lock','lock']);
  f.connection(true);f.requests[1].resolve(record);await flush();assert.deepEqual(f.events,['lock','lock','resume']);
});
test('transient failure stays locked and retries; server denial or revocation ends access',async()=>{
  for(const denied of [false,true]) {
    const f=fixture();f.connection(false);f.connection(true);
    f.requests[0].reject({code:'connection-unavailable'});await flush();assert.deepEqual(f.events,['lock']);assert.equal(f.retries.length,1);
    f.retries[0]();
    if(denied)f.requests[1].reject({code:'access-denied'});else f.requests[1].resolve({...record,active:false});
    await flush();assert.deepEqual(f.events,['lock',denied?'access-denied':'changed']);
  }
});
test('logout or role loss during server verification cannot be undone by late success',async()=>{
  for(const action of ['logout','role']){
    const f=fixture();f.connection(false);f.connection(true);
    if(action==='logout')f.auth(null);else f.profile({...record,role:'trainingAdmin'});
    f.requests[0].resolve(record);await flush();assert.equal(f.events.includes('resume'),false);
  }
});
const requestOptions={databaseURL:'https://demo.firebasedatabase.app',user:{uid:'test-user',getIdToken:async()=>'fake-token'}};
test('server probe sends uncached GET to own profile and never falls back to stored data',async()=>{
  let seen;
  const actual=await readServerProfile({...requestOptions,fetchImpl:async(url,options)=>{seen={url,options};return {status:200,ok:true,json:async()=>record}}});
  assert.deepEqual(actual,record);assert.equal(new URL(seen.url).pathname,'/portalAccess/users/test-user.json');
  assert.equal(seen.options.cache,'no-store');assert.equal(seen.options.method,'GET');assert.equal(seen.options.credentials,'omit');
  for(const status of [401,403,500])await assert.rejects(readServerProfile({...requestOptions,fetchImpl:async()=>({status,ok:false})}),e=>e.code===(status===500?'connection-unavailable':'access-denied'));
  await assert.rejects(readServerProfile({...requestOptions,fetchImpl:async()=>{throw Error('secret fake-token URL')}}),e=>!e.message.includes('fake-token'));
});
test('timeout or invalid JSON never supplies a permissive cached profile',async()=>{
  await assert.rejects(readServerProfile({...requestOptions,user:{uid:'u',getIdToken:()=>new Promise(()=>{})},timeoutMs:5,fetchImpl:()=>{throw Error('must not fetch')}}),e=>e.code==='connection-unavailable');
  await assert.rejects(readServerProfile({...requestOptions,timeoutMs:5,fetchImpl:async(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))))}),e=>e.code==='connection-unavailable');
  await assert.rejects(readServerProfile({...requestOptions,fetchImpl:async()=>({status:200,ok:true,json:async()=>{throw Error('invalid')}})}),e=>e.code==='connection-unavailable');
});
