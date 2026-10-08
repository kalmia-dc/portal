import assert from 'node:assert/strict';
import test from 'node:test';
import { memberChange, performMemberChange } from '../portal-members-model.mjs';
import { watchPortalSession } from '../portal-session-watch.mjs';

const actor={uid:'admin',portalRole:'admin'};
const staff={id:'tanaka',name:'田中',role:'DA'};
const request={uid:'pending',email:'pending@example.test'};
const member={staffId:'tanaka',name:'田中',role:'staff',active:true};
const args={actor,uid:'pending',current:null,expected:null,action:'register',staff,request,timestamp:123};
test('registers request as staff; duplicate and missing request rejected',()=>{
  assert.deepEqual(memberChange(args),{staffId:'tanaka',name:'田中',staffRole:'DA',role:'staff',active:true,email:request.email,updatedBy:'admin',updatedAt:123});
  assert.throws(()=>memberChange({...args,current:member,expected:member}),/登録済み/);
  assert.throws(()=>memberChange({...args,request:null}),/申請/);
  assert.throws(()=>memberChange({...args,staff:null}),/スタッフ/);
});
test('unauthenticated, non-admin, self, protected roles and invalid UID are rejected',()=>{
  for(const profile of [null,{}, {uid:'staff',portalRole:'staff'},{uid:'training',portalRole:'trainingAdmin'}]) assert.throws(()=>memberChange({...args,actor:profile}),/管理者/);
  assert.throws(()=>memberChange({...args,uid:'admin'}),/自分自身/);
  for(const role of ['admin','terminal']) assert.throws(()=>memberChange({...args,current:{...member,role}}),/変更できません/);
  assert.throws(()=>memberChange({...args,current:{...member,role:'notification'}}),/用途/);
  assert.throws(()=>memberChange({...args,uid:'a/b'}),/不正/);
});
test('revoke and restore preserve staff history linkage and existing metadata',()=>{
  const current={...member,legacy:'keep'};
  const revoked=memberChange({...args,current,expected:current,action:'revoke'});
  assert.deepEqual(revoked,{...current,active:false,updatedAt:123,updatedBy:'admin'});
  assert.equal(memberChange({...args,current:revoked,expected:revoked,action:'restore'}).active,true);
  assert.throws(()=>memberChange({...args,current:revoked,expected:revoked,action:'revoke'}),/すでに/);
  assert.throws(()=>memberChange({...args,action:'revoke'}),/ありません/);
  assert.throws(()=>memberChange({...args,current:revoked,expected:current,action:'revoke'}),/別の操作/);
  assert.throws(()=>memberChange({...args,current:{...member,meta:{version:2}},expected:{...member,meta:{version:1}},action:'revoke'}),/別の操作/);
});
test('cancellation makes no reads/writes; read failures make no writes',async()=>{
  let reads=0,writes=0;
  const options={...args,confirm:()=>false,readRequest:async()=>{reads++;throw Error('offline')},transact:async()=>{writes++}};
  assert.deepEqual(await performMemberChange(options),{cancelled:true});
  assert.equal(reads,0);assert.equal(writes,0);
  await assert.rejects(performMemberChange({...options,confirm:()=>true}),/offline/);
  assert.equal(reads,1);assert.equal(writes,0);
});
test('write abort/failure is never reported as success; repeat action is rejected',async()=>{
  const options={...args,confirm:()=>true,readRequest:async()=>request,transact:async()=>({committed:false})};
  await assert.rejects(performMemberChange(options),/保存されません/);
  await assert.rejects(performMemberChange({...options,transact:async()=>{throw Error('permission_denied')}}),/permission_denied/);
  let stored=null;
  const transact=async(uid,fn)=>{stored=fn(stored);return {committed:true}};
  assert.deepEqual(await performMemberChange({...options,transact}),{cancelled:false});
  await assert.rejects(performMemberChange({...options,transact}),/変更されました/);
});
test('session invalidates once on revoke, role change, failed read or signout',()=>{
  for(const reason of ['revoke','role','error','signout']) {
    let next,error,auth,connection;const stopped=[];
    watchPortalSession({userId:'u',initial:member,normalize:x=>x?.active?x:null,
      subscribe:(n,e)=>{next=n;error=e;return()=>{}},subscribeAuth:n=>{auth=n;return()=>{}},subscribeConnection:n=>{connection=n;return()=>{}},invalidate:r=>stopped.push(r),suspend(){},reconnect(){}});
    next({...member});auth({uid:'u'});connection(true);assert.deepEqual(stopped,[]);
    ({revoke:()=>next({...member,active:false}),role:()=>next({...member,role:'trainingAdmin'}),error:()=>error(Error('offline')),disconnect:()=>connection(false),signout:()=>auth(null)})[reason]();
    error();assert.equal(stopped.length,1);
  }
});
test('brief disconnect locks once without signout; reconnect stays locked until fresh page',()=>{
  let next,connection,suspended=0,reconnected=0,invalidated=0;
  watchPortalSession({userId:'u',initial:member,normalize:x=>x?.active?x:null,
    subscribe:n=>{next=n;return()=>{}},subscribeAuth:()=>()=>{},subscribeConnection:n=>{connection=n;return()=>{}},
    invalidate:()=>invalidated++,suspend:()=>suspended++,reconnect:()=>reconnected++});
  connection(true);connection(false);connection(false);connection(true);
  assert.equal(suspended,1);assert.equal(invalidated,0);assert.equal(reconnected,1);
  next({...member,active:false});assert.equal(invalidated,1);
  connection(true);assert.equal(reconnected,1);
});
