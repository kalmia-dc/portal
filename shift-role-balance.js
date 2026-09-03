// Actual assigned headcounts; existing coverage totals retain their own rules.
function countRoleStaffing(role, ds){
  return STAFF.filter(s=>s.role===role).filter(s=>{
    const k=shiftData[s.id]?.[ds];
    if(k==='admin') return false;
    return role==='DA' ? isFieldDa(s.id,ds) : isWorking(s.id,ds);
  }).length;
}
function renderRoleStaffingRows(grid,y,m,days){
  for(const role of ['DR','DH','DA']){
    const label=document.createElement('div');
    label.className='cal-corner';label.style.fontSize='.65rem';label.textContent=role+'人数';grid.appendChild(label);
    for(let d=1;d<=days;d++){
      const el=document.createElement('div');const off=isOffDay(y,m,d);
      el.className='cal-day-summary'+(off?' off-day':'');
      el.textContent=off?'-':countRoleStaffing(role,dateStr(y,m,d));
      grid.appendChild(el);
    }
  }
  const note=document.createElement('div');
  note.style.cssText='grid-column:1 / -1;padding:8px;font-size:.75rem;color:#526170;background:#f4f7fa;';
  note.textContent='職種別は配置人数（DHは午後勤務を含む、DAは事務勤務を除く）。全時間帯の同時勤務人数ではありません。DR+DH・DH+DAは従来の充足判定です。自動作成では勤務条件を優先して日ごとの偏りを減らします。';
  grid.appendChild(note);
}
function roleBalanceCoverage(ds){
  const dr=countRoleStaffing('DR',ds),dh=countRoleStaffing('DH',ds),da=countRoleStaffing('DA',ds);
  return [Math.min(dr,1),Math.min(dr+dh,5),Math.min(dh+da,6),
    Number(receptionistCovered(ds)),Number(isWednesdayYoshidaTsurutaOk(ds))];
}
function balanceRoleStaffing(y,m,days,wds){
  // Move an unchanged work shift to an off day, preserving monthly hours and days.
  const staff=STAFF.filter(s=>s.type==='full'&&!isAutoProtectedStaff(s.id)&&!s.fixedDays?.length&&!s.kyoseiDoc);
  let moves=0;
  for(let pass=0;pass<100;pass++){
    let best=null;
    for(const s of staff){
      if(!['DR','DH','DA'].includes(s.role))continue;
      const beforeStreak=consecutiveStats(s.id,wds);
      const beforeWeek=weeklyOverageScore(s.id,y,m,days);
      const beforeMaxWeek=Math.max(0,...weeklyHourSummary(s.id,y,m,days).map(w=>w.hours));
      const hasRequest=ds=>requestData.some(r=>r.staffId===s.id&&r.date===ds&&r.status==='approved'&&!r.cancelled);
      for(const source of wds){
        const key=shiftData[s.id]?.[source];
        if(!['early','late'].includes(key)||!isWeeklyMovableWork(s,source,y,m)||hasRequest(source))continue;
        if((s.satFixed||s.satMandatory)&&new Date(source+'T12:00:00').getDay()===6)continue;
        for(const target of wds){
          if(shiftData[s.id]?.[target]!=='off'||isFixedOffDay(s.id,target)||hasRequest(target))continue;
          const gap=countRoleStaffing(s.role,source)-countRoleStaffing(s.role,target);
          if(gap<2)continue;
          if(key==='late'&&(new Date(target+'T12:00:00').getDay()===6||STAFF.filter(x=>shiftData[x.id]?.[target]==='late').length>=2))continue;
          const coverage=[source,target].map(roleBalanceCoverage);
          let valid=false;
          shiftData[s.id][source]='off';shiftData[s.id][target]=key;
          try{
            const streak=consecutiveStats(s.id,wds);
            valid=[source,target].every((ds,i)=>roleBalanceCoverage(ds).every((n,j)=>n>=coverage[i][j]))&&
              streak.max<=maxConsecutiveLimit(s.id)&&streak.max<=Math.max(preferredConsecutiveLimit(s.id),beforeStreak.max)&&
              streak.tripleWindows<=beforeStreak.tripleWindows&&
              weeklyOverageScore(s.id,y,m,days)<=beforeWeek+0.01&&
              Math.max(0,...weeklyHourSummary(s.id,y,m,days).map(w=>w.hours))<=beforeMaxWeek+0.01;
          }finally{shiftData[s.id][source]=key;shiftData[s.id][target]='off';}
          if(valid&&(!best||gap>best.gap))best={s,source,target,key,gap};
        }
      }
    }
    if(!best)break;
    shiftData[best.s.id][best.source]='off';shiftData[best.s.id][best.target]=best.key;moves++;
  }
  if(moves)addAlert('info',`職種別人数の偏りを調整：${moves}件（勤務時間・休暇・固定勤務を保持）`);
  for(const role of ['DR','DH','DA']){
    const counts=wds.map(ds=>countRoleStaffing(role,ds));
    if(counts.length&&Math.max(...counts)-Math.min(...counts)>1)
      addAlert('info',`${role}配置人数：${Math.min(...counts)}～${Math.max(...counts)}名。勤務条件を優先したため日ごとの差が残っています。`);
  }
  return moves;
}
