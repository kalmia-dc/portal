// Production entry. Fails closed on local previews before importing any live SDK/config.
async function boot(){
 if(location.origin!=='https://kalmia-dc.github.io'||location.pathname!=='/portal/support-chat.html')throw Error('本番用ページです。ローカル検証は専用fixtureを使用してください。');
 const [{initializeApp,getApps},{startPortalAuth},{firebaseConfig},{createRtdbTransport}]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
  import('./portal-auth.js?v=labor-20261014-2'),import('./support-firebase-config.mjs'),import('./support-rtdb.mjs')
 ]);
 const app=getApps().find(a=>a.name==='[DEFAULT]')??initializeApp(firebaseConfig);
 const profile=await startPortalAuth(app,{pageName:'ポータルの不具合相談'});
 if(window.portalAccessLost||!window.portalAuth?.user)throw Error('利用許可を再確認してください。');
 window.supportTransport=createRtdbTransport({databaseURL:firebaseConfig.databaseURL,user:window.portalAuth.user,profile,isAccessLost:()=>!!window.portalAccessLost||!window.portalAuth?.user});
 document.querySelector('.demo')?.remove();
 document.getElementById('identity').closest('label').hidden=true;
 document.getElementById('switch').hidden=true;
 await import('./support-ui.mjs?v=20261021-director');
}
boot().catch(()=>{const target=document.getElementById('feedback');if(target)target.textContent='利用許可または接続を確認できません。管理者へご確認ください。ローカルでは専用fixtureを使用してください。';});
