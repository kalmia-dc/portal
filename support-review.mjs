import {speakerInfo} from './support-model.mjs?v=20261021-director';
export const isReview = (me,mode) => me?.role==='admin' && mode!=='personal';
export const canMark = (me,thread,mode) => !!me?.uid && thread?.ownerUid===me.uid && !isReview(me,mode);
export function activityText(thread){
 const messages=(thread.events||[]).filter(e=>e.type==='message').sort((a,b)=>a.seq-b.seq);
 const last=messages.at(-1);
 if(!last)return '投稿なし';
 const time=Number.isFinite(last.at)?new Date(last.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'時刻未確定';
 return `投稿 ${messages.length}件 ／ 版 ${thread.revision} ／ 最終投稿 ${time} JST ／ ${speakerInfo(last).label}`;
}
