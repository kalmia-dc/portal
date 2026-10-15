import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {getDatabase,ref,update,runTransaction,onValue,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {startPortalAuth} from './portal-auth.js?v=labor-20261014-2';
import {createLaborStore} from './labor-store.mjs';
import {defaultStaff} from './portal-default-staff.mjs';
import {readServerProfile} from './portal-server-profile.mjs';
import {createPageLifecycle} from './portal-page-lifecycle.mjs';
export async function connectLabor(){
  const lifecycle=createPageLifecycle();
  const wait=async work=>{lifecycle.assertActive();let result;try{result=await work();}catch(error){lifecycle.assertActive();throw error;}lifecycle.assertActive();return result;};
  const watch=(path,next,error)=>{lifecycle.assertActive();return lifecycle.add(onValue(ref(db,path),lifecycle.guard(next),lifecycle.guard(error)));};
  const app=initializeApp({apiKey:'AIzaSyDdMe7feUF6CKPHH0YIx7Suk-WnXtOYUu8',authDomain:'kalmia-shift.firebaseapp.com',databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'kalmia-shift'});
  const db=getDatabase(app),actor=await wait(()=>startPortalAuth(app,{pageName:'労務管理'}));
  let offset=0,connected=false;
  watch('.info/serverTimeOffset',s=>offset=s.val()||0);
  watch('.info/connected',s=>connected=s.val()===true);
  const port={read:p=>wait(()=>readServerProfile({databaseURL:app.options.databaseURL,user:window.portalAuth.user,path:p})),timestamp:serverTimestamp,now:()=>Date.now()+offset,
    update:updates=>wait(()=>{if(!connected)throw Error('通信を確認してから保存してください。');return update(ref(db),updates);}),
    transaction:async(p,fn)=>{lifecycle.assertActive();if(!connected)throw Error('通信を確認してください。');let off,release;try{
      await wait(()=>new Promise((resolve,reject)=>{release=lifecycle.add(()=>reject(Error('労務管理の利用が終了しました。')));off=watch(p,resolve,reject);}));
      return await wait(()=>runTransaction(ref(db,p),value=>{lifecycle.assertActive();return fn(value);},{applyLocally:false}));
    }finally{off?.();release?.();}}};
  try{
    const store=createLaborStore(port,actor,defaultStaff);await wait(()=>store.authorize());
    const close=()=>{if(!lifecycle.active)return;lifecycle.stop();window.dispatchEvent(new Event('laborAccessLost'));document.body.replaceChildren();const p=document.createElement('p');p.textContent='労務管理の許可を確認できなくなりました。再読み込みしてください。';document.body.append(p);};
    watch('laborConfig/owners/'+actor.uid,s=>{if(s.val()!==true)close();},close);
    watch('laborConfig/enabled',s=>{if(s.val()!==true)close();},close);
    lifecycle.assertActive();
    return store;
  }catch(error){lifecycle.stop();throw error;}
}
