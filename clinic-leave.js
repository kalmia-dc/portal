// Clinic leave is credited time, not attendance. Stored separately as shift key "clinic".
let clinicSettings = { periods:{}, years:{} };
let clinicSettingsLoaded = false;
let clinicBusy = false;
let clinicEditingId = '';
let clinicReport = '';
function clinicEscape(value){
  return String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function clinicDates(start,end){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end) throw Error('開始日と終了日を正しく指定してください。');
  const dates=[];
  const d=new Date(start+'T12:00:00');
  if(!Number.isFinite(d.getTime())||dateStr(d.getFullYear(),d.getMonth(),d.getDate())!==start) throw Error('日付が正しくありません。');
  for(;dateStr(d.getFullYear(),d.getMonth(),d.getDate())<=end;d.setDate(d.getDate()+1)){
    dates.push(dateStr(d.getFullYear(),d.getMonth(),d.getDate()));
    if(dates.length>370) throw Error('期間は370日以内で指定してください。');
  }
  if(dates.at(-1)!==end) throw Error('終了日が正しくありません。');
  return dates;
}
function clinicDateMap(settings=clinicSettings){
  const map={};
  Object.values(settings.periods||{}).forEach(p=>clinicDates(p.start,p.end).forEach(ds=>{map[ds]=p.name;}));
  return map;
}
function isClinicDay(ds){ return Object.hasOwn(clinicDateMap(),ds); }
function receiveClinicSettings(data){
  clinicSettings=data._clinic_rules||{periods:{},years:{}};
  customHolidays=Object.fromEntries(Object.entries(data).filter(([k,v])=>/^\d{4}_\d{2}_\d{2}$/.test(k)&&typeof v==='string').map(([k,v])=>[k.replace(/_/g,'-'),v]));
  clinicSettingsLoaded=true;
  if(document.getElementById('clinicLeaveModal')?.classList.contains('open')) renderClinicManager();
}
function clinicGenerationReady(){
  if(currentUser?.role!=='admin') return false;
  if(clinicBusy||!clinicSettingsLoaded||!Object.keys(HOLIDAYS).length||holidayDataError){
    alert('規定休・祝日データを確認できません。読み込み完了後に再試行してください。'); return false;
  }
  if(!clinicSettings.years?.[currentYear]) return confirm(`${currentYear}年のクリニック規定休が未設定です。\n「休業日管理」で期間または「今年は規定の休みなし」を登録してください。\n未設定のままシフト生成を続行しますか？`);
  return true;
}
function snapshotClinicShifts(y,m){
  const result={};
  for(const ds of Object.keys(clinicDateMap()).filter(ds=>ds.startsWith(monthKey(y,m)))){
    STAFF.forEach(s=>{ (result[s.id]??={})[ds]=shiftData[s.id]?.[ds]||'clinic'; });
  }
  return result;
}
function restoreClinicShifts(snapshot){
  Object.entries(snapshot).forEach(([sid,dates])=>Object.assign(shiftData[sid]??={},dates));
}
function clinicHourBreakdown(sid,y,m){
  let work=0,paid=0,credit=0;
  for(let d=1;d<=daysInMonth(y,m);d++){
    const k=shiftData[sid]?.[dateStr(y,m,d)];
    if(k==='clinic') credit+=8;
    else if(k==='paid') paid+=8;
    else work+=calcShiftHours(k);
  }
  return {work,paid,credit,total:work+paid+credit};
}
function clinicHourLabel(sid){
  const h=clinicHourBreakdown(sid,currentYear,currentMonth);
  return `勤務予定 ${h.work}h ＋ 有給 ${h.paid}h ＋ 規定休付与 ${h.credit}h ＝ 月合計 ${h.total}h`;
}
function renderClinicHours(){
  const staffEl=document.getElementById('clinicStaffHours');
  if(staffEl&&currentUser?.staffId) staffEl.textContent=clinicHourLabel(currentUser.staffId);
  if(currentUser?.role==='staff'){
    const h=clinicHourBreakdown(currentUser.staffId,currentYear,currentMonth).total;
    document.getElementById('profileHours').textContent=h+'h';
    document.getElementById('profileRemain').textContent=Math.max(0,160-h)+'h';
    document.getElementById('profilePct').textContent=Math.min(100,Math.round(h/160*100))+'%';
    document.getElementById('profileBar').style.width=Math.min(100,Math.round(h/160*100))+'%';
  }
  let el=document.getElementById('clinicHoursSummary');
  if(!el){ el=document.createElement('div');el.id='clinicHoursSummary';document.getElementById('staffList')?.appendChild(el); }
  if(el) el.innerHTML='<h3>月合計の内訳</h3>'+STAFF.map(s=>`<div style="font-size:.72rem;margin:6px 0">${clinicEscape(s.name)}：${clinicHourLabel(s.id)}</div>`).join('');
}
function openClinicManager(){
  let modal=document.getElementById('clinicLeaveModal');
  if(!modal){
    modal=document.createElement('div'); modal.id='clinicLeaveModal'; modal.className='modal-overlay';
    modal.innerHTML=`<div class="modal" style="max-height:90vh;overflow:auto;max-width:620px">
      <h2>クリニック規定休・休業日管理</h2>
      <p style="font-size:.85rem">規定休は全員に1日8時間を付与します。勤務予定時間とは分けて月合計に加算します。</p>
      <label>対象年 <input id="clinicYear" type="number" min="2000" max="2100" style="width:100px" onchange="renderClinicManager()"></label>
      <div id="clinicYearState" style="margin:12px 0"></div><div id="clinicPeriodList"></div>
      <fieldset id="clinicEditForm" style="margin-top:16px;padding:12px;border:1px solid #ccc">
        <legend>規定休の登録・変更</legend>
        <label>名称<input id="clinicName" maxlength="80" placeholder="お盆休み・年末年始" style="width:100%;margin:5px 0 12px"></label>
        <div style="display:flex;gap:12px;flex-wrap:wrap"><label>開始日<input id="clinicStart" type="date" style="display:block"></label><label>終了日<input id="clinicEnd" type="date" style="display:block"></label></div>
        <p style="font-size:.8rem">日曜・祝日を含む期間は登録できません。対象年は開始日の年を選んでください。年をまたぐ期間は翌年にも表示します。</p>
        <button class="btn btn-primary" onclick="saveClinicPeriod()">期間を保存</button>
        <button class="btn btn-secondary" onclick="resetClinicForm()">入力をクリア</button>
        <button class="btn btn-secondary" onclick="saveClinicNone()" style="margin-top:10px">今年は規定の休みなし</button>
        <button class="btn btn-secondary" onclick="retryClinicApply()" style="margin-top:10px">未入力シフトへの反映を再試行</button>
      </fieldset>
      <div id="clinicResult" role="status" style="white-space:pre-wrap;margin:12px 0;font-size:.85rem"></div>
      <div id="clinicConflicts" style="white-space:pre-wrap;font-size:.8rem;margin:12px 0"></div>
      <button class="btn btn-secondary" onclick="document.getElementById('clinicLeaveModal').classList.remove('open')">閉じる</button>
    </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('clinicYear').value=currentYear;
  clinicEditingId='';clinicReport='';
  renderClinicManager();modal.classList.add('open');
}
function renderClinicManager(){
  const y=Number(document.getElementById('clinicYear').value);
  const admin=currentUser?.role==='admin';
  document.getElementById('clinicEditForm').hidden=!admin;
  document.getElementById('clinicEditForm').disabled=clinicBusy||!clinicSettingsLoaded;
  document.getElementById('clinicYear').disabled=clinicBusy;
  document.getElementById('clinicYearState').textContent=!clinicSettingsLoaded?'設定を読み込み中':clinicSettings.years?.[y]==='none'?'今年は規定の休みなし':clinicSettings.years?.[y]==='registered'?'規定休 登録済み':'未設定（生成時に警告）';
  const periods=Object.entries(clinicSettings.periods||{}).filter(([,p])=>Number(p.start.slice(0,4))<=y&&Number(p.end.slice(0,4))>=y).sort((a,b)=>a[1].start.localeCompare(b[1].start));
  document.getElementById('clinicPeriodList').innerHTML=periods.map(([id,p])=>`<div style="padding:10px;border-bottom:1px solid #ddd">${clinicEscape(p.name)}<br>${clinicEscape(p.start)} ～ ${clinicEscape(p.end)}（${clinicDates(p.start,p.end).length}日）${admin?`<br><button class="btn btn-secondary" data-clinic-edit="${clinicEscape(id)}">変更</button> <button class="btn btn-secondary" data-clinic-delete="${clinicEscape(id)}">削除</button>`:''}</div>`).join('')||'<p>登録期間はありません。</p>';
  const legacy=Object.entries(customHolidays).filter(([ds])=>ds.startsWith(String(y))&&!isClinicDay(ds));
  if(legacy.length) document.getElementById('clinicPeriodList').innerHTML+='<h3>従来の休業日（8時間付与なし）</h3>'+legacy.map(([ds,label])=>`<div>${clinicEscape(ds)} ${clinicEscape(label)}</div>`).join('');
  document.querySelectorAll('[data-clinic-edit]').forEach(b=>b.onclick=()=>editClinicPeriod(b.dataset.clinicEdit));
  document.querySelectorAll('[data-clinic-delete]').forEach(b=>b.onclick=()=>deleteClinicPeriod(b.dataset.clinicDelete));
  document.getElementById('clinicResult').textContent=clinicReport;
  const conflicts=[];
  if(admin)Object.keys(clinicDateMap()).filter(ds=>ds.startsWith(y+'-')).forEach(ds=>{
    STAFF.forEach(s=>{const k=allShiftData[ds.slice(0,7)]?.[s.id]?.[ds];if(k&&k!=='clinic')conflicts.push(`${ds} ${s.name}：${Object.values(SHIFT).find(sh=>sh.key===k)?.shortLabel||k}`);});
  });
  document.getElementById('clinicConflicts').textContent=conflicts.length?'入力済み・個別変更の確認対象（保持中）\n'+conflicts.join('\n'):'';
}
function resetClinicForm(){clinicEditingId='';['clinicName','clinicStart','clinicEnd'].forEach(id=>document.getElementById(id).value='');}
function editClinicPeriod(id){
  if(currentUser?.role!=='admin'||clinicBusy) return;
  const p=clinicSettings.periods[id];if(!p)return;
  clinicEditingId=id;document.getElementById('clinicName').value=p.name;document.getElementById('clinicStart').value=p.start;document.getElementById('clinicEnd').value=p.end;
  document.getElementById('clinicYear').value=Number(p.start.slice(0,4));
}
function validateClinicPeriod(p,year,settings,id,holidays=HOLIDAYS){
  if(!p.name||p.name.length>80) throw Error('名称を1～80文字で入力してください。');
  if(Number(p.start.slice(0,4))!==year) throw Error('開始日の年と対象年を合わせてください。');
  const dates=clinicDates(p.start,p.end);
  const years=[...new Set(dates.map(ds=>ds.slice(0,4)))];
  if(years.some(y=>!Object.keys(holidays).some(ds=>ds.startsWith(y+'-')))) throw Error('指定年の祝日データが未収録です。確認できる年のみ登録できます。');
  const blocked=dates.filter(ds=>new Date(ds+'T12:00:00').getDay()===0||holidays[ds]);
  if(blocked.length) throw Error('日曜・祝日は登録できません。期間を修正してください。\n'+blocked.map(ds=>ds+' '+(holidays[ds]||'日曜日')).join('\n'));
  const others={periods:Object.fromEntries(Object.entries(settings.periods||{}).filter(([key])=>key!==id))};
  const overlaps=dates.filter(ds=>Object.hasOwn(clinicDateMap(others),ds));
  if(overlaps.length) throw Error('登録済み期間と重複しています：'+overlaps.join('、'));
  return dates;
}
async function saveClinicPeriod(){
  const p={name:document.getElementById('clinicName').value.trim(),start:document.getElementById('clinicStart').value,end:document.getElementById('clinicEnd').value};
  const year=Number(document.getElementById('clinicYear').value);
  const id=clinicEditingId||('p'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
  await mutateClinicSettings(settings=>{
    validateClinicPeriod(p,year,settings,id);
    (settings.periods??={})[id]=p;
    settings.years??={};clinicDates(p.start,p.end).forEach(ds=>settings.years[ds.slice(0,4)]='registered');
  });
}
async function saveClinicNone(){
  const y=Number(document.getElementById('clinicYear').value);
  await mutateClinicSettings(settings=>{
    if(!Number.isInteger(y)||y<2000||y>2100) throw Error('対象年を正しく指定してください。');
    if(Object.keys(clinicDateMap(settings)).some(ds=>ds.startsWith(y+'-'))) throw Error('規定休が登録済みです。先に対象の期間を削除してください。');
    (settings.years??={})[y]='none';
  });
}
async function deleteClinicPeriod(id){
  if(!confirm('この期間を削除しますか？規定休区分のみ解除し、個別に入力した出勤等は保持します。')) return;
  await mutateClinicSettings(settings=>{delete (settings.periods||{})[id];});
}
function normalizeClinicYears(settings){
  const dates=Object.keys(clinicDateMap(settings));
  Object.keys(settings.years||{}).forEach(y=>{if(settings.years[y]==='registered'&&!dates.some(ds=>ds.startsWith(y+'-')))delete settings.years[y];});
}
async function mutateClinicSettings(change){
  if(currentUser?.role!=='admin'||clinicBusy) return;
  if(!window._fb?.runTransaction||!clinicSettingsLoaded){alert('設定を読み込んでから再試行してください。');return;}
  clinicBusy=true;clinicReport='保存中…';renderClinicManager();
  const before=structuredClone(clinicSettings);
  try{
    await window.__holidayDataReady;
    if(holidayDataError||!Object.keys(HOLIDAYS).length) throw Error('祝日データを読み込めないため保存できません。');
    const {db,ref,runTransaction}=window._fb;
    let validationError;
    const result=await runTransaction(ref(db,'custom_holidays'),data=>{
      validationError=null;data=data||{};
      const settings=structuredClone(data._clinic_rules||{periods:{},years:{}});
      const previous=clinicDateMap(settings);
      try{change(settings);normalizeClinicYears(settings);}catch(e){validationError=e;return;}
      const next=clinicDateMap(settings);
      settings.retired??={};settings.legacy??={};
      Object.entries(previous).forEach(([ds,label])=>{
        const key=ds.replace(/-/g,'_');
        if(!next[ds]){
          settings.retired[ds]=true;
          if(data[key]===label){if(settings.legacy[ds])data[key]=settings.legacy[ds];else delete data[key];}
        }
      });
      Object.entries(next).forEach(([ds,label])=>{
        const key=ds.replace(/-/g,'_');
        if(!previous[ds]&&data[key])settings.legacy[ds]=data[key];
        delete settings.retired[ds];data[key]=label;
      });
      data._clinic_rules=settings;return data;
    },{applyLocally:false});
    if(validationError)throw validationError;
    if(!result.committed)throw Error('保存が完了しませんでした。');
    receiveClinicSettings(result.snapshot.val());
    clinicReport='設定を保存しました。\n'+await applyClinicToSavedShifts(before,clinicSettings);
    resetClinicForm();
  }catch(e){clinicReport='処理を完了できませんでした：'+e.message;}
  finally{clinicBusy=false;renderClinicManager();if(currentUser?.role==='admin')render();}
}
function mergeClinicMonth(data,dates,nextMap,staff){
  const result=structuredClone(data||{});const conflicts=[];
  for(const ds of dates){
    for(const s of staff){
      const cur=result[s.id]?.[ds];
      if(Object.hasOwn(nextMap,ds)){
        if(!cur)(result[s.id]??={})[ds]='clinic';
        else if(cur!=='clinic')conflicts.push(`${ds} ${s.name}：${cur}（保持）`);
      }else if(cur==='clinic'){delete result[s.id][ds];}
    }
  }
  return {data:result,conflicts};
}
async function applyClinicToSavedShifts(before,after){
  const {db,ref,get,runTransaction}=window._fb;
  const previous=clinicDateMap(before),next=clinicDateMap(after);
  const dates=[...new Set([...Object.keys(previous),...Object.keys(next),...Object.keys(after.retired||{})])];
  const months=[...new Set(dates.map(ds=>ds.slice(0,7)))];const report=[];
  for(const month of months){
    try{
      const lock=await get(ref(db,'shift_locks/'+firebaseSafeKey(month)));
      if(lock.val()){report.push(month+'：確定済みのためシフトは保持。確定解除後に反映を再試行してください。');continue;}
      let conflicts=[];
      const result=await runTransaction(ref(db,'shifts/'+month),data=>{
        const merged=mergeClinicMonth(data,dates.filter(ds=>ds.startsWith(month)),next,STAFF);
        conflicts=merged.conflicts;return merged.data;
      },{applyLocally:false});
      if(!result.committed)throw Error('保存未完了');
      allShiftData[month]=result.snapshot.val()||{};report.push(...conflicts);
    }catch(e){report.push(month+'：反映失敗（設定は保存済み）。再試行してください。 '+e.message);}
  }
  loadShiftForMonth(currentYear,currentMonth);
  return report.length?'確認対象（入力済みシフトは上書きしていません）\n'+report.join('\n'):'未入力の日へ規定休を反映しました。';
}
async function retryClinicApply(){
  if(currentUser?.role!=='admin'||clinicBusy||!clinicSettingsLoaded)return;
  clinicBusy=true;renderClinicManager();
  try{clinicReport=await applyClinicToSavedShifts(clinicSettings,clinicSettings);}catch(e){clinicReport=e.message;}
  finally{clinicBusy=false;renderClinicManager();render();}
}
