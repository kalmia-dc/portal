// Scheduling dates only; no HR details or account permissions are exposed.
export const scheduleToday=(now=Date.now())=>new Date(now+9*3600000).toISOString().slice(0,10);
export function eligibleForSchedule(staff,dates=[],now=Date.now()) {
  const today=scheduleToday(now),future=dates.filter(d=>d>=today);
  if(dates.length && !future.length)return true; // Preserve historical rosters and answers.
  if(Array.isArray(staff.schedulePeriods))return (future.length?future:[today]).some(d=>staff.schedulePeriods.some(p=>p.start<=d&&d<=p.end));
  return staff.availability!=='stopped'; // Legacy/unknown entries (including shared slots) stay unchanged.
}
export function scheduleMembers(roster,event,now=Date.now()) {
  const candidates=Array.isArray(event.members)?event.members.map(id=>roster.find(s=>s.id===id)||{id,name:id,label:id,availability:'unknown'}):roster;
  return candidates.filter(s=>eligibleForSchedule(s,event.dates||[],now));
}
