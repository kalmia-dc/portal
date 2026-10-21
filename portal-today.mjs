import {taskAssignedForDisplay} from './portal-person-display.mjs?v=20261019-director';
export const noticeTargets=['shimanaka','tsuruta','yoshida','takagi','matsumoto','yamada','tamiya','tanaka','momo'];
export function localDay(date=new Date()) {return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}

// Calendar dates only: time-bearing or malformed values remain unknown.
export function validScheduleDay(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function scheduleDecision(event,today=localDay()) {
  const raw=event.decided;
  const values=Array.isArray(raw)?raw:(raw?[raw]:[]);
  const dates=values.filter(validScheduleDay).sort();
  const unknown=values.some(value=>!validScheduleDay(value));
  return {decided:values.length>0,dates,unknown,ended:values.length>0&&!unknown&&dates.every(day=>day<today)};
}
export function decidedScheduleEntries(events,sid,today=localDay()) {
  return Object.entries(events||{}).filter(([,event])=>{
    if(!event||typeof event!=='object')return false;
    if(event.members&&(!Array.isArray(event.members)||!event.members.includes(sid)))return false;
    const state=scheduleDecision(event,today);
    return state.decided&&!state.ended;
  }).sort((a,b)=>{
    const next=event=>scheduleDecision(event,today).dates.find(day=>day>=today)||'9999-99-99';
    return next(a[1]).localeCompare(next(b[1]));
  });
}

export function todayItems(source,profile,today=localDay()) {
  if(!profile?.staffId||profile.staffId==='guest'||profile.portalRole==='terminal') return [];
  const sid=profile.staffId, items=[];
  const add=(kind,id,title,date,url)=>items.push({kind,id,title,date:date||'',url,group:date&&date<today?'期限切れ':date===today?'今日':'確認待ち'});
  const entries=x=>Object.entries(x||{}).filter(([,v])=>v&&typeof v==='object');
  for(const [id,t] of entries(source.tasks)) {
    if(t.status==='完了'||!taskAssignedForDisplay(t,profile))continue;
    if(t.date&&t.date>today)continue;
    add('タスク',id,t.title,t.date,`task-manager.html?task=${encodeURIComponent(id)}`);
  }
  for(const [id,e] of entries(source.schedule)) {
    if(scheduleDecision(e,today).decided||(e.members&&(!Array.isArray(e.members)||!e.members.includes(sid))))continue;
    if(!Array.isArray(e.dates)||!e.dates.length)continue;
    if(validScheduleDay(e.deadline)&&e.deadline<today)continue;
    add('日程回答',id,e.name,validScheduleDay(e.deadline)?e.deadline:'',`schedule.html?evid=${encodeURIComponent(id)}`);
    items[items.length-1].responseStatus=e.dates.every(d=>e.responses?.[sid]?.[d])?'回答済み':'未回答';
  }
  for(const kind of ['meetingTasks','meetingNotices'])for(const [id,t] of entries(source[kind])) {
    const review=kind==='meetingTasks'&&sid==='sugihira'&&t.status==='review';
    const unread=noticeTargets.includes(sid)&&!t.readBy?.[sid]&&(kind!=='meetingTasks'||t.status!=='confirmed');
    if(review||unread)add(review?'院長確認':'ミーティング未確認',id,t.title,'',`meeting-management.html?caseKind=${kind==='meetingTasks'?'tasks':'notices'}&caseId=${encodeURIComponent(id)}`);
  }
  if(profile.portalRole==='admin')for(const kind of ['corrections','requests'])for(const [id,r] of entries(source[kind])) {
    // Paid leave is normally handled by Momo; other admins retain proxy approval access.
    if(kind==='requests'&&sid!=='momo')continue;
    if(r.status!=='pending'||r.cancelled||(kind==='requests'&&r.type!=='paid'))continue;
    add('勤怠承認',id,kind==='corrections'?'打刻修正の承認':'有給申請の承認','',`attendance.html?tab=admin&kind=${kind==='corrections'?'correction':'paid'}&item=${encodeURIComponent(id)}`);
  }
  const rank={'期限切れ':0,'今日':1,'確認待ち':2};
  return items.sort((a,b)=>rank[a.group]-rank[b.group]||a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind));
}
