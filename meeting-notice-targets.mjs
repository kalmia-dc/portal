// Keep this narrow: existing snapshots and access permissions must not change.
const nonPersonSlots = new Set(['kyosei','hanowa','test','reception-terminal']);
const verifiedRetiredIds = new Set(['shinoda']); // 労務台帳で退職済み。利用停止が同期されるまでは新規通知対象外。
export function buildNoticeTargets(members,{canUseStaff,directorId}){
 return Object.fromEntries(members
   .filter(({id,availability})=>id!==directorId && availability!=='stopped' && !nonPersonSlots.has(id) && !verifiedRetiredIds.has(id) && canUseStaff(id))
   .map(({id,label,name,role})=>[id,{name:label||name,role}]));
}
