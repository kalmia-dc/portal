
import {createPageLifecycle} from './portal-page-lifecycle.mjs';
const pageLifecycle=createPageLifecycle();
async function pageAwait(work){pageLifecycle.assertActive();let result;try{result=await work();}catch(error){pageLifecycle.assertActive();throw error;}pageLifecycle.assertActive();return result;}
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,browserLocalPersistence,setPersistence,getRedirectResult,onAuthStateChanged,signInWithPopup,signInWithRedirect,signOut} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {getDatabase,ref,get,onValue as firebaseOnValue,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {assertApplicant,applicationChange} from './portal-join-model.mjs';
const app=initializeApp({apiKey:'AIzaSyDdMe7feUF6CKPHH0YIx7Suk-WnXtOYUu8',authDomain:'kalmia-shift.firebaseapp.com',databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'kalmia-shift',appId:'1:714175473480:web:7d6626a46e4a9dcb1fb57d'});
const auth=getAuth(app),db=getDatabase(app),$=id=>document.getElementById(id);
let busy=false,connected=false,ready=false,epoch=0;
const status=text=>{if(!pageLifecycle.active)return;$('status').textContent=text;};
function lock(value){if(!pageLifecycle.active)return;busy=value;$('application').querySelectorAll('input,select').forEach(el=>el.disabled=value);$('submitApplication').disabled=value||!ready||!connected;$('changeAccount').disabled=value;$('reloadApplication').disabled=value;$('login').disabled=value;}
onValue(ref(db,'.info/connected'),snap=>{connected=snap.val()===true;lock(busy);if(!connected && auth.currentUser)status('通信が途切れています。入力を保持して接続復帰を待っています。保存中の場合は再送せずお待ちください。');});
async function load(user,version,{keepDraft=false}={}) {try{
  ready=false;lock(true);
  try {
    assertApplicant(user);
    // Only the current account's own profile and own application are read.
    const [profileSnap,requestSnap]=await pageAwait(async () => (Promise.all([get(ref(db,`portalAccess/users/${user.uid}`)),get(ref(db,`portalJoinRequests/${user.uid}`))])));
    if(version!==epoch || auth.currentUser?.uid!==user.uid)return;
    const profile=profileSnap.val(),request=requestSnap.val();
    if(profile || request?.state==='approved') {
      $('application').hidden=true;
      status(profile?.active===true?'承認済みです。下の「ポータルへ」から利用できます。':'登録情報があります。利用再開や変更については管理者へ連絡してください。');return;
    }
    if(!keepDraft){$('applicantName').value=request?.name||user.displayName||'';$('applicantRole').value=request?.jobRole||'';}
    $('application').hidden=false;ready=true;
    $('submitApplication').textContent=request?'内容を更新して再申請する':'この内容で申請する';
    status(request?'申請を受け付けています。管理者の承認をお待ちください。修正は同じ申請に保存されます。':'氏名と職種を入力して申請してください。');
  } catch(error) {if (pageLifecycle.active) {if(version===epoch)status(`申請情報を確認できません。入力は保持しています。通信状況を確認し「申請状況を再読み込み」を押してください。 ${error.message}`);}}
  finally {if (pageLifecycle.active) {if(version===epoch)lock(false);}}
}catch(error){if(error?.code!=='portal/access-lost')throw error;}}
$('login').addEventListener('click',async()=>{try{
  if(busy)return;lock(true);
  const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  try {await pageAwait(async () => (signInWithPopup(auth,provider)));}
  catch(error){if (pageLifecycle.active) {if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'].includes(error.code))await pageAwait(async () => (signInWithRedirect(auth,provider)));else status(`ログインできませんでした。再試行してください。 ${error.message}`);}}
  finally{if (pageLifecycle.active) {lock(false);}}
}catch(error){if(error?.code!=='portal/access-lost')throw error;}});
$('changeAccount').addEventListener('click',async()=>{try{if(!busy)await pageAwait(async () => (signOut(auth)));}catch(error){if(error?.code!=='portal/access-lost')throw error;}});
$('reloadApplication').addEventListener('click',()=>{if(!busy&&auth.currentUser)void load(auth.currentUser,epoch,{keepDraft:true});});
$('application').addEventListener('submit',async event=>{try{
  event.preventDefault();if(busy||!ready||!connected)return;
  const user=auth.currentUser,version=epoch,name=$('applicantName').value,jobRole=$('applicantRole').value;
  lock(true);status('申請を保存しています。通信が切れた場合は接続復帰を待ってください。');
  let off;
  try {
    assertApplicant(user);const target=ref(db,`portalJoinRequests/${user.uid}`);
    await pageAwait(async () => (new Promise((resolve,reject)=>{off=onValue(target,resolve,reject);})));
    let failure;
    const result=await pageAwait(async () => (runTransaction(target,current=>{
      failure=undefined;
      try{if(auth.currentUser?.uid!==user.uid)throw Error('アカウントが変わりました。');return applicationChange({user,current,name,jobRole,timestamp:serverTimestamp()});}
      catch(error){if (pageLifecycle.active) {failure=error;return undefined;}}
    },{applyLocally:false})));
    if(failure)throw failure;if(!result.committed)throw Error('申請は保存されませんでした。');
    if(version===epoch){status('申請しました。管理者の承認をお待ちください。修正して再送しても申請は重複しません。');$('submitApplication').textContent='内容を更新して再申請する';}
  } catch(error){if (pageLifecycle.active) {if(version===epoch)status(`申請を完了できませんでした。入力は残っています。再試行または状況の再読み込みをしてください。 ${error.message}`);}}
  finally{if (pageLifecycle.active) {off?.();if(version===epoch)lock(false);}}
}catch(error){if(error?.code!=='portal/access-lost')throw error;}});
try {
  await pageAwait(async () => (setPersistence(auth,browserLocalPersistence)));await pageAwait(async () => (getRedirectResult(auth)));
  pageLifecycle.add(onAuthStateChanged(auth,pageLifecycle.guard(user=>{
    const version=++epoch;ready=false;$('application').hidden=true;$('login').hidden=!!user;$('account').hidden=!user;
    $('applicantName').value='';$('applicantRole').value='';lock(false);
    if(!user){status('本人のGoogleアカウントでログインしてください。');return;}
    $('email').textContent=user.email||'';void load(user,version);
  })));
}catch(error){if (pageLifecycle.active) {status(`ログインを準備できませんでした。ページを再読み込みしてください。 ${error.message}`);}}

function onValue(target,next,error,...options){pageLifecycle.assertActive();return pageLifecycle.add(firebaseOnValue(target,pageLifecycle.guard(next),pageLifecycle.guard(error),...options));}
