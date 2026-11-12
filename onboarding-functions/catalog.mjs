import {approvedDocuments} from './approved-documents.mjs';

export const VERSION = '2026-11-12.2';
export const ROLES = {DR:'歯科医師', DH:'歯科衛生士', DA:'歯科助手'};

export const documents = {
  identity: {label:'身元確認書', file:true, help:'確認者本人が紙に記入・署名し、書類全体を撮影してください。'},
  pledge: {label:'採用時誓約書', approved:approvedDocuments.pledge},
  secrecy: {label:'機密保持誓約書', approved:approvedDocuments.secrecy},
  service: {label:'服務規程チェック表', approved:approvedDocuments.service},
  loan: {label:'貸付金に関する確認同意書', consent:[
    '医院の貸付制度について、制服・名札の購入費、使用器材等の購入費、自己研鑽費用が貸付の対象になり得ることを確認します。',
    '個別の貸付を受ける場合は、貸付前に金額・返済方法・免除条件を記載した借用書を確認し、同意します。',
    '制服・名札は購入日から2年、使用器材等は購入日から2年、自己研鑽費用は受講日から2年を経過した時点で在籍している場合に、定められた条件に従い返済を免除します。使用器材等は税抜1万円以上が対象です。',
  ]},
  commute: {label:'通勤手当・通勤経路届', fields:[
    ['method','交通手段',true],['route','経路（乗降駅・停留所・経由地）',true],['oneWay','片道運賃（円）'],['roundTrip','往復運賃（円）'],['monthly','1か月定期代（円）'],['distance','片道距離（km）'],['duration','所要時間（分）'],
  ], help:'定期券を購入した場合は写しを提出してください。自動車・バイクの場合は運転免許証と任意保険の確認書類を提出してください。'},
  pass: {label:'定期券の写し', file:true, optional:true},
  drivingLicense: {label:'運転免許証の写し（自動車・バイク通勤）', file:true, optional:true},
  drivingInsurance: {label:'任意保険の確認書類（自動車・バイク通勤）', file:true, optional:true},
  bank: {label:'給与口座振込依頼書', file:true, fields:[
    ['bank','金融機関名',true],['branch','支店名',true],['accountType','預金種別',true],['account','口座番号',true],['holder','口座名義（カナ）',true],['payMonth','振込開始月',true],
  ], consent:['入力した口座への給与振込を依頼します。'],help:'金融機関・支店・口座番号・名義が分かる通帳や口座証明を添付してください。'},
  pension: {label:'基礎年金番号が分かる書類', file:true},
  employment: {label:'雇用保険被保険者証', file:true, optional:true, help:'交付を受けている場合に提出してください。'},
  withholding: {label:'当年分の源泉徴収票', file:true, optional:true, help:'入職前に所得がある場合に提出してください。'},
  license: {label:'職種の免許証', file:true, roles:['DR','DH'], help:'面接時に未提出の場合に提出してください。'},
  insuranceRegistration: {label:'保険医登録票の写し', file:true, roles:['DR'], optional:true, help:'労務担当から案内があった場合に提出してください。'},
  myNumber: {label:'マイナンバーの確認画像', file:true, restricted:true, help:'社会保障・税の手続きのために使用します。カードを使用する場合は表面と裏面をそれぞれ撮影してください。別の確認書類を使う場合は労務担当にご相談ください。'},
};

export function roleDocuments(role) {
  return Object.entries(documents).filter(([, doc]) => !doc.roles || doc.roles.includes(role));
}

export function consentBlocks(doc) {
  return doc.approved || (doc.consent || []).map(text=>['check',text]);
}

export function requiredChecks(doc, blocks) {
  if(!blocks.length) return 0;
  return doc.approved && !blocks.some(([kind])=>kind==='check') ? 1 : blocks.filter(([kind])=>kind==='check').length;
}
