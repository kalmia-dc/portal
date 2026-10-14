import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('revoked attendance page releases listeners and timers and ignores late callbacks',()=>{
  const html=fs.readFileSync(new URL('../attendance.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('let attendanceClosed=false;'),html.indexOf('const authenticatedProfile = await'));
  let next,error,stop,unsubscribed=0,rendered=0,failed=0;const cleared=[];
  const context=vm.createContext({Set,window:{addEventListener:(event,fn)=>{assert.equal(event,'portalAccessLost');stop=fn;}},clearInterval:id=>cleared.push(id),firebaseOnValue:(target,n,e)=>{next=n;error=e;return()=>unsubscribed++;},render:()=>rendered++,fail:()=>failed++});
  vm.runInContext(source+';onValue("attendance",render,fail);attendanceTimers.add(42);',context);
  next({});assert.equal(rendered,1);stop();next({});error(Error('late'));
  assert.equal(rendered,1);assert.equal(failed,0);assert.equal(unsubscribed,1);assert.deepEqual(cleared,[42]);
});
