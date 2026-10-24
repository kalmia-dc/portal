import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {startPortalAuth} from './portal-auth.js?v=labor-20261014-2';
import {createPageLifecycle} from './portal-page-lifecycle.mjs';
import {canManage} from './goal-metrics-model.mjs?v=20261023-1';
const life=createPageLifecycle();
const app=initializeApp({apiKey:'AIzaSyDdMe7feUF6CKPHH0YIx7Suk-WnXtOYUu8',authDomain:'kalmia-shift.firebaseapp.com',databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'kalmia-shift',appId:'1:714175473480:web:7d6626a46e4a9dcb1fb57d'});
const profile=await startPortalAuth(app,{pageName:'目標・実績'});
life.assertActive();
const frame=document.getElementById('content'),buttons=[...document.querySelectorAll('[data-view]')];
const manager=canManage(profile);
document.getElementById('identity').textContent=profile.staffId==='sugihira'?'院長':profile.name;
document.querySelector('nav').hidden=false;
for(const button of buttons)button.hidden=button.dataset.view!=='goals'&&!manager;
document.getElementById('note').textContent=manager?'共有目標と管理者専用の経営分析。初診・再初診・一日平均来院数・自費率は「月次入力」で一度だけ入力します。':'共有目標の閲覧画面です。目標は6〜11月／12〜5月の半期で表示します。';
let current='';
function show(requested){
 life.assertActive();
 const view=manager&&['input','analysis'].includes(requested)?requested:'goals';
 if(current===view)return;
 if(current&&frame.contentDocument?.querySelector('.modal-backdrop.open')&&!confirm('入力画面を閉じて切り替えますか？保存していない内容は失われます。')){history.replaceState(null,'','#'+current);return;}
 current=view;history.replaceState(null,'','#'+view);
 const params=new URLSearchParams(location.search);params.set('embedded','1');params.set('view',view);
 frame.src=(view==='goals'?'./goal-manager.html':'./private-metrics.html')+'?'+params;
 frame.title=view==='goals'?'目標と実績':view==='input'?'月次入力':'経営分析';
 frame.hidden=false;document.getElementById('status').hidden=true;
 for(const button of buttons)button.setAttribute('aria-current',button.dataset.view===view?'page':'false');
}
for(const button of buttons)button.addEventListener('click',()=>show(button.dataset.view));
const onHash=()=>show(location.hash.slice(1));window.addEventListener('hashchange',onHash);
life.add(()=>{window.removeEventListener('hashchange',onHash);frame.remove();document.querySelector('nav').hidden=true;document.getElementById('identity').textContent='利用権限を再確認してください';});
show(location.hash.slice(1));

