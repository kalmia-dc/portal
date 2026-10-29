import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {startPortalAuth,canManageAll} from './portal-auth.js';
import {readServerProfile} from './portal-server-profile.mjs';
import {ISSUER,todayJST,taxAmount,validateRecord,versionText,basename,encodeRecord,decodeRecord,nextVersion,assertNoCollision,assertMatchesSavedJSON} from './invoice-supplement-core.mjs?v=20261029-3';

const config={apiKey:'AIzaSyDdMe7feUF6CKPHH0YIx7Suk-WnXtOYUu8',authDomain:'kalmia-shift.firebaseapp.com',databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'kalmia-shift',storageBucket:'kalmia-shift.firebasestorage.app',messagingSenderId:'714175473480',appId:'1:714175473480:web:7d6626a46e4a9dcb1fb57d'};
const $=id=>document.getElementById(id);
const ids={receiptNumber:'receipt-number',transactionDate:'transaction-date',issueDate:'issue-date',recipient:'recipient',content:'content',amount:'amount'};
let profile=null,directory=null,version=1,loaded=false,busy=false,savedJSON=null,accessLost=false,documentDirty=false;
const yen=value=>new Intl.NumberFormat('ja-JP').format(value)+' 円';
const dateText=value=>value?value.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1年$2月$3日'):'—';
function message(text,error=false){$('message').textContent=text;$('message').dataset.error=String(error);}
function authorized(){return !accessLost&&!window.portalAccessLost&&canManageAll(profile)&&window.portalAuth?.user?.uid===profile?.uid;}
function checkActive(){if(!authorized())throw Error('管理者権限がありません。再読み込みして確認してください。');if(!navigator.onLine)throw Error('通信が途切れています。復旧してから再試行してください。');}
async function guard(){
  checkActive();
  const raw=await readServerProfile({databaseURL:config.databaseURL,user:window.portalAuth.user});
  checkActive();
  if(raw?.active!==true||raw?.role!=='admin'||raw?.staffId!==profile.staffId){lock();throw Error('管理者の利用許可が変更されました。');}
}
function lock(){accessLost=true;directory=null;savedJSON=null;document.body.removeAttribute('data-print-ready');$('invoice-app')?.setAttribute('hidden','');const msg=$('access-message');if(msg)msg.textContent='管理者の利用許可を確認できません。再読み込みしてください。';}
function rawRecord(){const data={version};for(const [key,id] of Object.entries(ids))data[key]=$(id).value;data.amount=/^[0-9]+$/.test(data.amount)?Number(data.amount):NaN;return data;}
function currentRecord(){return validateRecord(rawRecord());}
function updatePreview(){
  document.body.removeAttribute('data-print-ready');
  const r=rawRecord();let valid=null;try{valid=validateRecord(r);}catch{}
  $('version').textContent=versionText(version);$('p-version').textContent=`第${version}版`;
  for(const [id,value] of Object.entries({'p-receipt':r.receiptNumber||'—','p-recipient':r.recipient||'交付先事業者名','p-transaction':dateText(r.transactionDate),'p-issue':dateText(r.issueDate),'p-content':r.content||'—'}))$(id).textContent=value;
  let amount='— 円',tax='— 円';try{tax=yen(taxAmount(r.amount));amount=yen(r.amount);}catch{}
  $('p-amount').textContent=amount;$('p-tax').textContent=tax;$('tax-display').textContent=tax;
  $('filename').textContent=valid?basename(valid)+'.json / .pdf':'必須項目を入力すると表示します';
  $('draft-mark').hidden=Boolean(valid);
}
function applyRecord(record){for(const [key,id]of Object.entries(ids))$(id).value=record[key]??'';version=record.version;documentDirty=false;updatePreview();}
function reset(){loaded=false;savedJSON=null;applyRecord({receiptNumber:'',transactionDate:'',issueDate:todayJST(),recipient:'',content:'',amount:'',version:1});}
async function listNames(){
  checkActive();if(!directory)throw Error('先に「インボイス補足書」フォルダを選択してください。');
  if(await directory.queryPermission({mode:'readwrite'})!=='granted')throw Error('保存フォルダへの読み書きが許可されていません。フォルダを選び直してください。');
  const names=[];for await(const [name,handle] of directory.entries()){if(handle.kind==='file')names.push(name);}
  checkActive();return names;
}
async function run(action){if(busy)return;busy=true;const controls=[...document.querySelectorAll('#invoice-form button, #invoice-form input, #invoice-form select')];controls.forEach(b=>b.disabled=true);try{await action();}catch(e){document.body.removeAttribute('data-print-ready');message(e?.name==='AbortError'?'操作を取り消しました。保存・発行は行っていません。':e?.name==='NotAllowedError'?'フォルダまたはファイルへのアクセスが許可されませんでした。':e?.message||'処理できませんでした。もう一度確認してください。',true);}finally{busy=false;controls.forEach(b=>b.disabled=false);}}
function selectFile(accept,action){
  try{checkActive();}catch(e){message(e.message,true);return;}
  const input=document.createElement('input');input.type='file';input.accept=accept;
  input.addEventListener('change',()=>{const file=input.files?.[0];if(file)void run(async()=>{await guard();await action(file);});},{once:true});input.click();
}
async function saveJSON(){
  if(!$('invoice-form').reportValidity())return;
  const record=currentRecord();await guard();
  if(loaded)throw Error('読込済みの版は上書きできません。「修正版作成」で次の版を作成してください。');
  const perform=async()=>{
    const names=await listNames();assertNoCollision(names,record);const name=basename(record)+'.json';
    // Do not open an existing handle for writing. Recheck immediately before creation.
    await guard();const fresh=await listNames();assertNoCollision(fresh,record);
    const file=await directory.getFileHandle(name,{create:true});let writable;
    try{await guard();writable=await file.createWritable();await writable.write(encodeRecord(record));checkActive();await writable.close();writable=null;}catch(error){if(writable)await writable.abort().catch(()=>{});throw error;}
    const readback=decodeRecord(await (await file.getFile()).text());
    if(encodeRecord(readback)!==encodeRecord(record))throw Error('保存後の照合に失敗しました。ファイルを確認し、同じ名前で再保存しないでください。');
    savedJSON=encodeRecord(record);documentDirty=false;message(`JSONを保存し、内容を照合しました：${name}。PDFは印刷画面で同じフォルダへ保存してください。`);
  };
  if(navigator.locks)await navigator.locks.request('kalmia-invoice-save',{mode:'exclusive'},perform);else await perform();
}
async function printInvoice(){
  if(!$('invoice-form').reportValidity())return;
  const record=currentRecord();await guard();const names=await listNames();
  const jsonName=basename(record)+'.json';
  if(!names.some(name=>name.toLowerCase()===jsonName.toLowerCase()))throw Error('先に現在の内容を「JSONを保存」で保存してください。読込済みの版を訂正する場合は「修正版作成」を使用してください。');
  // A saved JSON can resume its first PDF output after reload. A PDF already
  // present in the folder is never regenerated; reissue that existing PDF.
  assertNoCollision(names,record,{ownJSON:true});
  const savedFile=await (await directory.getFileHandle(jsonName)).getFile();
  if(savedFile.size>65536)throw Error('保存済みJSONが大きすぎます。ファイルを確認してください。');
  assertMatchesSavedJSON(record,await savedFile.text());await guard();
  document.title=basename(record);document.body.dataset.printReady='true';
  try{window.print();message(`印刷画面を開きました。PDFの保存完了は自動判定しません。${basename(record)}.pdf を選択フォルダへ保存し、PDF・JSONの両方を確認してください。`);}finally{document.body.removeAttribute('data-print-ready');document.title='インボイス補足書 | カルミアDC';}
}
function showPDF(file){
  if(!file.name.toLowerCase().endsWith('.pdf')||file.size>50*1024*1024)throw Error('50MB以下のPDFを選択してください。');
  return file.slice(0,5).text().then(header=>{
    checkActive();if(header!=='%PDF-')throw Error('PDF形式のファイルではありません。');
    const url=URL.createObjectURL(file),dialog=document.createElement('dialog'),heading=document.createElement('p'),frame=document.createElement('iframe'),close=document.createElement('button');
    dialog.className='screen-only';dialog.style.cssText='width:92vw;max-width:1100px;height:90vh;border:1px solid #b6cbbf;border-radius:12px;padding:16px';heading.textContent='再交付用PDF：'+file.name;frame.title='保存済みの補足書PDF';frame.src=url;frame.style.cssText='width:100%;height:calc(100% - 100px);border:0';close.textContent='閉じる';close.onclick=()=>dialog.close();dialog.append(heading,close,frame);document.body.append(dialog);dialog.addEventListener('close',()=>{frame.src='about:blank';URL.revokeObjectURL(url);dialog.remove();},{once:true});dialog.showModal();
  });
}
window.addEventListener('portalAccessLost',lock);
window.addEventListener('offline',()=>document.body.removeAttribute('data-print-ready'));
window.addEventListener('beforeprint',()=>{if(!authorized()||!navigator.onLine)document.body.removeAttribute('data-print-ready');});
window.addEventListener('afterprint',()=>document.body.removeAttribute('data-print-ready'));
window.addEventListener('beforeunload',event=>{if(authorized()&&documentDirty){event.preventDefault();event.returnValue='';}});
try{
  profile=await startPortalAuth(initializeApp(config),{pageName:'インボイス補足書'});
  if(!canManageAll(profile)){profile=null;$('access-message').textContent='インボイス補足書は管理者専用です。院内ポータルへ戻ってください。';}
  else{
    await guard();$('identity').textContent=profile.name+' さん / 管理者';$('invoice-app').hidden=false;reset();
    $('invoice-form').addEventListener('input',()=>{documentDirty=true;updatePreview();});
    $('invoice-form').addEventListener('submit',event=>{event.preventDefault();void run(saveJSON);});
    $('choose-folder').onclick=()=>{
      // The native picker must be called in the original click gesture.
      let selection;try{checkActive();if(!window.showDirectoryPicker)throw Error('このブラウザではフォルダ保存を利用できません。PC版EdgeまたはChromeで開いてください。');selection=window.showDirectoryPicker({mode:'readwrite',id:'kalmia-invoice'});}catch(e){message(e.message,true);return;}
      void run(async()=>{const chosen=await selection;await guard();if(chosen.name!=='インボイス補足書')throw Error('事務関連の中の「インボイス補足書」フォルダを選択してください。');directory=chosen;savedJSON=null;await listNames();$('folder-status').textContent='選択済み：'+chosen.name+'（親フォルダが「事務関連」であることをご確認ください）';message('保存フォルダを選択しました。入力後、JSON保存とPDF出力を行ってください。');});
    };
    $('print-invoice').onclick=()=>void run(printInvoice);
    $('load-json').onclick=()=>selectFile('.json,application/json',async file=>{
      if(documentDirty&&!confirm('未保存の入力を置き換えてJSONを読み込みますか？'))return;
      if(file.size>65536)throw Error('64KB以下の補足書JSONを選択してください。');
      const record=decodeRecord(await file.text());checkActive();applyRecord(record);loaded=true;savedJSON=null;message('JSONを読み込み、税額を再計算しました。PDFが未作成なら同じ保存フォルダを選んで「PDF出力・印刷」で続行できます。訂正は「修正版作成」、再交付は「保存済みPDFを開く」を選んでください。');
    });
    $('revision').onclick=()=>void run(async()=>{
      if(!loaded)throw Error('先に訂正元のJSONを読み込んでください。');
      const record=currentRecord();await guard();const names=await listNames();version=nextVersion(names,record);$('issue-date').value=todayJST();loaded=false;savedJSON=null;documentDirty=true;updatePreview();message('修正版 '+versionText(version)+' を準備しました。内容を訂正して、新しいJSON・PDFを保存してください。');
    });
    $('open-pdf').onclick=()=>selectFile('.pdf,application/pdf',showPDF);
    $('new-invoice').onclick=()=>void run(async()=>{await guard();if(confirm('入力内容を初期化して、新規作成しますか？保存済みファイルは変更しません。')){reset();message('新規作成に切り替えました。保存フォルダの選択は保持しています。');}});
  }
}catch(error){if($('access-message'))$('access-message').textContent='認証または管理者権限を確認できません。通信状況を確認して再読み込みしてください。';$('invoice-app')?.setAttribute('hidden','');}
