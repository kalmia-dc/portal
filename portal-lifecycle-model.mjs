import {assertAdmin,checkUid} from './portal-members-model.mjs';
export const isLifecycleStopped=(record,now=Date.now())=>record?.state==='stopped'||(record?.hrManaged===true&&!((!record.currentCancelled&&record.startAt<=now&&now<record.endAt)||(record.previousStartAt<=now&&now<record.previousEndAt)));
export const lifecycleApplies=member=>['staff','trainingAdmin'].includes(member?.role);
export const effectiveMember=(member,lifecycle,now=Date.now())=>member && lifecycleApplies(member) && isLifecycleStopped(lifecycle,now)?{...member,active:false}:member;
export function linkedAccounts(users,staffId){return Object.entries(users||{}).filter(([,m])=>m?.staffId===staffId).map(([uid,m])=>({uid,...m}));}
export function lifecycleProtection(actor,staff,users){
  if(!staff?.id)return 'スタッフを選んでください。';
  const linked=linkedAccounts(users,staff.id);
  if(actor.staffId===staff.id||linked.some(m=>m.uid===actor.uid))return '自分自身のスタッフは停止できません。';
  if(linked.some(m=>!lifecycleApplies(m)))return '管理者・共用端末・用途不明のアカウントが紐付いています。この操作では変更できません。';
  return '';
}
export function lifecycleChange({actor,staff,users,current,expected,action,operationId,timestamp}){
  assertAdmin(actor);checkUid(staff?.id);checkUid(operationId);
  const protection=lifecycleProtection(actor,staff,users);if(protection)throw Error(protection);
  if(!['stop','restore'].includes(action))throw Error('操作を確認してください。');
  if(current?.operationId===operationId)return current;
  if((current?.revision||0)!==(expected?.revision||0))throw Error('状態が変更されました。一覧を更新して確認し直してください。');
  if(action==='stop'&&isLifecycleStopped(current)||action==='restore'&&!isLifecycleStopped(current))throw Error('状態が変更されています。一覧を更新してください。');
  return {state:action==='stop'?'stopped':'active',revision:(current?.revision||0)+1,operationId,updatedBy:actor.uid,updatedAt:timestamp};
}
export async function performLifecycleChange({actor,staff,expected,action,operationId,readFresh,transact,timestamp}){
  assertAdmin(actor);
  const {users,roster}=await readFresh();
  const fresh=roster.find(s=>s.id===staff.id);if(!fresh||fresh.name!==staff.name)throw Error('名簿が変わりました。一覧を更新してください。');
  let failure;const result=await transact(staff.id,current=>{try{return lifecycleChange({actor,staff:fresh,users,current,expected,action,operationId,timestamp});}catch(e){failure=e;return undefined;}});
  if(failure)throw failure;if(!result.committed)throw Error('保存されませんでした。再試行してください。');return result;
}
