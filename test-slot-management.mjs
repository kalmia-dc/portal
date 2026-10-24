import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {getDatabase,ref,get,onValue,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {firebaseConfig} from './support-firebase-config.mjs';
import {startPortalAuth} from './portal-auth.js?v=labor-20261014-2';
import {createPageLifecycle} from './portal-page-lifecycle.mjs';
import {inspectTestSlot,changeTestSlot} from './test-slot-model.mjs';
const $=id=>document.getElementById(id),page=createPageLifecycle();
let actor,db,expected=null,busy=false;
page.add(()=>{expected=null;$('panel').hidden=true;$('detail').textContent='';$('apply').disabled=true;});
const app=getApps().find(a=>a.name==='[DEFAULT]')||initializeApp(firebaseConfig);
const status=s=>{$('status').textContent=s;};
async function read(){page.assertActive();const paths=['extra_staff/test','portalAccess/users','attendance/cards','staffLifecycle/test','laborConfig/enabled','laborConfig/owners/'+actor.uid,'laborConfig/protectedStaff/test'];const values=await Promise.all(paths.map(async p=>(await get(ref(db,p))).val()));page.assertActive();return {staff:values[0]?{...values[0],id:'test'}:null,users:values[1]||{},cards:values[2]||{},state:values[3],config:{enabled:values[4],owners:{[actor.uid]:values[5]},protectedStaff:{test:values[6]}}};}
function display(value){expected=value;$('checked').checked=false;$('apply').disabled=true;$('detail').textContent='test：'+(value.action==='stop'?'通常利用状態':'利用停止中')+'／関連ログイン '+value.accounts+'件／カード '+value.cards+'件';$('apply').textContent=value.action==='stop'?'testの利用停止を確定':'testの復帰を確定';$('panel').hidden=false;}
async function reload(){if(busy)return;busy=true;expected=null;$('apply').disabled=true;try{display(inspectTestSlot({actor,...await read()}));status('最新の状態を確認しました。');}catch(e){status(e.message);}finally{busy=false;}}
$('checked').onchange=()=>{$('apply').disabled=busy||!expected||!$('checked').checked||expected.accounts>0||expected.cards>0;};
$('reload').onclick=reload;
$('apply').onclick=async()=>{if(busy||!expected||!$('checked').checked)return;busy=true;$('apply').disabled=true;$('reload').disabled=true;const operationId=crypto.randomUUID();try{
 const verified=await changeTestSlot({actor,expected,operationId,timestamp:serverTimestamp(),read,transact:async transform=>{page.assertActive();const target=ref(db,'staffLifecycle/test');let off;try{await new Promise((resolve,reject)=>{off=onValue(target,resolve,reject)});page.assertActive();return await runTransaction(target,current=>{page.assertActive();return transform(current);},{applyLocally:false});}finally{off?.();}}});
 display(verified);status('保存後の読み戻しで確認しました。履歴は保持されています。');
 }catch(e){expected=null;$('checked').checked=false;status(e.message+' 同じ操作を再実行する前に「最新状態を確認」を押してください。');}finally{busy=false;$('reload').disabled=false;}};
try{actor=await startPortalAuth(app,{pageName:'打刻テスト枠の管理'});page.assertActive();db=getDatabase(app);await reload();}catch(e){status(e.message||'利用許可を確認できません。');}
