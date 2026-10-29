// Invoice documents are stored only in the directory chosen by the administrator.
export const ISSUER = Object.freeze({name:'カルミアデンタルクリニック',owner:'杉平 亮介',registration:'T7810234812699',address:'〒131-0031 東京都墨田区墨田2-36-11 パシオス棟201',telephone:'03-5631-3555'});
export const CONTENTS = Object.freeze(['自費歯科診療費','歯科健診費']);
export function todayJST(now=new Date()) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');
  return Number(value.slice(0,4))>=1900&&Number(value.slice(0,4))<=9999&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function taxAmount(amount) {
  if(!Number.isSafeInteger(amount)||amount<=0||amount>999999999)throw Error('税込金額は1〜999,999,999円の整数で入力してください。');
  return Number(BigInt(amount)*10n/110n);
}
export function validateRecord(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('補足書データの形式が正しくありません。');
  const record={receiptNumber:raw.receiptNumber,transactionDate:raw.transactionDate,issueDate:raw.issueDate,recipient:raw.recipient,content:raw.content,amount:raw.amount,version:raw.version};
  if(typeof record.receiptNumber!=='string'||!/[A-Za-z0-9]/.test(record.receiptNumber)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(record.receiptNumber))throw Error('領収書番号は半角英数字・ハイフン・アンダースコアで32文字以内にしてください。');
  if(!validDate(record.transactionDate))throw Error('取引年月日を正しく入力してください。');
  if(!validDate(record.issueDate))throw Error('補足書発行日を正しく入力してください。');
  if(typeof record.recipient!=='string'||!record.recipient.trim()||record.recipient.length>100||/[\u0000-\u001f\u007f]/.test(record.recipient))throw Error('交付先事業者名は100文字以内で入力してください。');
  record.recipient=record.recipient.trim();
  if(!CONTENTS.includes(record.content))throw Error('取引内容を選択してください。');
  taxAmount(record.amount);
  if(!Number.isSafeInteger(record.version)||record.version<1||record.version>9999)throw Error('版番号が正しくありません。');
  return record;
}
export const versionText=version=>'v'+String(version).padStart(2,'0');
export function basename(record) {
  const r=validateRecord(record);return `${r.receiptNumber}_${r.issueDate.replaceAll('-','')}_${versionText(r.version)}`;
}
export function encodeRecord(record) {
  const r=validateRecord(record);
  return JSON.stringify({schemaVersion:1,documentType:'kalmia-invoice-supplement',...r,taxRate:10,taxAmount:taxAmount(r.amount),issuer:ISSUER},null,2)+'\n';
}
export function decodeRecord(text) {
  if(typeof text!=='string'||text.length>65536)throw Error('JSONファイルが大きすぎます。');
  let raw;try{raw=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('JSONを読み取れません。元のファイルを確認してください。');}
  if(raw?.schemaVersion!==1||raw?.documentType!=='kalmia-invoice-supplement')throw Error('このシステムで保存した補足書JSONを選択してください。');
  if(raw.taxRate!==10)throw Error('税率10％の補足書JSONを選択してください。');
  return validateRecord(raw);
}
export function assertMatchesSavedJSON(record,text){
  if(encodeRecord(decodeRecord(text))!==encodeRecord(record))throw Error('保存済みJSONと現在の入力内容が異なります。訂正する場合は「修正版作成」で新しい版にしてください。');
}
export function existingVersions(names,receiptNumber) {
  const escaped=receiptNumber.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('^'+escaped+'_\\d{8}_v(\\d{2,4})\\.(?:json|pdf)$','i');
  return names.map(name=>pattern.exec(name)).filter(Boolean).map(match=>Number(match[1])).filter(v=>v>=1&&v<=9999);
}
export function nextVersion(names,record) {
  const next=Math.max(record.version,...existingVersions(names,record.receiptNumber),0)+1;
  if(next>9999)throw Error('版番号の上限に達しています。');return next;
}
export function assertNoCollision(names,record,{ownJSON=false}={}) {
  const base=basename(record).toLowerCase();
  const ownName=base+'.json';
  const others=names.filter(n=>!(ownJSON&&n.toLowerCase()===ownName));
  if(existingVersions(others,record.receiptNumber).some(v=>v>=record.version))throw Error('同じ領収書番号に、この版以上のファイルが既にあります。「修正版作成」で新しい版にしてください。再交付は保存済みPDFを使用してください。');
}
