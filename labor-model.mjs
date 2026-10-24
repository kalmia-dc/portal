// Business state is private. Only lifecycleProjection is shared with the portal.
export const DAY = 86400000;
export const OPEN_END = 253402268400000;
export const INSURANCES = ['健康保険','厚生年金','雇用保険'];
export const ENROLLMENTS = ['未確認','加入中','未加入','対象外','資格喪失済み'];
export const PROGRESS = ['未着手','対応中','完了','対象外'];
export const ONBOARD = ['職員基本情報の確認','雇用契約書の確認','給与条件の確認','保険の加入状況・手続き確認','ポータル利用確認','シフト反映確認'];
export const OFFBOARD = ['退職日の確認','退職関連書類の確認','保険の手続き確認','ポータル利用停止確認','退職日より後のシフト解除確認'];
export function key(value) { if(typeof value!=='string'||!value||/[.#$\[\]/\u0000-\u001f\u007f]/u.test(value)||value.length>128)throw Error('識別情報が不正です。');return value; }
export const text = value => String(value??'').trim();
export function canonical(value){const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return JSON.stringify(sort(value));}
export function jstStart(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('日付を入力してください。');
  const ms=Date.parse(value+'T00:00:00+09:00');
  if(!Number.isFinite(ms)||new Date(ms+9*3600000).toISOString().slice(0,10)!==value)throw Error('実在する日付を入力してください。');
  return ms;
}
export const today = (ms=Date.now())=>new Date(ms+9*3600000).toISOString().slice(0,10);
export function dueState(item, date=today()) {
  if(['完了','対象外'].includes(item.status))return item.status;
  if(!item.due)return '期限未設定';
  const remaining=(jstStart(item.due)-jstStart(date))/DAY;
  return remaining<0?'期限超過':remaining<=7?'期限間近':'予定';
}
export function checklist(labels, prefix='in') {return Object.fromEntries(labels.map((title,i)=>[prefix+i,{title,owner:'百々',due:'',status:'未着手'}]));}
export function draftEmployee(staff, now=today()) {
  key(staff.id);
  return {staffId:staff.id, imported:!!staff.imported, basic:{name:text(staff.name),kana:'',birthDate:'',address:'',phone:'',email:'',emergency:''},
    role:staff.role||'',type:['full','part','spot'].includes(staff.type)?staff.type:'',googleEmail:'',status:'draft',currentPeriod:'',plannedPeriod:{startDate:'',endDate:'',contractEnd:'',days:'',hours:''},periods:{},salaries:{},
    insurance:Object.fromEntries(INSURANCES.map(name=>[name,{enrollment:'未確認',progress:'未着手'}])),tasks:checklist(ONBOARD),documents:{},createdDate:now};
}
export function period(input, id) {
  key(id); const startDate=text(input.startDate),endDate=text(input.endDate),startAt=jstStart(startDate),endAt=endDate?jstStart(endDate)+DAY:OPEN_END;
  if(endAt<=startAt)throw Error('退職日は入社日以降にしてください。');
  if(input.contractEnd && jstStart(input.contractEnd)<startAt)throw Error('契約終了日は入社日以降にしてください。');
  return {id,startDate,endDate,startAt,endAt,contractEnd:text(input.contractEnd),days:text(input.days),hours:text(input.hours),cancelled:false};
}
export function validateEmployee(data) {
  key(data.staffId); if(!text(data.basic?.name))throw Error('氏名を入力してください。');
  if(data.basic.birthDate)jstStart(data.basic.birthDate);
  if(data.googleEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.googleEmail))throw Error('Googleメールアドレスを確認してください。');
  if(!['draft','confirmed','retiring','cancelled'].includes(data.status))throw Error('在籍状態を確認してください。');
  if(data.status!=='draft'&&(!['DR','DH','DA'].includes(data.role)||!['full','part','spot'].includes(data.type)||!data.periods?.[data.currentPeriod]))throw Error('確定済みの必須項目は空欄にできません。');
  for(const item of Object.values(data.tasks||{})){if(!text(item.title)||!PROGRESS.includes(item.status))throw Error('手続きの名称と状況を確認してください。');if(item.due)jstStart(item.due);}
  for(const item of Object.values(data.insurance||{}))if(!ENROLLMENTS.includes(item.enrollment)||!PROGRESS.includes(item.progress))throw Error('保険の状況を確認してください。');
  for(const doc of Object.values(data.documents||{}))retention(doc);
  return data;
}
export function transition(employee, action, input={}, now=Date.now()) {
  const data=structuredClone(employee);validateEmployee(data);
  if(action==='confirm'||action==='rehire') {
    if(action==='confirm'&&data.status!=='draft')throw Error('入社は確定済みです。');
    if(action==='rehire'&&!['retiring','cancelled'].includes(data.status))throw Error('再入社の対象ではありません。');
    if(!['DR','DH','DA'].includes(data.role)||!['full','part','spot'].includes(data.type))throw Error('職種・雇用形態を入力してください。');
    const p=period(input,key(input.id));
    if(Object.values(data.periods).some(old=>!old.cancelled&&p.startAt<old.endAt&&p.endAt>old.startAt))throw Error('以前の在籍期間と重複しています。');
    data.periods[p.id]=p;data.currentPeriod=p.id;data.status=p.endDate?'retiring':'confirmed';
    if(action==='rehire')data.tasks={...data.tasks,...checklist(input.onboard||ONBOARD,'in-'+p.id+'-')};
    if(p.endDate)data.tasks={...data.tasks,...checklist(input.offboard||OFFBOARD,'out-'+p.id+'-')};
  } else {
    const p=data.periods[data.currentPeriod];if(!p)throw Error('先に入社を確定してください。');
    if(action==='retire') {
      if(data.status==='cancelled')throw Error('入社取消済みです。');
      data.periods[p.id]=period({...p,endDate:input.endDate},p.id);data.status='retiring';
      if(!input.endDate)throw Error('退職日を入力してください。');
      data.tasks={...data.tasks,...Object.fromEntries(Object.entries(checklist(input.offboard||OFFBOARD,'out-'+p.id+'-')).filter(([id])=>!data.tasks[id]))};
    } else if(action==='cancel') {
      if(now>=p.startAt||data.status==='cancelled')throw Error('入社前のみ取消できます。');
      p.cancelled=true;data.status='cancelled';
    } else if(action==='withdraw') {
      if(data.status!=='retiring')throw Error('退職予定がありません。');
      if(Object.values(data.periods).some(other=>other.id!==p.id&&!other.cancelled&&other.endAt>p.startAt))throw Error('別の在籍期間と重複します。');
      p.endDate='';p.endAt=OPEN_END;data.status='confirmed';
    } else throw Error('操作を確認してください。');
  }
  const selected=data.periods[data.currentPeriod];data.plannedPeriod=Object.fromEntries(['startDate','endDate','contractEnd','days','hours'].map(k=>[k,selected[k]]));
  return data;
}
export function lifecycleProjection(data, previous, operationId, actor, timestamp) {
  const p=data.periods[data.currentPeriod]; if(!p)return null;
  const prior=Object.values(data.periods).filter(x=>x.id!==p.id&&!x.cancelled).sort((a,b)=>b.startAt-a.startAt)[0];
  return {hrManaged:true,state:p.cancelled&&!prior?'stopped':'active',startAt:p.startAt,endAt:p.endAt,currentPeriod:p.id,currentCancelled:p.cancelled,previousPeriod:prior?.id||'',previousStartAt:prior?.startAt||0,previousEndAt:prior?.endAt||0,
    periods:Object.fromEntries(Object.entries(data.periods).map(([id,x])=>[id,{startDate:x.startDate,endDate:x.endDate||'9999-12-31',startAt:x.startAt,endAt:x.endAt,cancelled:x.cancelled}])),
    revision:(previous?.revision||0)+1,operationId,updatedBy:actor.uid,updatedAt:timestamp};
}
export function applicablePeriod(state, date) {
  if(!state?.hrManaged)return state?.state==='stopped'?null:'legacy';
  const ms=jstStart(date);return Object.entries(state.periods||{}).find(([,p])=>!p.cancelled&&p.startAt<=ms&&ms<p.endAt)?.[0]||null;
}
export function accessAt(state, ms=Date.now()) {return state?.state!=='stopped'&&(!state?.hrManaged||(!state.currentCancelled&&state.startAt<=ms&&ms<state.endAt)||(state.previousStartAt<=ms&&ms<state.previousEndAt));}
export function salaryEntry(input,id) {
  key(id);jstStart(input.effectiveDate);
  const amount=v=>{if(v===''||v==null)return null;const n=Number(v);if(!Number.isFinite(n)||n<0)throw Error('給与金額は0以上の数値で入力してください。');return n;};
  return {id,effectiveDate:input.effectiveDate,base:amount(input.base),hourly:amount(input.hourly),allowances:(input.allowances||[]).map(x=>({name:text(x.name),amount:amount(x.amount)})).filter(x=>x.name)};
}
export function retirementShifts(shifts, staffId, data) {
  const p=data.periods[data.currentPeriod];if(!p)throw Error('在籍期間を確認してください。');
  return Object.entries(shifts||{}).flatMap(([month,entries])=>Object.entries(entries?.[staffId]||{}).filter(([date])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&(p.cancelled?jstStart(date)>=p.startAt:p.endDate&&jstStart(date)>=p.endAt)).map(([date,value])=>({month,date,value,manual:entries.__manualTimes?.[staffId]?.[date]??null}))).sort((a,b)=>a.date.localeCompare(b.date));
}
export function removeReviewedShifts(monthData, rows, staffId, locked) {
  if(locked)throw Error('確定済み月です。通常のシフト画面で確定を解除してから再確認してください。');
  const next=structuredClone(monthData||{});
  for(const row of rows){if(next[staffId]?.[row.date]!==row.value||canonical(next.__manualTimes?.[staffId]?.[row.date]??null)!==canonical(row.manual))throw Error('シフトが変更されました。一覧を再確認してください。');}
  for(const row of rows){delete next[staffId][row.date];if(next.__manualTimes?.[staffId])delete next.__manualTimes[staffId][row.date];if(next.__laborPeriods?.[staffId])delete next.__laborPeriods[staffId][row.date];}
  return next;
}
export function recordUpdate(current, data, actor, operationId, timestamp, expectedRevision) {
  key(actor.uid);key(operationId);validateEmployee(data);
  if(current?.operationId===operationId)return null;
  if((current?.revision||0)!==expectedRevision)throw Error('別の画面で更新されました。再読み込みして確認してください。');
  return {data,revision:expectedRevision+1,operationId,updatedBy:actor.uid,updatedAt:timestamp};
}
export function retention(info) {
  const years={contract:5,health:2,pension:2,employmentInsured:4,employmentOther:2}[info.category];
  if(!years||!info.completedDate)return {label:'期限未確定',date:''};
  const ms=jstStart(info.completedDate),d=new Date(ms+9*3600000),month=d.getUTCMonth();d.setUTCFullYear(d.getUTCFullYear()+years);if(d.getUTCMonth()!==month)d.setUTCDate(0);
  return {label:info.holdReason?'継続保管・削除要確認':'期限経過後も削除要確認',date:d.toISOString().slice(0,10)};
}
