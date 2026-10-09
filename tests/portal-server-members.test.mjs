import test from 'node:test';
import assert from 'node:assert/strict';
import {readServerMembers} from '../portal-server-members.mjs';
const user={getIdToken:async()=>'test-token-only'};
test('member eligibility probe is server-only GET to the existing admin-readable path',async()=>{
 let called=0;
 const data=await readServerMembers({databaseURL:'https://example.test/',user,fetchImpl:async(url,options)=>{
  called++;const target=new URL(url);assert.equal(target.pathname,'/portalAccess/users.json');assert.equal(target.searchParams.get('auth'),'test-token-only');
  assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
  return {ok:true,json:async()=>({u:{staffId:'a',active:false,role:'staff'}})};
 }});assert.equal(called,1);assert.equal(data.u.active,false);
});
test('no cached permission on denial, network failure, bad JSON, invalid data, timeout or signout; no token in errors',async()=>{
 const failure=[async()=>({ok:false}),async()=>{throw Error('test-token-only')},async()=>({ok:true,json:async()=>{throw Error('bad json')}}),async()=>({ok:true,json:async()=>[]}),async()=>new Promise(()=>{})];
 for(const fetchImpl of failure)await assert.rejects(readServerMembers({databaseURL:'https://example.test/',user,fetchImpl,timeoutMs:10}),e=>/最新の許可状態/.test(e.message)&&!e.message.includes('test-token-only'));
 await assert.rejects(readServerMembers({databaseURL:'https://example.test/',user:null,fetchImpl:async()=>{throw Error('must not fetch')}}));
});
