export const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s\-ー()（）]/g,'');
export function assertMember(profile, lifecycle, now=Date.now()) {
  if(!profile?.active || !['admin','staff','trainingAdmin'].includes(profile.role) || !profile.staffId) throw Error('利用許可がありません。');
  if(['staff','trainingAdmin'].includes(profile.role) && (lifecycle?.state==='stopped'||(lifecycle?.hrManaged===true&&!((!lifecycle.currentCancelled&&lifecycle.startAt<=now&&now<lifecycle.endAt)||(lifecycle.previousStartAt<=now&&now<lifecycle.previousEndAt))))) throw Error('利用許可が停止されています。');
  return profile;
}
export function requireOwner(profile){if(profile.staffId!=='sugihira'||profile.role!=='admin')throw Error('院長のみ操作できます。');}
export function validateFields(input, headers){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('入力を確認してください。');
  const fields={};for(const key of headers){const v=input[key]??'';if(typeof v!=='string'||v.length>10000)throw Error('入力が長すぎます。');fields[key]=v;}
  if(!fields['氏名（姓）']&&!fields['氏名（名）']&&!fields['社名'])throw Error('氏名または会社名を入力してください。');
  return fields;
}
export function duplicates(fields,cards,except){const name=f=>normalize((f['氏名（姓）']||'')+(f['氏名（名）']||''));return Object.entries(cards||{}).filter(([id,c])=>id!==except&&!c.deletedAt&&!c.purgedAt&&((name(fields)&&name(fields)===name(c.fields)&&normalize(fields['社名'])===normalize(c.fields['社名']))||['電子メール(A)','TEL(A)','携帯(A)'].some(k=>normalize(fields[k])&&normalize(fields[k])===normalize(c.fields[k])))).map(([id,c])=>({id,fields:c.fields,revision:c.revision}));}
export function changeRecord(current,{action,fields,expectedRevision,operationId},actor,now){
  if(['trash','restore','purge'].includes(action))requireOwner(actor);
  if(action!=='save'&&!current)throw Error('名刺がありません。');
  if(current?.operationId===operationId)return current;
  if((current?.revision||0)!==expectedRevision)throw Error('別の人が更新しました。再読み込みして確認してください。');
  if(current?.purgedAt)throw Error('完全削除済みです。');
  if(action==='purge'&&!current?.deletedAt)throw Error('ごみ箱の名刺だけ完全削除できます。');
  if(action==='save'&&current?.deletedAt)throw Error('ごみ箱から復元してから編集してください。');
  if(!['save','trash','restore','purge'].includes(action))throw Error('操作を確認してください。');
  const revision=(current?.revision||0)+1;
  const audit={action,at:now,by:actor.uid,name:actor.name,changes:action==='save'?Object.fromEntries(Object.entries(fields).filter(([k,v])=>v!==(current?.fields?.[k]||'')).map(([k,v])=>[k,{before:current?.fields?.[k]||'',after:v}])):{}};
  if(action==='purge')return {revision,operationId,purgedAt:now,updatedBy:actor.uid,history:{[revision]:audit}};
  return {...current,fields:action==='save'?fields:current.fields,revision,operationId,createdAt:current?.createdAt||now,updatedAt:now,updatedBy:actor.uid,deletedAt:action==='trash'?now:action==='restore'?null:current?.deletedAt||null,history:{...current?.history,[revision]:audit}};
}
