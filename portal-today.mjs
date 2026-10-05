export const noticeTargets=['shimanaka','tsuruta','yoshida','takagi','matsumoto','yamada','tamiya','tanaka','momo'];
export function localDay(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function todayItems(source,profile,today=localDay()) {
  if(!profile?.staffId||profile.staffId==='guest'||profile.portalRole==='terminal') return [];
  const sid=profile.staffId, items=[];
  const add=(kind,id,title,date,url)=>items.push({kind,id,title,date:date||'',url,group:date&&date<today?'期限切れ':date===today?'今日':'確認待ち'});
  const entries=x=>Object.entries(x||{}).filter(([,v])=>v&&typeof v==='object');
  for(const [id,t] of entries(source.tasks)) {
    const names=sid==='sugihira'?[profile.name,'杉平','院長']:[profile.name];
    if(t.status==='完了'||!Array.isArray(t.assignees)||!names.some(n=>t.assignees.includes(n)))continue;
    if(t.date&&t.date>today)continue;
    add('タスク',id,t.title,t.date,`task-manager.html?task=${encodeURIComponent(id)}`);
  }
  for(const [id,e] of entries(source.schedule)) {
    if(e.decided||(e.members&&(!Array.isArray(e.members)||!e.members.includes(sid))))continue;
    if(!Array.isArray(e.dates)||!e.dates.length||e.dates.every(d=>e.responses?.[sid]?.[d]))continue;
    add('日程回答',id,e.name,e.deadline,`schedule.html?evid=${encodeURIComponent(id)}`);
  }
  for(const kind of ['meetingTasks','meetingNotices'])for(const [id,t] of entries(source[kind])) {
    const review=kind==='meetingTasks'&&sid==='sugihira'&&t.status==='review';
    const unread=noticeTargets.includes(sid)&&!t.readBy?.[sid]&&(kind!=='meetingTasks'||t.status!=='confirmed');
    if(review||unread)add(review?'院長確認':'ミーティング未確認',id,t.title,'',`meeting-management.html?caseKind=${kind==='meetingTasks'?'tasks':'notices'}&caseId=${encodeURIComponent(id)}`);
  }
  if(profile.portalRole==='admin')for(const kind of ['corrections','requests'])for(const [id,r] of entries(source[kind])) {
    if(r.status!=='pending'||r.cancelled||(kind==='requests'&&r.type!=='paid'))continue;
    add('勤怠承認',id,kind==='corrections'?'打刻修正の承認':'有給申請の承認','',`attendance.html?tab=admin&kind=${kind==='corrections'?'correction':'paid'}&item=${encodeURIComponent(id)}`);
  }
  const rank={'期限切れ':0,'今日':1,'確認待ち':2};
  return items.sort((a,b)=>rank[a.group]-rank[b.group]||a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind));
}
