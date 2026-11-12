import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPageLifecycle} from '../portal-page-lifecycle.mjs';

test('revoked attendance page releases listeners and timers and ignores late callbacks',()=>{
  const html=fs.readFileSync(new URL('../attendance.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('let attendanceClosed='),html.indexOf('const authenticatedProfile = await'));
  let next,error,unsubscribed=0,rendered=0,failed=0;const cleared=[];
  const window=new EventTarget();
  const pageLifecycle=createPageLifecycle({target:window});
  const context=vm.createContext({Set,window,pageLifecycle,clearInterval:id=>cleared.push(id),firebaseOnValue:(target,n,e)=>{next=n;error=e;return()=>unsubscribed++;},render:()=>rendered++,fail:()=>failed++});
  vm.runInContext(source+';onValue("attendance",render,fail);attendanceTimers.add(42);',context);
  next({});assert.equal(rendered,1);window.dispatchEvent(new Event('portalAccessLost'));next({});error(Error('late'));
  assert.equal(rendered,1);assert.equal(failed,0);assert.equal(unsubscribed,1);assert.deepEqual(cleared,[42]);
});
