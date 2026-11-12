import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {getDatabase, ref, get} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {firebaseConfig} from './support-firebase-config.mjs';
import {startPortalAuth} from './portal-auth.js?v=labor-20261014-2';
import {createPageLifecycle} from './portal-page-lifecycle.mjs';
import {getDocument,GlobalWorkerOptions} from './assets/labor/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('./assets/labor/pdf.worker.mjs',import.meta.url).href;

const lifecycle=createPageLifecycle();
const app=initializeApp(firebaseConfig);
const $=id=>document.getElementById(id);
let objectUrl;
let pdfDocument,loadingTask,pageNumber=1,rendering=false;
async function renderPage(){
  if(rendering||!pdfDocument||!lifecycle.active)return;
  rendering=true;
  $('previousPage').disabled=$('nextPage').disabled=true;
  try{
    const page=await pdfDocument.getPage(pageNumber);
    lifecycle.assertActive();
    const canvas=$('pdfCanvas');
    const scale=canvas.clientWidth/page.getViewport({scale:1}).width*Math.min(devicePixelRatio||1,2);
    const viewport=page.getViewport({scale});
    canvas.width=viewport.width;canvas.height=viewport.height;
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    lifecycle.assertActive();
    $('pageNumber').textContent=`${pageNumber} / ${pdfDocument.numPages} ページ`;
  }finally{
    rendering=false;
    if(lifecycle.active&&pdfDocument){$('previousPage').disabled=pageNumber===1;$('nextPage').disabled=pageNumber===pdfDocument.numPages;}
  }
}
function viewerError(){if(lifecycle.active){$('viewer').hidden=true;$('status').textContent='ページ表示に失敗しました。「PDFを別画面で開く」または「PDFを保存する」をご利用ください。';}}
for(const [id,delta]of [['previousPage',-1],['nextPage',1]])$(id).addEventListener('click',()=>{pageNumber+=delta;renderPage().catch(viewerError);});
function clearPdf(){
  for(const id of ['openPdf','savePdf']) $(id)?.removeAttribute('href');
  if(objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl=undefined;
  const canvas=$('pdfCanvas');if(canvas){canvas.width=0;canvas.height=0;}
  if($('viewer'))$('viewer').hidden=true;
  const task=loadingTask;
  pdfDocument=undefined;loadingTask=undefined;
  if(task)void task.destroy().catch(()=>{});
}
lifecycle.add(clearPdf);
window.addEventListener('pagehide',clearPdf);
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
$('retry').addEventListener('click',()=>location.reload());
try{
  const profile=await startPortalAuth(app,{pageName:'就業規則'});
  lifecycle.assertActive();
  $('content').hidden=false;
  if(!['admin','trainingAdmin','staff'].includes(profile.portalRole)){
    $('status').textContent='このアカウントでは就業規則を閲覧できません。職員用アカウントでログインしてください。';
  }else{
    const params=new URLSearchParams();
    if(profile.staffId)params.set('staff',profile.staffId);
    $('home').href='./index.html?'+params;
    const snapshot=await get(ref(getDatabase(app),'clinicDocuments/workRules202508'));
    lifecycle.assertActive();
    const data=snapshot.val();
    if(!data||data.mimeType!=='application/pdf'||typeof data.base64!=='string'||data.base64.length>2000000)throw Error('invalid document');
    const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    lifecycle.assertActive();
    if(hash!==data.sha256||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('document integrity');
    objectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    $('openPdf').href=objectUrl;
    $('savePdf').href=objectUrl;
    for(const id of ['actions','hint','viewer'])$(id).hidden=false;
    $('status').textContent='就業規則を閲覧・保存できます。';
    try{
      loadingTask=getDocument({data:bytes,isEvalSupported:false});
      pdfDocument=await loadingTask.promise;
      lifecycle.assertActive();
      await renderPage();
    }catch{viewerError();}
  }
}catch(error){
  if(lifecycle.active){
    clearPdf();
    $('content').hidden=false;
    $('status').classList.add('error');
    $('status').textContent='就業規則を読み込めませんでした。通信とログイン状態を確認して、再読み込みしてください。';
    $('retry').hidden=false;
  }
}
