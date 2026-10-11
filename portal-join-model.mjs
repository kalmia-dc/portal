import {assertAdmin,checkUid} from './portal-members-model.mjs';
import {staffNameKey,rosterDraft} from './portal-roster-model.mjs';

export const joinNameKey=name=>[...new TextEncoder().encode(staffNameKey(name))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function assertApplicant(user) {
  if(!user?.uid || !user.email || user.emailVerified!==true || !user.providerData?.some(p=>p.providerId==='google.com')) throw Error('確認済みのGoogleアカウントでログインしてください。');
  checkUid(user.uid);
}
export function applicationChange({user,current,name,jobRole,timestamp}) {
  assertApplicant(user);
  const draft=rosterDraft({id:user.uid,name,role:jobRole,type:'full'});
  if(current?.state==='approved') throw Error('承認済みです。変更は管理者へ連絡してください。');
  if(current && (current.uid!==user.uid || current.email!==user.email)) throw Error('申請アカウントが一致しません。管理者へ連絡してください。');
  if(current?.name===draft.name && current?.jobRole===jobRole) return current;
  return {uid:user.uid,email:user.email,name:draft.name,jobRole,revision:(current?.revision||0)+1,submittedAt:timestamp,state:'pending'};
}
const sameRequest=(a,b)=>a?.uid===b?.uid && a?.email===b?.email && a?.name===b?.name && a?.jobRole===b?.jobRole && a?.revision===b?.revision && a?.submittedAt===b?.submittedAt;
export function approvalUpdates({actor,expected,current,selection,roster,member,timestamp}) {
  assertAdmin(actor);checkUid(expected.uid);
  if(actor.uid===expected.uid) throw Error('自分自身の申請は承認できません。');
  if(!sameRequest(expected,current)) throw Error('申請内容が更新されました。一覧を再読み込みして確認してください。');
  if(current.state==='approved') {
    if(member?.staffId===current.approval?.staffId && member?.email===current.email) return null;
    throw Error('承認済みの登録内容を確認できません。管理者へ連絡してください。');
  }
  if(current.state!=='pending' || member) throw Error('登録済み、または申請状態が変わっています。一覧を再読み込みしてください。');
  let staff, nameKey='';
  if(selection.mode==='existing') {
    staff=roster.find(s=>s.id===selection.staffId);
    if(!staff || staff.name!==selection.name || staff.role!==selection.role) throw Error('既存名簿が変更されています。選び直してください。');
  } else if(selection.mode==='new') {
    staff=rosterDraft({...selection,id:selection.staffId});nameKey=joinNameKey(staff.name);
    if(roster.some(s=>s.id===staff.id || staffNameKey(s.name)===staffNameKey(staff.name))) throw Error('同名のスタッフが登録済みです。再読み込みして「既存の名簿と紐付け」を選んでください。');
  } else throw Error('登録方法を選択してください。');
  const approval={mode:selection.mode,staffId:staff.id,name:staff.name,role:staff.role,type:selection.mode==='new'?staff.type:'unchanged',nameKey,by:actor.uid,at:timestamp};
  const updates={
    [`portalJoinRequests/${expected.uid}`]:{...current,state:'approved',approval},
    [`portalAccess/users/${expected.uid}`]:{staffId:staff.id,name:staff.name,staffRole:staff.role,role:'staff',active:true,email:current.email,updatedBy:actor.uid,updatedAt:timestamp},
  };
  if(selection.mode==='new') {
    updates[`extra_staff/${staff.id}`]=staff;
    updates[`portalJoinNames/${nameKey}`]={staffId:staff.id,uid:expected.uid};
  }
  return updates;
}
export async function approveApplication({actor,expected,selection,readFresh,commit,timestamp}) {
  assertAdmin(actor);
  const fresh=await readFresh(expected.uid);
  const updates=approvalUpdates({actor,expected,selection,...fresh,timestamp});
  if(updates===null) return {alreadyApproved:true,approval:fresh.current.approval};
  await commit(updates);
  return {alreadyApproved:false};
}
