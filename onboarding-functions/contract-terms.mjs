export const termFields = [
 ['employer','使用者・代表者・所在地',600],['employee','労働者氏名・住所',400],
 ['period','契約期間・更新基準・更新上限',1200],['probation','試用期間・期間中の条件',600],
 ['work','就業場所・業務内容・変更の範囲',1200],['schedule','勤務日・勤務時間・休憩・変更の取扱い',1600],
 ['holidays','休日・休暇',1200],['overtime','時間外労働・割増賃金',1200],
 ['salary','賃金・歩合・手当',2200],['payment','締日・支払日・支払方法・交通費',800],
 ['raises','昇給・賞与・退職金',1600],['insurance','加入保険',800],
 ['termination','退職・定年・解雇・契約終了',1600],['consultation','相談窓口・就業規則・その他',1200],
 ['notes','個別の特約（任意）',1600],
];
export function validateTerms(value) {
 if(!value || typeof value!=='object') throw Error('契約条件を入力してください。');
 return Object.fromEntries(termFields.map(([key,label,max])=>{
  const text=value[key];
  if(typeof text!=='string' || text.length>max || (key!=='notes'&&!text.trim())) throw Error(label+'を確認してください。');
  return [key,text.trim()];
 }));
}
export function initialTerms(name='') {
 return Object.fromEntries(termFields.map(([key])=>[key,({
  employer:'カルミアデンタルクリニック墨田 おとなこども歯科・矯正歯科\n院長 杉平亮介\n東京都墨田区墨田2-36-11 パシオス棟201',
  employee:name,
  work:'就業場所：東京都墨田区墨田2-36-11 パシオス棟201（変更の範囲：変更なし）。\n業務内容：',
  payment:'毎月末日締め、翌月25日払い。本人の同意に基づき本人名義の指定口座へ振り込む。法令に定めるものを控除する。通勤費は実費支給。',
  consultation:'労働条件・雇用管理・ハラスメント等の相談窓口は院長 杉平亮介（院内で直接申出）。通常の労働者との待遇の相違の内容・理由等について説明を求めることができる。\n本書に定めのない事項は法令および適用される就業規則による。適用される就業規則は職員ポータルに掲載し、随時閲覧できるようにする。',
 })[key]||'']));
}

export function presetText(preset,row) {
 const yen=n=>Number(n).toLocaleString('ja-JP');
 let salary;
 if(preset.kind==='hourlyCommission') salary=`最低保証時給${yen(row.hourly)}円 × 月間の実労働時間数。\n保険診療：担当した月間レセプト請求点数 × 10円 × ${preset.insuranceRate}％。\n自費診療：担当した月間自費売上（税込・材料費等の控除なし）× ${preset.privateRate}％。\n月間最低保証給と月間歩合給合計を比較し、高い方を支給する。両者の重複支給はしない。通勤手当、割増賃金、年次有給休暇の賃金等は比較額と別に支給する。`;
 else {
  const parts=row.parts.map(([label,amount])=>`${label}：${yen(amount)}円`);
  const total=row.parts.reduce((sum,[,n])=>sum+n,0);
  salary=`月160時間を基準とする月額。\n${parts.join('、')}。\n${preset.kind==='monthlyCommission'?'最低保証月額':'月給合計'}：${yen(total)}円。`;
  if(preset.kind==='monthlyCommission') salary+=`\n最低保証と月間歩合給（保険診療${preset.insuranceRate}％＋自費診療${preset.privateRate}％）を比較し、高い方を支給する。両者の重複支給はしない。歩合給に最低保証の上限を適用しない。\n歩合の算定対象・売上の取扱い：個別条件を入力してください。`;
 }
 return {salary,raises:row.raises||preset.raises||''};
}
