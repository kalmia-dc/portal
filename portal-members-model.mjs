// Pure decisions shared by the UI and offline tests. Database rules remain authoritative.
export function assertAdmin(profile) {
  if (!profile?.uid || profile.portalRole !== 'admin') throw new Error('管理者専用です。');
}
export function checkUid(uid) {
  if (typeof uid !== 'string' || !uid || /[.#$\[\]/\u0000-\u001f\u007f]/.test(uid)) throw new Error('アカウントIDが不正です。');
}
export function memberChange({ actor, uid, current, expected, action, request, staff, timestamp }) {
  assertAdmin(actor);
  checkUid(uid);
  if (uid === actor.uid || current?.role === 'admin' || current?.role === 'terminal') throw new Error('管理者・端末・自分自身のアカウントはこの画面で変更できません。');
  // Compare the entire confirmed record: concurrent changes must be reviewed again.
  const stable = value => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,stable(value[key])])) : value;
  const canonical = value => JSON.stringify(stable(value));
  if (canonical(current) !== canonical(expected)) throw new Error('別の操作で情報が変更されました。再読み込みして確認してください。');
  if (action === 'register') {
    if (current) throw new Error('登録済みです。');
    if (request?.uid !== uid || !request.email) throw new Error('本人のログイン申請を確認できません。');
    if (!staff?.id || !staff.name || !['DR','DH','DA'].includes(staff.role)) throw new Error('スタッフを選択してください。');
    return { staffId:staff.id, name:staff.name, staffRole:staff.role, role:'staff', active:true,
      email:request.email, updatedBy:actor.uid, updatedAt:timestamp };
  }
  if (!current) throw new Error('対象の登録がありません。');
  if (!['revoke','restore'].includes(action)) throw new Error('操作が不正です。');
  const active = action === 'restore';
  if (current.active === active) throw new Error(active ? 'すでに許可されています。' : 'すでに解除されています。');
  return { ...current, active, updatedBy:actor.uid, updatedAt:timestamp };
}

export async function performMemberChange({ actor, uid, expected, action, staff, confirm, readRequest, transact, timestamp }) {
  assertAdmin(actor);
  checkUid(uid);
  if (!await confirm()) return { cancelled:true };
  // Never treat failed reads as empty data or a successful write.
  const request = action === 'register' ? await readRequest(uid) : null;
  let conflict;
  const result = await transact(uid, current => {
    try {
      return memberChange({actor,uid,current,expected,action,request,staff,timestamp});
    } catch(error) {
      // Firebase can rerun this callback asynchronously; throwing inside it can
      // strand the transaction. Returning undefined is the documented abort.
      conflict=error;
      return undefined;
    }
  });
  if (conflict) throw conflict;
  if (!result.committed) throw new Error('保存されませんでした。再読み込みして確認してください。');
  return { cancelled:false };
}
