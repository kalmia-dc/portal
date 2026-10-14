import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {getDatabase,ref,get,update,runTransaction,onValue,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {startPortalAuth} from './portal-auth.js?v=labor-20261014-2';
import {createLaborStore} from './labor-store.mjs';
import {defaultStaff} from './portal-default-staff.mjs';
import {readServerProfile} from './portal-server-profile.mjs';
export async function connectLabor(){
  const app=initializeApp({apiKey:'AIzaSyDdMe7feUF6CKPHH0YIx7Suk-WnXtOYUu8',authDomain:'kalmia-shift.firebaseapp.com',databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'kalmia-shift'});
  const db=getDatabase(app),actor=await startPortalAuth(app,{pageName:'労務管理'});
  let offset=0,connected=false;onValue(ref(db,'.info/serverTimeOffset'),s=>offset=s.val()||0);onValue(ref(db,'.info/connected'),s=>connected=s.val()===true);
  const port={read:p=>readServerProfile({databaseURL:app.options.databaseURL,user:window.portalAuth.user,path:p}),timestamp:serverTimestamp,now:()=>Date.now()+offset,
    update:updates=>{if(!connected)throw Error('通信を確認してから保存してください。');return update(ref(db),updates);},
    transaction:async(p,fn)=>{if(!connected)throw Error('通信を確認してください。');let off;try{await new Promise((resolve,reject)=>{off=onValue(ref(db,p),resolve,reject);});return await runTransaction(ref(db,p),fn,{applyLocally:false});}finally{off?.();}}};
  const store=createLaborStore(port,actor,defaultStaff);await store.authorize();
  const close=()=>{window.dispatchEvent(new Event('laborAccessLost'));document.body.replaceChildren();const p=document.createElement('p');p.textContent='労務管理の許可を確認できなくなりました。再読み込みしてください。';document.body.append(p);};
  onValue(ref(db,'laborConfig/owners/'+actor.uid),s=>{if(s.val()!==true)close();},close);
  onValue(ref(db,'laborConfig/enabled'),s=>{if(s.val()!==true)close();},close);
  return store;
}
