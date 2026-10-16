export const SCHEMA = 'kalmia.incident.v2';
export const SOURCE = 'https://nho.hosp.go.jp/files/000192341.pdf#page=20';
export const OPTIONS = {
  domains:['治療・処置','薬剤','検査','技工','機器・物品','予約・案内','会計','接遇','情報管理','職員のけが・曝露','その他','不明'],
  factors:['確認・照合','連絡・引き継ぎ','手順','知識・技術','配置・設備','業務量・人員','患者の状態','その他','不明'],
  actual:['影響なし・未然に防止','待ち時間・診療の遅れ','金銭上の影響','物品・設備の破損／使用停止','情報の誤送付・漏えい','職員のけが・曝露','その他','確認中'],
  potential:['患者への健康被害','職員のけが・曝露','診療の遅れ・中断','金銭上の損失','物品・設備の破損','情報の漏えい','その他','判断できない'],
  prevention:['確認・照合','他者の声かけ','患者からの指摘','機器の警告','手順・チェックリスト','被害拡大の防止','防げなかった','その他','不明'],
  response:['安全確保・中断','患者の状態確認','院長・担当者へ連絡','説明・謝罪','処置・対応','訂正・再手配','機器の使用停止','未対応','確認中','その他'],
  place:['診療室','受付','待合室','消毒・滅菌室','技工室','院外','その他','不明'],
  phase:['初診','再診','メンテナンス','診療準備','診療後','事務作業','その他','不明'],
};
export const IMPACT = {
  unknown:'確認中・判断できない', na:'患者に関係しない',
  '0':'患者に実施する前に気づいた', '1':'実施したが患者への影響はなかった',
  '2':'影響またはその可能性があるが、追加治療・処置は不要',
  '3a':'本来不要だった軽微な治療・処置が必要になった',
  '3b':'本来不要だった軽微とはいえない治療・処置が必要になった',
  '4':'生活に影響する重大な永続的障害の可能性がある',
  '5':'行った医療・管理が死因となったと確認されている',
};
const TEXT = ['reportNumber','reporterName','ghostwriter','occurredDate','occurredTime','place','work','phase','details','patientContext','materials','roles','timeline','supplement','handoff','sharing','impact'];
export function newReport(id=globalThis.crypto.randomUUID()) {
  return {schemaVersion:SCHEMA,reportId:id,revision:0,reporterId:'',reporterName:'',impact:'unknown',details:'',domains:[],factors:[],actual:[],potential:[],prevention:[],response:[]};
}
export function normalizeReport(value) {
  if(!value || value.schemaVersion!==SCHEMA) throw new Error('対応していない報告形式です');
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(value.reportId||'')) throw new Error('報告IDが不正です');
  const out={schemaVersion:SCHEMA,reportId:value.reportId,revision:Number.isSafeInteger(value.revision)&&value.revision>=0?value.revision:0};
  out.reporterId=String(value.reporterId||'');
  if(out.reporterId && !/^[A-Za-z0-9_-]{1,100}$/.test(out.reporterId))throw new Error('報告者IDが不正です');
  for(const key of TEXT)out[key]=String(value[key]||'').trim();
  if(!Object.hasOwn(IMPACT,out.impact))out.impact='unknown';
  for(const key of ['domains','factors','actual','potential','prevention','response']){
    const list=Array.isArray(value[key])?value[key]:[];
    if(list.some(v=>!OPTIONS[key].includes(v)))throw new Error('未対応の選択項目があります');
    out[key]=[...new Set(list)];
  }
  if(out.actual.includes('影響なし・未然に防止')&&out.actual.some(x=>!['影響なし・未然に防止','確認中'].includes(x)))throw new Error('「影響なし」と実際の影響を同時には選べません');
  if(out.occurredDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(out.occurredDate)||!Number.isFinite(Date.parse(out.occurredDate))||new Date(out.occurredDate).toISOString().slice(0,10)!==out.occurredDate))throw new Error('発生日の形式を確認してください');
  if(out.occurredTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(out.occurredTime))throw new Error('時刻の形式を確認してください');
  if(JSON.stringify(out).length>60000)throw new Error('報告が長すぎます。60,000文字以内に整理してください');
  return out;
}
export function validateSubmission(value){const r=normalizeReport(value);if(!r.reporterId||!r.reporterName||!r.details)throw new Error('報告者と「何が起きたか」を確認してください');return r;}
export function classification(r){
  if(r.impact==='na')return '患者尺度の対象外';
  if(['0','1','2','3a'].includes(r.impact))return 'ヒヤリ・ハット';
  if(['3b','4','5'].includes(r.impact))return '医療事故';
  return '判定保留';
}
export function monthKey(timestamp){return Number.isFinite(timestamp)&&timestamp>0?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(timestamp):'';}
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function reportText(value){const r=normalizeReport(value);const line=(label,v)=>`${label}：${Array.isArray(v)?v.join('、')||'未確認':v||'未確認'}`;return [
  'カルミアデンタルクリニック インシデント報告書',
  line('報告番号',r.reportNumber||r.reportId),line('報告者',r.reporterName),line('代筆者',r.ghostwriter),line('発生日時',[r.occurredDate,r.occurredTime].filter(Boolean).join(' ')),
  line('場所',r.place),line('作業',r.work),line('場面',r.phase),line('事象の分野',r.domains),line('何が起きたか',r.details),
  line('患者への実際の影響',IMPACT[r.impact]),line('分類候補',classification(r)+'（ポータルで要確認）'),line('業務・職員への実際の影響',r.actual),line('起こり得た被害',r.potential),
  line('背景・要因（未確定）',r.factors),line('防止につながった点',r.prevention),line('その場の対応',r.response),line('共有状況',r.sharing),
  line('患者の状況（個人特定情報を除く）',r.patientContext),line('器具・薬剤',r.materials),line('関係者の役割',r.roles),line('時系列',r.timeline),line('補足',r.supplement),line('申し送り',r.handoff),
  '患者影響分類：国立病院機構 2020年3月27日改訂・別添1。法的認定・外部報告要否の判定ではありません。',
  'このファイルの作成だけではポータルに提出されません。取り込み後に内容を確認して提出してください。'
].join('\n\n');}
export function toHTML(value){const r=normalizeReport(value);return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>インシデント報告書</title><style>body{font-family:system-ui,sans-serif;max-width:850px;margin:2rem auto;padding:1rem;color:#182f38}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}@media print{body{margin:0}pre{font-size:11pt}}</style><body><pre id="incident-visible">${escapeHtml(reportText(r))}</pre><script type="application/json" id="kalmia-incident-data">${JSON.stringify(r).replace(/</g,'\\u003c')}</script></body></html>`;}
export function parseHTML(html,Parser=globalThis.DOMParser){
  const doc=new Parser().parseFromString(html,'text/html');const node=doc.getElementById('kalmia-incident-data');if(!node)return null;
  const r=normalizeReport(JSON.parse(node.textContent));
  if(doc.getElementById('incident-visible')?.textContent.replace(/\r\n/g,'\n')!==reportText(r))throw new Error('表示内容と取り込みデータが一致しません。作成元で修正してください');
  // A file never grants ownership, administrative review or portal submission status.
  return r;
}
export function fromLegacy(old,id=globalThis.crypto.randomUUID()){
  const r=newReport(id);r.reporterName=old.reporterName||'';r.occurredDate=old.occurredDate||'';r.occurredTime=old.occurredTime||'';r.place=old.occurredPlace||'';r.work=old.workContent||'';r.details=old.details||'';r.handoff=old.handoff||'';
  r.supplement=[old.eventImpact&&`旧形式の影響欄（実際・潜在の区別は未確認）：${old.eventImpact}`,old.goodPoint&&`旧形式の防止理由：${old.goodPoint}`,old.causeHuman&&`旧形式の人・行動欄：${old.causeHuman}`,old.causeEnvironment&&`旧形式の環境・連携欄：${old.causeEnvironment}`].filter(Boolean).join('\n');return normalizeReport(r);
}
