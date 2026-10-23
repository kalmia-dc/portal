import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getDatabase} from 'firebase-admin/database';
import {getStorage} from 'firebase-admin/storage';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onMessagePublished} from 'firebase-functions/v2/pubsub';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {ImageAnnotatorClient} from '@google-cloud/vision';
import {createHash,randomUUID} from 'node:crypto';
import {assertMember,requireOwner,validateFields,duplicates,changeRecord} from './model.mjs';
initializeApp({databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',storageBucket:'kalmia-shift-business-cards'});
const root=()=>getDatabase().ref('businessCardsV1'),bucket=()=>getStorage().bucket();
const options={region:'asia-southeast1',maxInstances:2,minInstances:0,memory:'512MiB',timeoutSeconds:120,cors:['https://kalmia-dc.github.io']};
const key=v=>{if(typeof v!=='string'||!/^[-_a-zA-Z0-9]{1,100}$/.test(v))throw Error('識別番号が不正です。');return v;};
async function member(req){
  if(!req.auth)throw new HttpsError('unauthenticated','ログインしてください。');
  const user=await getAuth().getUser(req.auth.uid);
  if(user.disabled||req.auth.token.firebase?.sign_in_provider==='anonymous'||(user.tokensValidAfterTime&&req.auth.token.auth_time*1000<Date.parse(user.tokensValidAfterTime)))throw new HttpsError('permission-denied','再ログインしてください。');
  if((await getDatabase().ref('serviceAccess/notifications/uid').get()).val()===req.auth.uid)throw new HttpsError('permission-denied','個人アカウントを使用してください。');
  const p=(await getDatabase().ref('portalAccess/users/'+req.auth.uid).get()).val();
  const lifecycle=p?.staffId?(await getDatabase().ref('staffLifecycle/'+p.staffId).get()).val():null;
  return {...assertMember(p,lifecycle),uid:req.auth.uid};
}
function imageData(raw){if(typeof raw!=='string'||raw.length>7000000)throw Error('画像は5MB以下にしてください。');const m=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(raw);if(!m)throw Error('JPEGまたはPNGを選択してください。');const b=Buffer.from(m[2],'base64');if(b.length>5000000||b.length<8||!(b[0]===255&&b[1]===216||b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))))throw Error('画像を読み取れません。');return {bytes:b,type:'image/'+m[1],ext:m[1]==='jpeg'?'jpg':'png'};}
export const businessCards=onCall(options,async req=>{
  try{
    const actor=await member(req),d=req.data||{},action=d.action;
    const config=(await root().child('config').get()).val();
    if(!config?.enabled)throw new HttpsError('failed-precondition','名刺管理は準備中です。');
    if(action==='list'){
      if(d.trash)requireOwner(actor);
      const cards=(await root().child('cards').get()).val()||{};
      return {headers:config.headers,cards:Object.entries(cards).filter(([,c])=>!c.purgedAt&&(!!c.deletedAt===!!d.trash)).map(([id,{history,...c}])=>({id,...c})),budget:['sugihira','momo'].includes(actor.staffId)?(await root().child('budget').get()).val():null};
    }
    if(action==='ocr'){
      const image=imageData(d.image),op=key(d.operationId),receipt=root().child('ocrOperations/'+actor.uid+'/'+op);
      const claim=await receipt.transaction(x=>x?undefined:{state:'pending',at:Date.now()});
      if(!claim.committed){const old=claim.snapshot.val();if(old.state==='done')return {text:old.text};throw Error('読み取りの結果が未確定です。繰り返し実行せず、時間をおいて確認してください。');}
      try{const [result]=await new ImageAnnotatorClient().textDetection({image:{content:image.bytes},imageContext:{languageHints:['ja','en']}});if(result.error?.message)throw Error(result.error.message);const text=result.fullTextAnnotation?.text||result.textAnnotations?.[0]?.description||'';await receipt.set({state:'done',at:Date.now(),text});return {text};}catch{await receipt.update({state:'unknown'});throw Error('文字読み取りに失敗しました。手入力で登録できます。');}
    }
    const id=key(d.id),ref=root().child('cards/'+id),current=(await ref.get()).val();
    if(action==='detail'||action==='image'){
      if(!current||current.purgedAt)throw Error('名刺がありません。');if(current.deletedAt)requireOwner(actor);
      if(action==='detail')return {id,...current};
      const path=current.images?.[d.side==='back'?'back':'front'];if(!path)return {image:null};
      if(!path.startsWith('business-cards/cards/'+id+'/'))throw Error('画像の参照が不正です。');
      const file=bucket().file(path);const [[bytes],[metadata]]=await Promise.all([file.download(),file.getMetadata()]);
      return {image:'data:'+(metadata.contentType||'image/jpeg')+';base64,'+bytes.toString('base64')};
    }
    const operationId=key(d.operationId);
    if(['trash','restore','purge'].includes(action))requireOwner(actor);
    const operationHash=createHash('sha256').update(JSON.stringify({action,fields:d.fields||null,images:d.images||null})).digest('hex');
    if(current?.operationId===operationId){if(current.operationHash!==operationHash)throw Error('同じ保存操作の内容が変わっています。再読み込みしてください。');if(action==='purge')await bucket().deleteFiles({prefix:`business-cards/cards/${id}/`});return {id,revision:current.revision};}
    if(!Number.isInteger(d.expectedRevision)||d.expectedRevision<0)throw Error('更新番号が不正です。');
    const fields=action==='save'?validateFields(d.fields,config.headers):null;
    if(action==='save'&&!d.allowDuplicate&&!current){const matches=duplicates(fields,(await root().child('cards').get()).val(),id);if(matches.length)return {duplicates:matches};}
    // Check permission and revision before staging any files. Transaction checks again.
    changeRecord(current,{action,fields,expectedRevision:d.expectedRevision,operationId},actor,Date.now());
    const staged={};if(action==='save')for(const side of ['front','back'])if(d.images?.[side]){const im=imageData(d.images[side]);const path=`business-cards/cards/${id}/${randomUUID()}-${side}.${im.ext}`;await bucket().file(path).save(im.bytes,{resumable:false,metadata:{contentType:im.type,cacheControl:'private,no-store'}});staged[side]=path;}
    let failure;
    const changed=await ref.transaction(value=>{try{if(value?.operationId===operationId){if(value.operationHash!==operationHash)throw Error('同時保存の内容が異なります。再読み込みしてください。');return value;}const updated=changeRecord(value,{action,fields,expectedRevision:d.expectedRevision,operationId},actor,Date.now());updated.operationHash=operationHash;if(action==='save')updated.images={...value?.images,...staged};return updated;}catch(e){failure=e;return undefined;}});
    for(const path of Object.values(staged))if(!Object.values(changed.snapshot.val()?.images||{}).includes(path))await bucket().file(path).delete({ignoreNotFound:true});
    if(failure)throw failure;if(!changed.committed)throw Error('保存できませんでした。');
    if(action==='purge')await bucket().deleteFiles({prefix:`business-cards/cards/${id}/`});
    return {id,revision:changed.snapshot.val().revision};
  }catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('failed-precondition',e.message||'処理できませんでした。');}
});
export const businessCardBudget=onMessagePublished({topic:'portal-budget-alerts',region:'asia-southeast1',maxInstances:1},async event=>{
  const m=event.data.message.json;if(!m||!Number.isFinite(m.costAmount)||!m.costIntervalStart||m.currencyCode!=='JPY')return;
  await root().child('budget').transaction(old=>old?.interval===m.costIntervalStart&&old.cost>m.costAmount?undefined:{cost:m.costAmount,currency:m.currencyCode,budget:1000,interval:m.costIntervalStart,receivedAt:Date.now(),threshold:m.costAmount>=1000?1000:m.costAmount>=800?800:0});
});
export const businessCardBackup=onSchedule({schedule:'every day 03:10',timeZone:'Asia/Tokyo',region:'asia-southeast1',maxInstances:1},async()=>{
  const date=new Date().toISOString().slice(0,10),data=(await root().get()).val();
  await bucket().file(`business-cards/backups/${date}.json`).save(JSON.stringify(data),{resumable:false,metadata:{contentType:'application/json',cacheControl:'private,no-store'}});
  // The most recent thirty daily snapshots are retained. Card image versions are
  // immutable and retained with the card, except when the owner explicitly purges.
  const [files]=await bucket().getFiles({prefix:'business-cards/backups/'});for(const f of files.sort((a,b)=>b.name.localeCompare(a.name)).slice(30))await f.delete();
  const ops=(await root().child('ocrOperations').get()).val()||{};for(const [uid,items]of Object.entries(ops))for(const [id,v]of Object.entries(items))if(v.at<Date.now()-86400000*7)await root().child(`ocrOperations/${uid}/${id}`).remove();
});
