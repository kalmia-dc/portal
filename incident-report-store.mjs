import {normalizeReport,validateSubmission} from './incident-report-core.mjs?v=semantic-title-20261019';
export const BASE='meetingManagement/incidentV2';
export function decodeRecord(record){return {...normalizeReport(JSON.parse(record.payload)),reporterId:record.owner,revision:record.revision};}
export function publicRecord(record){const {reason,legacy,linkedOriginals,...visible}=record;return visible;}
export function createIncidentStore({db,api,user,manager=false,isActive=()=>true}){
  const {ref,get,update,set,remove,onValue,serverTimestamp}=api;
  const read=async path=>(await get(ref(db,path))).val();
  const paths={feed:`${BASE}/feed`,records:`${BASE}/records`,history:`${BASE}/history`,owners:`${BASE}/owners`,drafts:`${BASE}/drafts`};
  const watch=(path,fn,error)=>onValue(ref(db,path),s=>fn(s.val()||{}),error);
  async function saveDraft(value,expected=0,imported=false){
    if(!isActive())throw new Error('ログイン状態が変わったため保存を中止しました');
    const r=normalizeReport(value),owner=r.reporterId||user.staffId;
    if(owner!==user.staffId&&!manager)throw new Error('代理下書きは院長・主任のみ作成できます');
    const old=expected?await read(`${paths.drafts}/${owner}/${r.reportId}`):null;
    const item={owner,payload:JSON.stringify(r),revision:expected+1,updatedAt:serverTimestamp(),actor:user.staffId,importedBy:old?old.importedBy:(imported?user.staffId:''),importedAt:old?old.importedAt:(imported?serverTimestamp():0)};
    if(!isActive())throw new Error('ログイン状態が変わったため保存を中止しました');
    await set(ref(db,`${paths.drafts}/${owner}/${r.reportId}`),item);return item;
  }
  async function commit(value,{previous=null,action='edit',reason='',confirmed=false,legacy=null,imported=false,linkedTaskId,linkedNoticeId,linkedOriginals,counterStatus,countermeasure,extraUpdates={}}={}){
    if(!isActive())throw new Error('ログイン状態が変わったため保存を中止しました');
    const r=validateSubmission(value),id=r.reportId;
    if(manager&&r.reporterId==='sugihira'&&r.impact!=='unknown'&&['submit','import','edit','migrate'].includes(action))confirmed=true;
    if(previous&&previous.revision!==r.revision)throw new Error('他の更新があります。最新内容と差分を確認してください');
    if(previous&&previous.owner!==r.reporterId&&!reason.trim())throw new Error('報告者の訂正理由を入力してください');
    if(['withdraw','restore'].includes(action)&&(!manager||!reason.trim()))throw new Error('院長・主任が理由を入力してください');
    const revision=(previous?.revision||0)+1;r.revision=revision;
    const changed=previous?JSON.stringify({...JSON.parse(previous.payload),revision:0})!==JSON.stringify({...r,revision:0}):true;
    const stamp=serverTimestamp();
    const draftOrigin=!previous&&r.reporterId===user.staffId?await read(`${paths.drafts}/${r.reporterId}/${id}`):null;
    const record={owner:r.reporterId,payload:JSON.stringify({...r,revision:0}),revision,state:action==='withdraw'?'withdrawn':action==='restore'?'submitted':previous?.state||'submitted',submittedAt:previous ? previous.submittedAt : legacy ? Number(legacy.createdAt||legacy.importedAt||0) : stamp,updatedAt:stamp,actor:user.staffId,action,reason,
      review:confirmed&&manager&&r.impact!=='unknown'?'confirmed':(!changed&&action!=='restore'?previous?.review||'pending':'pending'),
      reviewer:confirmed&&manager&&r.impact!=='unknown'?user.staffId:(!changed&&action!=='restore'?previous?.reviewer||'':''),
      reviewedAt:confirmed&&manager&&r.impact!=='unknown'?stamp:(!changed&&action!=='restore'?previous?.reviewedAt||0:0),
      importedBy:previous?previous.importedBy:draftOrigin?.importedBy||(imported?user.staffId:''),importedAt:previous?previous.importedAt:draftOrigin?.importedAt||(imported?stamp:0),
      legacy:previous?.legacy|| (legacy?JSON.stringify(legacy):''),legacyKey:previous?.legacyKey||legacy?.id||'',
      linkedTaskId:linkedTaskId??previous?.linkedTaskId??legacy?.linkedTaskId??'',linkedNoticeId:linkedNoticeId??previous?.linkedNoticeId??legacy?.linkedNoticeId??'',
      basis:previous?.basis||(legacy?'legacy':'nho2020'),legacyType:previous?.legacyType||legacy?.type||'',legacyLevel:previous?.legacyLevel||legacy?.level||'',linkedOriginals:linkedOriginals??previous?.linkedOriginals??'',counterStatus:counterStatus??previous?.counterStatus??legacy?.counterStatus??'pending',countermeasure:countermeasure??previous?.countermeasure??legacy?.countermeasure??'',
    };
    if(previous?.owner!==undefined&&previous.owner!==record.owner&&!manager)throw new Error('報告者の変更は院長・主任のみです');
    const updates={...extraUpdates,[`${paths.records}/${id}`]:record,[`${paths.history}/${id}/r${revision}`]:record,[`${paths.feed}/${id}`]:record.state==='submitted'?publicRecord(record):null,[`${paths.owners}/${record.owner}/${id}`]:true};
    if(previous?.owner&&previous.owner!==record.owner)updates[`${paths.owners}/${previous.owner}/${id}`]=null;
    if(legacy)updates[`meetingManagement/incidentReports/${legacy.id}`]=null;
    if(r.title&&record.state==='submitted')updates[`meetingManagement/incidentTitles/v2/${id}`]={text:r.title,actor:user.staffId,updatedAt:stamp};
    // Private drafts are never read or deleted by a proxy after creation.
    if(record.owner===user.staffId)updates[`${paths.drafts}/${record.owner}/${id}`]=null;
    if(!isActive())throw new Error('ログイン状態が変わったため保存を中止しました');
    await update(ref(db),updates);return record;
  }
  return {paths,read,watch,saveDraft,commit,
    async saveTitle(kind,id,text){if(!isActive()||!manager)throw new Error('タイトルの編集は院長・主任のみです');if(!['legacy','v2'].includes(kind)||!id||/[.#$\[\]/]/.test(id))throw new Error('報告IDが不正です');const title=String(text).trim();if(!title||title.length>100)throw new Error('タイトルを1〜100文字で入力してください');await set(ref(db,`meetingManagement/incidentTitles/${kind}/${id}`),{text:title,actor:user.staffId,updatedAt:serverTimestamp()});},
    deleteDraft:id=>remove(ref(db,`${paths.drafts}/${user.staffId}/${id}`)),
    history:id=>read(`${paths.history}/${id}`),record:id=>read(`${paths.records}/${id}`),
  };
}
