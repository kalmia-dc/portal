import {validateRenewal} from './onboarding-functions/contract-renewal-terms.mjs';

export function renewalUpdate(employee, signed, today) {
  const id=signed.id;
  if(typeof id!=='string'||!/^[-_A-Za-z0-9]{1,120}$/.test(id)||
    !signed.consent || signed.consent.sha256!==signed.contract?.sha256 ||
    signed.consent.version!==signed.contract?.version || signed.state!=='submitted'){
    throw Error('本人が署名した契約書を確認してください。');
  }
  const renewal=validateRenewal(signed.renewal);
  const key='contract-renewal-applied-'+id;
  if(employee.tasks?.[key]?.reference===id)return null;
  if(renewal.start>today)throw Error('更新開始日以降に職員情報へ反映できます。');
  const data=structuredClone(employee);
  data.tasks??={};
  const reviewKey='contract-renewal-review';
  const known=Object.entries(data.tasks).filter(([key])=>key.startsWith('contract-renewal-applied-'));
  if(known.some(([,entry])=>entry.due>=renewal.start))throw Error('この開始日以降の契約は反映済みです。更新履歴を確認してください。');
  const period=data.periods?.[data.currentPeriod]||data.plannedPeriod;
  if(!period?.startDate || signed.employmentStart!==period.startDate || renewal.start<period.startDate || (period.endDate&&renewal.start>period.endDate))throw Error('更新開始日と在籍期間を確認してください。');
  const values={contractEnd:renewal.end,days:renewal.days,hours:renewal.hours};
  Object.assign(period,values);
  if(data.currentPeriod) data.plannedPeriod={...data.plannedPeriod,startDate:period.startDate,endDate:period.endDate||'',...values};
  data.type=renewal.type;
  if(data.tasks[reviewKey]?.due<renewal.start)delete data.tasks[reviewKey];
  data.tasks[key]={title:'契約更新反映済み',status:'完了',due:renewal.start,reference:id};
  return data;
}
