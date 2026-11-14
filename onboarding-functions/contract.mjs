import {validateTerms} from './contract-terms.mjs';
import {validateRenewal} from './contract-renewal-terms.mjs';
import {createHash} from 'node:crypto';

export const contractConsent = [
  'この契約書をポータルで受け取り、PDFを保存する方法に同意します。',
  '表示された契約書の全文と労働条件を確認し、本人として同意します。',
];

export async function handleContract({port,actor,input,path,record,own,fail,recipient}) {
  const old=record || {state:'draft',revision:0,stage:'preparing'};
  const body=await port.body(path,record);
  if(input.action==='detail') {
    if(own && old.stage!=='released') fail('failed-precondition','契約書は準備中です。');
    if(path.renewal && body.contract &&
      createHash('sha256').update(Buffer.from(body.files?.[0]?.data||'','base64')).digest('hex')!==body.contract.sha256){
      fail('failed-precondition','契約書PDFの照合に失敗しました。');
    }
    return {...old,files:body.files||[],contract:body.contract||null,consent:body.consent||null,terms:body.terms||null,
      ...(path.renewal?{renewal:body.renewal||null,review:body.review||null}:{})};
  }
  const allowed=own?['contract-agree']:['contract-prepare','contract-release','contract-accept',...(path.renewal?['contract-withdraw']:[])];
  if(!allowed.includes(input.action)) fail('permission-denied','この操作の権限がありません。');
  if(typeof input.operation!=='string' || !/^[-_A-Za-z0-9]{1,120}$/.test(input.operation) || !Number.isInteger(input.revision)) fail('invalid-argument','画面を更新してください。');
  if(old.operation===input.operation && old.actor===actor.uid && old.action===input.action) return {revision:old.revision};
  if(old.revision!==input.revision) fail('aborted','契約書が更新されました。再読み込みしてください。');
  const next={...old,revision:old.revision+1,updatedAt:port.now(),actor:actor.uid,action:input.action,operation:input.operation};
  let content=body;
  if(input.action==='contract-prepare') {
    if(old.stage==='released'||old.stage==='withdrawn') fail('failed-precondition','この契約書は上書きできません。');
    const file=input.files?.[0];
    if(input.files?.length!==1 || file?.type!=='application/pdf' || typeof file.data!=='string' || file.data.length>16777216) fail('invalid-argument','12MB以下のPDFを選択してください。');
    const bytes=Buffer.from(file.data,'base64');
    if(bytes.length<12 || bytes.length>12*1024*1024 || bytes.subarray(0,5).toString()!=='%PDF-' || bytes.toString('base64')!==file.data) fail('invalid-argument','PDFの形式を確認してください。');
    const version=input.contractVersion;
    if(typeof version!=='string' || !version.trim() || version.length>100) fail('invalid-argument','契約書の版を入力してください。');
    let terms=null;
    let renewal;
    try {
      if(input.terms||path.renewal) terms=validateTerms(input.terms);
      if(path.renewal) renewal=validateRenewal(input.renewal);
    } catch(error){fail('invalid-argument',error.message);}
    content={terms,files:[file],contract:{version:version.trim(),sha256:createHash('sha256').update(bytes).digest('hex'),preparedBy:actor.uid,preparedAt:next.updatedAt}};
    if(path.renewal){
      content.renewal=renewal;
      next.version=content.contract.version;
    }
    next.stage='preparing';next.state='draft';next.hasFiles=true;
  } else if(input.action==='contract-release') {
    if(old.stage!=='preparing' || !body.contract || input.confirm!==true) fail('failed-precondition','契約書と交付条件を確認してください。');
    if(body.terms && Object.values(body.terms).some(text=>text.includes('個別条件を入力してください'))) fail('failed-precondition','未入力の個別条件を設定して保存してください。');
    content={...body,contract:{...body.contract,releasedBy:actor.uid,releasedAt:next.updatedAt}};
    next.stage='released';
    if(path.renewal){
      next.signerUid=recipient.uid;
      next.employmentStart=recipient.current.startDate;
    }
  } else if(input.action==='contract-agree') {
    if(old.stage!=='released' || old.state!=='draft' || !body.contract) fail('failed-precondition','現在この契約書には同意できません。');
    if(input.sha256!==body.contract.sha256 || input.contractVersion!==body.contract.version ||
       (path.renewal && createHash('sha256').update(Buffer.from(body.files?.[0]?.data||'','base64')).digest('hex')!==body.contract.sha256)) fail('aborted','契約書が更新されました。再読み込みしてください。');
    if(!Array.isArray(input.agreed) || input.agreed.length!==2 || input.agreed.some(v=>v!==true)) fail('invalid-argument','受取方法と契約内容の両方を確認してください。');
    const candidate=recipient||await port.candidate(path.staff);
    if(!candidate?.name?.trim()) fail('failed-precondition','登録氏名を確認してください。');
    content={...body,consent:{version:body.contract.version,sha256:body.contract.sha256,paragraphs:contractConsent,uid:actor.uid,signerName:candidate.name,at:next.updatedAt}};
    next.state='submitted';
  } else if(input.action==='contract-withdraw'){
    if(old.stage!=='released'||old.state!=='draft'||input.confirm!==true) fail('failed-precondition','署名前の契約書のみ提示を取り下げられます。');
    next.stage='withdrawn';
  } else {
    if(old.stage!=='released'||old.state!=='submitted' || !body.consent) fail('failed-precondition','本人の同意を確認してください。');
    content={...body,review:{uid:actor.uid,at:next.updatedAt}};
    next.state='accepted';
  }
  if(path.renewal && input.action==='contract-prepare' && !record)await port.registerRenewal(path);
  await port.write(path,record,next,content);
  return {revision:next.revision};
}
