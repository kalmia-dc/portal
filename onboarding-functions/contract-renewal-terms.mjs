export function validateRenewal(value) {
  function date(key, required) {
    const valueDate=value?.[key];
    if(valueDate==='' && !required) return '';
    if(typeof valueDate!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(valueDate)) throw Error('契約期間を確認してください。');
    const parsed=new Date(valueDate);
    if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==valueDate) throw Error('契約期間を確認してください。');
    return valueDate;
  }
  const start=date('start',true),end=date('end',false);
  const {type,days,hours}=value;
  if(end && end<start) throw Error('契約終了日は更新開始日以降にしてください。');
  if(!['full','part','spot'].includes(type) || [days,hours].some(v=>typeof v!=='string'||!v.trim()||v.length>200||/[\r\n]/.test(v))) {
    throw Error('雇用形態・所定勤務日・所定勤務時間を入力してください。');
  }
  return {start,end,type,days:days.trim(),hours:hours.trim()};
}

export function renewalTerms(terms, renewal) {
  const {start,end,type,days,hours}=validateRenewal(renewal);
  const label={full:'常勤',part:'非常勤',spot:'スポット'}[type];
  return {...terms,period:`更新開始日：${start}／契約終了日：${end||'期間の定めなし'}\n${terms.period}`,
    schedule:`雇用形態：${label}\n所定勤務日：${days}\n所定勤務時間：${hours}\n${terms.schedule}`};
}
