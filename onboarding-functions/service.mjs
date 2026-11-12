import {handleContract} from './contract.mjs';
import {createHash} from 'node:crypto';
import {consentBlocks, documents, requiredChecks, roleDocuments, ROLES, VERSION} from './catalog.mjs';

export class OnboardingError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const fail = (code, message) => { throw new OnboardingError(code, message); };
const deny = () => fail('permission-denied', 'この手続きの利用権限がありません。');
export const safeKey = value => typeof value === 'string' && /^[-_A-Za-z0-9]{1,120}$/.test(value);
const states = new Set(['draft','submitted','returned','accepted','exempt','purged']);
const uploads = {jpeg:'image/jpeg',png:'image/png',pdf:'application/pdf'};
const maxFile = 3 * 1024 * 1024;

function bounded(value, limit, required = false) {
  if(typeof value !== 'string' || value.trim().length > limit || (required && !value.trim())) {
    fail('invalid-argument', '入力欄を確認してください。');
  }
  return value.trim();
}

function validateFields(doc, fields = {}) {
  const clean = Object.fromEntries((doc.fields || []).map(([key,,required])=>[
    key,bounded(fields[key] ?? '',key==='route'?500:80,required),
  ]));
  if(doc === documents.bank) {
    if(!/^\d{1,8}$/.test(clean.account) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(clean.payMonth)) {
      fail('invalid-argument','口座番号と振込開始月を確認してください。');
    }
  }
  if(doc === documents.commute) {
    for(const key of ['oneWay','roundTrip','monthly','duration']) {
      if(clean[key] && !/^\d{1,7}$/.test(clean[key])) fail('invalid-argument','運賃・通勤時間は数字で入力してください。');
    }
    if(clean.distance && !/^\d{1,4}(\.\d{1,2})?$/.test(clean.distance)) fail('invalid-argument','通勤距離を確認してください。');
  }
  return clean;
}

function validateFiles(doc, files) {
  if(!Array.isArray(files) || files.length > (doc.restricted ? 2 : doc.file ? 1 : 0)) fail('invalid-argument','添付の件数を確認してください。');
  return files.map(file=>{
    const {type,data} = file || {};
    if(!Object.values(uploads).includes(type) || (doc.restricted && type===uploads.pdf) ||
       typeof data!=='string' || data.length>4*Math.ceil(maxFile/3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      fail('invalid-argument','添付は1枚3MB以下のJPEG・PNG画像、または対応欄のPDFにしてください。');
    }
    const bytes = Buffer.from(data,'base64');
    const signature = type===uploads.jpeg ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
      : type===uploads.png ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.subarray(0,5).toString()==='%PDF-';
    if(bytes.length < 12 || bytes.length > maxFile || !signature || bytes.toString('base64') !== data) {
      fail('invalid-argument','添付ファイルの形式を確認してください。');
    }
    return {type,data};
  });
}

const stateOf = old => old?.state || 'draft';
const isEditable = state => ['draft','returned'].includes(state);
const summary = (record, restricted, privileged) => ({
  state:stateOf(record),revision:record?.revision||0,hasFiles:!!record?.hasFiles,
  updatedAt:record?.updatedAt||null,reason:restricted&&!privileged?'':record?.reason||'',required:!!record?.required,
});

export function createOnboardingService(port) {
  return async (actor, input) => {
    if(!actor || !safeKey(actor.uid) || !safeKey(actor.staffId)) deny();
    const config = await port.config();
    if(config?.enabled !== true) fail('failed-precondition','入社手続きは準備中です。');
    const reviewer = actor.reviewer === true;
    const vault = reviewer && config.vaultReaders?.[actor.uid] === true;
    const own = input?.mode !== 'review';
    if(!own && !reviewer) deny();
    const staff = own ? actor.staffId : input.staff;
    if(input.action==='list') {
      if(own) deny();
      return {cases:await port.eligible()};
    }
    if(!safeKey(staff)) deny();
    const candidate = await port.candidate(staff);
    const period = own ? candidate?.period : input.period;
    if(!safeKey(period)) fail('failed-precondition','入社手続きの対象者を確認してください。');
    const enrollment = await port.enrollment(staff, period);
    if(input.action==='open') {
      if(own || candidate?.period!==period || !Object.hasOwn(ROLES,candidate.role)) deny();
      await port.assign(staff,period,{role:candidate.role,openedAt:port.now(),openedBy:actor.uid});
      return {ok:true};
    }
    if(!enrollment || !Object.hasOwn(ROLES,enrollment.role)) fail('failed-precondition','受付開始待ちです。労務担当が入社手続きを開始すると提出できます。');
    if(own && (candidate?.period !== period || candidate.uid !== actor.uid)) deny();
    const keys = roleDocuments(enrollment.role);
    if(input.action==='status') {
      const items = await Promise.all(keys.map(async ([key,doc])=>{
        if(doc.restricted && config.vaultEnabled !== true) return [key,{available:false}];
        const record = await port.metadata({staff,period,key,restricted:!!doc.restricted});
        return [key,{...summary(record,!!doc.restricted,vault||own),available:!doc.contract || !own || record?.stage==='released', ...(doc.contract?{stage:record?.stage||'preparing'}:{})}];
      }));
      return {role:enrollment.role,staff,period,items:Object.fromEntries(items),vault,signerName:own?candidate.name:'',...(!own?{contractPresets:config.contractPresets||[]}:{} )};
    }

    const doc = keys.find(([key])=>key===input.item)?.[1];
    if(!doc) deny();
    const restricted = !!doc.restricted;
    if(restricted && (config.vaultEnabled!==true || (!own&&!vault))) deny();
    const key = input.item;
    const path = {staff,period,key,restricted};
    const record = await port.metadata(path);
    if(doc.contract) return handleContract({port,actor,input,path,record,own,fail});
    const old = record || {state:'draft',revision:0};
    if(!states.has(old.state)) fail('failed-precondition','保存状態を確認してください。');
    if(input.action==='detail') {
      if(restricted && (own || !old.hasFiles || !['submitted','accepted'].includes(old.state))) deny();
      if(!own && old.state==='draft') deny();
      if(restricted) await port.audit(path,actor.uid,'view',old.revision);
      const {fields,files,consent} = await port.body(path,record);
      return {...summary(old,restricted,true),fields:fields||{},files:files||[],consent:consent||null};
    }
    if(!['save','submit','accept','return','exempt','purge','require'].includes(input.action)) deny();
    if(own !== ['save','submit'].includes(input.action)) deny();
    if(!safeKey(input.operation) || !Number.isInteger(input.revision)) fail('invalid-argument','画面を更新してください。');
    if(old.operation===input.operation && old.actor===actor.uid && old.action===input.action) {
      if(restricted) await port.audit(path,actor.uid,input.action+'-completed',old.revision,input.operation);
      return {revision:old.revision};
    }
    if(old.revision!==input.revision) fail('aborted','別の操作で更新されました。再読み込みしてください。');

    const next = {state:old.state,revision:old.revision+1,updatedAt:port.now(),actor:actor.uid,
      operation:input.operation,action:input.action,reason:old.reason||'',hasFiles:!!old.hasFiles,required:!!old.required};
    let body;
    if(own) {
      if(!isEditable(old.state) || (restricted && input.action==='save')) deny();
      const submitting = input.action==='submit';
      if(submitting && input.version!==VERSION) fail('failed-precondition','書類が更新されました。再読み込みしてください。');
      body = restricted ? {} : await port.body(path,record);
      const files = input.files === undefined ? body.files||[] : validateFiles(doc,input.files);
      if(submitting && doc.file && files.length !== (restricted ? 2 : 1)) fail('invalid-argument','必要な画像・書類を添付してください。');
      const fields = submitting ? validateFields(doc,input.fields) : Object.fromEntries((doc.fields||[]).map(([k])=>[
        k,bounded(input.fields?.[k]??'',k==='route'?500:80),
      ]));
      const blocks = consentBlocks(doc);
      const count = requiredChecks(doc,blocks);
      if(submitting && count && (!Array.isArray(input.agreed) || input.agreed.length!==count || input.agreed.some(v=>v!==true))) {
        fail('invalid-argument','内容をすべて確認し、同意してください。');
      }
      const previous = body.consent ? [...(body.priorConsents||[]),body.consent] : body.priorConsents||[];
      if(previous.length>50) fail('failed-precondition','同意履歴を確認してください。労務担当にご連絡ください。');
      body = {fields,files,priorConsents:previous};
      if(submitting && count) body.consent = {version:VERSION,blocks,paragraphs:blocks.map(([,text])=>text),
        at:next.updatedAt,uid:actor.uid,signerName:bounded(candidate.name,120,true)};
      next.state = submitting ? 'submitted' : old.state;
      next.hasFiles = files.length>0;
      if(submitting) next.reason='';
    } else if(input.action==='accept') {
      if(old.state!=='submitted') deny();
      next.state='accepted';
    } else if(input.action==='return') {
      if(!['submitted','accepted'].includes(old.state)) deny();
      next.state='returned';
      next.reason=restricted?'確認用画像を撮り直し、再提出してください。':bounded(input.reason ?? '',240,true);
      if(restricted) {body={};next.hasFiles=false;}
    } else if(input.action==='exempt') {
      if(restricted || !['draft','returned'].includes(old.state) || (!doc.optional && key!=='license')) deny();
      next.state='exempt';body={};next.hasFiles=false;next.reason='';
    } else if(input.action==='require') {
      if(!doc.optional || !['draft','exempt'].includes(old.state)) deny();
      next.state='draft';next.required=true;
    } else {
      if(!restricted || !old.hasFiles || old.state!=='accepted' || input.confirm!==true) deny();
      next.state='purged';next.hasFiles=false;body={};
    }
    if(restricted) await port.audit(path,actor.uid,input.action+'-requested',next.revision,input.operation);
    await port.write(path,record,next,body);
    if(restricted) await port.audit(path,actor.uid,input.action+'-completed',next.revision,input.operation);
    return {revision:next.revision};
  };
}
