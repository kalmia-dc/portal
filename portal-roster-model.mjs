import { assertAdmin, checkUid } from './portal-members-model.mjs';

export const staffNameKey = name => String(name || '').normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
export function rosterDraft(input) {
  checkUid(input.id);
  const name = String(input.name || '').trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 60) throw new Error('名前を60文字以内で入力してください。');
  if (!['DR','DH','DA'].includes(input.role)) throw new Error('役職を選択してください。');
  if (!['full','part','spot'].includes(input.type)) throw new Error('雇用形態を選択してください。');
  return {id:input.id,name,role:input.role,type:input.type,
    ...(input.satFixed ? {satFixed:true} : {}), ...(input.uketsuke ? {uketsuke:true} : {})};
}
export function addRosterEntry({actor,current,defaults,draft}) {
  assertAdmin(actor);
  const staff=rosterDraft(draft), entries=current || {};
  const saved=entries[staff.id];
  if(saved) {
    if(JSON.stringify(rosterDraft(saved))===JSON.stringify(staff)) return entries;
    throw new Error('同じ登録IDの情報が変更されています。一覧を確認してください。');
  }
  const duplicate=[...defaults,...Object.values(entries)].find(s=>staffNameKey(s.name)===staffNameKey(staff.name));
  if(duplicate) throw new Error(`「${duplicate.name}」は名簿に登録済みです。既存スタッフを選んでください。同姓の別人はフルネームなどで区別してください。`);
  // Google authentication does not require legacy numeric passwords.
  // Preserve every existing record and use the established extra_staff schema.
  return {...entries,[staff.id]:staff};
}
export async function performRosterAdd({actor,draft,defaults,confirm,transact}) {
  assertAdmin(actor);
  const staff=rosterDraft(draft);
  if(!await confirm(staff)) return {cancelled:true};
  let failure;
  const result=await transact(current=>{
    failure=undefined;
    try{return addRosterEntry({actor,current,defaults,draft:staff});}
    catch(error){failure=error;return undefined;}
  });
  if(failure) throw failure;
  if(!result.committed) throw new Error('名簿に保存されませんでした。入力を残したまま再試行できます。');
  return {cancelled:false,staff};
}
