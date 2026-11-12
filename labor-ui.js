
import {staffNameKey} from './portal-roster-model.mjs';
import {DIRECTOR_STAFF_ID,personName} from './portal-person-display.mjs?v=20261021-director';
import {createPageLifecycle} from './portal-page-lifecycle.mjs';
const pageLifecycle=createPageLifecycle();
async function pageAwait(work){pageLifecycle.assertActive();let result;try{result=await work();}catch(error){pageLifecycle.assertActive();throw error;}pageLifecycle.assertActive();return result;}
import {connectLabor} from './labor-runtime.js?v=20261112-saved-documents';
import {draftEmployee,transition,period,retirementShifts,retention,today,jstStart} from './labor-model.mjs?v=20261112-without-salary';
import {prepareFile,readDocument,extractCandidates} from './labor-documents.mjs?v=20261112-without-salary';
const $=id=>document.getElementById(id),form=$('editor'),field=name=>form.elements.namedItem(name),id=()=>crypto.randomUUID();
let readerController,readingKey,editorBaseline;let store,records={},current=null,data=null,busy=false;const urls=new Set();
$('registrationUrl').value=new URL('./google-account-register.html',location.href).href.split('?')[0];
$('copyRegistrationUrl').onclick=async()=>{try{try{await pageAwait(async () => (navigator.clipboard.writeText($('registrationUrl').value)));$('copyRegistrationStatus').textContent='申請URLをコピーしました。本人へ渡してください。';}catch{if (pageLifecycle.active) {$('registrationUrl').focus();$('registrationUrl').select();$('copyRegistrationStatus').textContent='申請URLを選択しました。コピーして本人へ渡してください。';}}}catch(error){if(error?.code!=='portal/access-lost')throw error;}};
const status={draft:'下書き',confirmed:'入社確定',retiring:'退職日設定済み',cancelled:'入社取消'};
function el(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
function message(text,error=false){if(!pageLifecycle.active)return;const box=$('message');if(!box)return;box.textContent=text;box.classList.toggle('error',error);}
async function run(fn){try{if(busy||!pageLifecycle.active)return;busy=true;const buttons=[...document.querySelectorAll('button,input,select,textarea')],disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);try{await pageAwait(async () => (fn()));}catch(e){if (pageLifecycle.active) {message(e.message||'処理を確認できません。',true);}}finally{if (pageLifecycle.active) {busy=false;buttons.forEach((b,i)=>b.disabled=disabled[i]);}}}catch(error){if(error?.code!=='portal/access-lost')throw error;}}
function confirmAction(title,text){$('confirmTitle').textContent=title;$('confirmText').textContent=text;const d=$('confirmation');d.showModal();$('confirmYes').disabled=false;$('confirmNo').disabled=false;return new Promise(resolve=>{const done=value=>{d.close();resolve(value);};pageLifecycle.add(()=>done(false));$('confirmYes').onclick=()=>done(true);$('confirmNo').onclick=()=>done(false);d.oncancel=()=>resolve(false);});}
function input(label,value,type='text'){const l=el('label',label),i=el('input');i.type=type;i.value=value??'';l.append(i);return {label:l,input:i};}
function select(label,value,options){const l=el('label',label),s=el('select');for(const v of options){const o=el('option',v);o.value=v;s.append(o);}s.value=value;l.append(s);return {label:l,input:s};}
const basic={fullName:'確認した氏名（姓・名）',name:'名簿の表示名',kana:'ふりがな',birthDate:'生年月日',address:'住所',phone:'電話番号',email:'連絡先メール',emergency:'緊急連絡先'};
for(const [key,label]of Object.entries(basic)){
  const f=input(label,'',key==='birthDate'?'date':key==='email'?'email':'text');
  f.input.name='basic_'+key;
  if(key==='fullName'){
    f.input.maxLength=60;
    f.input.setAttribute('aria-describedby','fullNameHelp');
  }
  $('basicFields').append(f.label);
}
function collect(){const next=structuredClone(data);for(const key of Object.keys(basic))next.basic[key]=field('basic_'+key).value.trim();for(const key of ['role','type','googleEmail'])next[key]=field(key).value.trim();next.plannedPeriod=Object.fromEntries(['startDate','endDate','contractEnd','days','hours'].map(k=>[k,field(k).value]));return next;}
function clearDocumentReading(){
  readerController?.abort();
  readingKey=null;
  if(!$('ocr'))return;
  $('ocrText').value='';
  $('candidates').replaceChildren();
  $('ocr').hidden=true;
  $('ocrStatus').textContent='';
}
function clearRead(){clearDocumentReading();for(const u of urls)URL.revokeObjectURL(u);urls.clear();if(!$('documentFile'))return;$('documentPreview').replaceChildren();$('documentFile').value='';$('documentState').textContent='未選択';$('documentResult').textContent='';$('deletedDocuments').open=false;}

const roles={DR:'歯科医師',DH:'歯科衛生士',DA:'歯科助手・受付'};
const employment={full:'常勤',part:'非常勤',spot:'スポット'};
const onboarding=$('onboarding');
let applications={},bindings={},roster=[],selectedApplication=null,registrationAttempt=null;
const contractReviewKey='contract-renewal-review';
const contractReviewTitle='契約更新未確認';
function contractReviewText(employee){
  const due=employee.tasks?.[contractReviewKey]?.due;
  if(!due)return '';
  const [year,month,day]=due.split('-').map(Number);
  return `${contractReviewTitle}｜確認できた契約は${year}年${month}月${day}日まで`;
}
function drawContractReview(reset=false){
  const panel=$('contractReview');
  const warning=contractReviewText(data);
  $('contractReviewWarning').textContent=warning;
  $('contractReviewWarning').hidden=!warning;
  panel.hidden=!current;
  $('addContractReview').hidden=Boolean(warning);
  $('contractReviewDate').parentElement.hidden=Boolean(warning);
  $('clearContractReview').hidden=!warning;
  if(reset){
    $('contractReviewDate').value='';
    $('contractReviewFeedback').textContent='';
    panel.open=Boolean(warning);
  }
}
function editContractReview(due){
  if(due){
    jstStart(due);
    data.tasks[contractReviewKey]={title:contractReviewTitle,status:'対応中',due};
  }else{
    delete data.tasks[contractReviewKey];
  }
  drawContractReview();
  $('contractReviewFeedback').textContent='変更を確定するには「入力内容を保存」を押してください。';
  $('savedState').textContent='契約更新の確認・未保存';
}
$('addContractReview').onclick=()=>{
  const due=$('contractReviewDate').value;
  if(!due){
    $('contractReviewFeedback').textContent='確認できた契約の終了日を入力してください。';
    $('contractReviewDate').focus();
    return;
  }
  void run(()=>editContractReview(due));
};
$('clearContractReview').onclick=()=>run(()=>editContractReview(''));
const listStatus={...status,pending:'確認待ちの申請',complete:'登録完了',director:'院長情報登録済み',retiring:'退職予定',retired:'退職済み'};
const employeeGroups=[
  {label:'未登録',states:['pending','draft']},
  {label:'登録済み',states:['complete','confirmed','director','retiring']},
  {label:'退職済み',states:['retired']},
  {label:'入社取消',states:['cancelled']},
];
const employeeName=d=>d.basic.fullName || personName(d.basic.name,d.staffId);
let employeeListDate;
function recordStatus(d,date){
  if(d.status==='draft' && d.staffId===DIRECTOR_STAFF_ID && d.basic.fullName?.trim())return 'director';
  if(d.status==='retiring'){
    const endDate=d.periods[d.currentPeriod]?.endDate;
    if(endDate && endDate<date)return 'retired';
  }
  return d.status==='confirmed' && bindings[d.staffId]?'complete':d.status;
}
function drawList(){
  employeeListDate=today(store.now());
  const query=staffNameKey($('search').value);
  const box=$('employees');
  const employees=Object.values(records).map(record=>{
    const d=record.data;
    const name=employeeName(d);
    const startDate=d.periods[d.currentPeriod]?.startDate||d.plannedPeriod?.startDate||'';
    return {record,name,startDate,state:recordStatus(d,employeeListDate),search:[name,d.basic.name,d.basic.kana,d.staffId]};
  });
  const pending=Object.values(applications).filter(request=>request.state==='pending').map(request=>({
    request,name:request.name,startDate:'',state:'pending',search:[request.name],
  }));
  const rows=[...employees,...pending].sort((a,b)=>
    Number(!a.startDate)-Number(!b.startDate) ||
    a.startDate.localeCompare(b.startDate) ||
    a.name.localeCompare(b.name,'ja')
  );
  const filter=$('employeeFilter');
  const selected=filter.value||'all';
  const visibleByDefault=rows.filter(row=>row.state!=='cancelled');
  const states=employeeGroups.flatMap(group=>group.states);
  const filters=[['all','通常表示',visibleByDefault.length],...states.map(state=>[
    state,listStatus[state],rows.filter(row=>row.state===state).length,
  ])];
  filter.replaceChildren(...filters.map(([key,label,count])=>{
    const option=el('option',label+'（'+count+'件）');
    option.value=key;
    return option;
  }));
  filter.value=selected;
  const candidates=selected==='all'?visibleByDefault:rows.filter(row=>row.state===selected);
  const matches=candidates.filter(row=>row.search.some(name=>staffNameKey(name).includes(query)));
  $('employeeCount').textContent=matches.length+'件表示／全'+candidates.length+'件';
  box.replaceChildren();
  if(!matches.length){
    box.append(el('p',rows.length?'検索・絞り込みに該当する職員はいません。':'職員情報と確認待ちの申請はありません。'));
    return;
  }
  for(const {label,states} of employeeGroups){
    const groupRows=matches.filter(row=>states.includes(row.state));
    if(groupRows.length)box.append(drawEmployeeGroup(label,groupRows));
  }
}
function drawEmployeeGroup(label,rows){
  const group=el('div',null,'employee-group');
  const columns=['氏名','職種','雇用形態','入社日','登録状態'];
  const table=el('table'),thead=el('thead'),head=el('tr'),body=el('tbody');
  const title=el('h3',label+'（'+rows.length+'件）');
  title.id='employee-group-'+rows[0].state;
  table.setAttribute('aria-labelledby',title.id);
  for(const label of columns){
    const th=el('th',label);
    th.scope='col';
    head.append(th);
  }
  thead.append(head);
  table.append(thead,body);
  for(const {record,request,name,startDate,state} of rows){
    const row=el('tr'),identity=el('div');
    const button=el('button',name);
    button.type='button';
    const d=record?.data;
    if(request){
      button.setAttribute('aria-label',name+' の申請を開く');
      identity.append(button,el('small',request.email,'employee-email'));
      button.onclick=()=>run(async()=>{
        if(selectedApplication?.uid===request.uid && selectedApplication.revision===request.revision && !onboarding.hidden){
          $('applicationTitle').focus();
          return;
        }
        if(!onboarding.hidden && !await pageAwait(()=>confirmAction('申請を切り替える','表示中の申請を閉じますか？')))return;
        openApplication(request);
      });
    }else{
      if(!d.basic.fullName)button.append(el('small',' 氏名要確認','name-unconfirmed'));
      button.setAttribute('aria-current',String(d.staffId===data?.staffId));
      identity.append(button);
      const warning=contractReviewText(d);
      if(warning)identity.append(el('small',warning,'employee-email danger'));
      button.onclick=()=>run(async()=>{
        if(!form.hidden && !await discardEditorChanges())return;
        show(record);
        $('employeeTitle').focus();
        form.scrollIntoView({block:'start'});
      });
    }
    [identity,roles[request?.jobRole||d?.role],employment[d?.type],startDate,listStatus[state]].forEach((value,index)=>{
      const cell=el('td');
      cell.dataset.label=columns[index];
      cell.append(value||'未確認');
      row.append(cell);
    });
    body.append(row);
  }
  group.append(title,table);
  return group;
}
function discardEditorChanges(){
  return !data || JSON.stringify(collect())===editorBaseline ||
    pageAwait(()=>confirmAction('職員を切り替える','保存前の入力があります。入力を破棄して切り替えますか？'));
}
function registrationFeedback(value,error=false){
  $('registrationStatus').textContent=value;
  $('registrationStatus').classList.toggle('error',error);
}
function openApplication(request){
  selectedApplication=request;registrationAttempt=null;
  $('applicationIdentity').textContent=request.name+'／'+(roles[request.jobRole]||request.jobRole)+'／'+request.email;
  $('registrationFullName').value=request.name;
  const target=$('registrationTarget');
  const choices=new Map(roster.map(s=>[s.id,{name:s.name,role:s.role}]));
  for(const {data:d} of Object.values(records))choices.set(d.staffId,{name:d.basic.name,role:d.role,email:d.googleEmail,status:d.status});
  const matches=[...choices].filter(([,s])=>staffNameKey(s.name)===staffNameKey(request.name) || s.email?.toLowerCase()===request.email.toLowerCase());
  const option=(value,label,disabled=false)=>{const o=el('option',label);o.value=value;o.disabled=disabled;return o;};
  target.replaceChildren(option('','選んでください'));
  if(!matches.length)target.append(option('new','新入社員として登録'));
  for(const [sid,s] of matches){
    const unavailable=(s.role && s.role!==request.jobRole) || s.status==='cancelled' || Boolean(bindings[sid]);
    target.append(option(sid,s.name+'（'+sid+'）'+(unavailable?'・要確認':''),unavailable));
  }
  if(!matches.length)target.value='new';
  if(matches.length===1 && !target.options[1].disabled)target.value=matches[0][0];
  fillEmployment();
  onboarding.hidden=false;
  $('completeRegistration').hidden=false;
  registrationFeedback(matches.length?'既存の職員情報と照合して登録先を選んでください。':'');
  $('applicationTitle').focus();
}
function fillEmployment(){
  const sid=$('registrationTarget').value;
  const saved=records[sid]?.data;
  const known=roster.find(s=>s.id===sid);
  const period=saved?.periods[saved.currentPeriod];
  $('employmentFields').hidden=Boolean(period);
  $('registrationType').required=!period;
  $('registrationStart').required=!period;
  $('registrationType').value=saved?.type||known?.type||'';
  $('registrationStart').value=period?.startDate||saved?.plannedPeriod?.startDate||'';
}
$('registrationTarget').onchange=fillEmployment;
$('closeRegistration').onclick=()=>{onboarding.hidden=true;selectedApplication=null;registrationAttempt=null;};
function completeApplication(result){
  const {data:d}=result;
  records[d.staffId]=result;
  bindings[d.staffId]=selectedApplication.uid;
  delete applications[selectedApplication.uid];
  registrationAttempt=null;
  $('completeRegistration').hidden=true;
  registrationFeedback(employeeName(d)+'さんの職員登録とポータル利用設定が完了しました。');
  message(employeeName(d)+'さんの登録が完了しました。');
  if(current?.data.staffId===d.staffId && JSON.stringify(collect())===editorBaseline)show(result);
  drawList();
}
onboarding.onsubmit=event=>{
  event.preventDefault();
  void run(async()=>{
    if(!selectedApplication || registrationAttempt || $('completeRegistration').hidden)return;
    const request=selectedApplication;
    const target=$('registrationTarget').value;
    const previous=records[target];
    const staffId=target==='new'?'staff_'+id():target;
    const rosterEntry=roster.find(s=>s.id===staffId);
    const next=previous?structuredClone(previous.data):draftEmployee({id:staffId,name:rosterEntry?.name||request.name});
    next.basic.fullName=$('registrationFullName').value.trim();
    if(!next.basic.fullName){
      registrationFeedback('確認した氏名（姓・名）を入力してください。',true);
      $('registrationFullName').focus();
      return;
    }
    next.role=request.jobRole;
    next.googleEmail=request.email;
    const confirmed=next.currentPeriod?next:transition({...next,type:$('registrationType').value},'confirm',{
      id:id(),startDate:$('registrationStart').value,
    },store.now());
    const start=confirmed.periods[confirmed.currentPeriod].startDate;
    if(!await pageAwait(()=>confirmAction('入社を確定',employeeName(confirmed)+'さんの入社日 '+start+'。職員情報とポータル利用設定を登録します。')))return;
    const operationId=id();
    registrationFeedback('保存中…');
    try {
      const result=await pageAwait(()=>store.save(confirmed,previous?.revision||0,operationId,{request}));
      completeApplication(result);
    } catch(error) {
      if(error.code==='portal/access-lost')throw error;
      if(error.code==='labor/registration-unconfirmed'){
        registrationAttempt={staffId,operationId,request};
        $('completeRegistration').hidden=true;
      }
      registrationFeedback(error.message||'登録できませんでした。入力を確認してください。',true);
    }
  });
};

function documentButton(label,action){
  const button=el('button',label);
  button.type='button';
  button.onclick=()=>run(action);
  return button;
}
async function savedDocumentFile(key,document){
  const file=await pageAwait(()=>store.file(key));
  if(!file)throw Error('書類を取得できません。');
  const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
  const hash=[...new Uint8Array(await pageAwait(()=>crypto.subtle.digest('SHA-256',bytes)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==document.hash||bytes.length!==document.size||file.mime!==document.mime||file.staffId!==data.staffId)throw Error('保存コピーの照合に失敗しました。');
  return new File([bytes],document.name,{type:document.mime});
}
async function changeDocumentDeletion(key,document,deleted){
  const action=deleted?'削除':'復元';
  const detail=deleted?'削除済み一覧から復元できます。':'添付済み書類の一覧に戻します。';
  if(!await pageAwait(()=>confirmAction('添付書類を'+action,`${document.name} を${action}します。${detail}`)))return;
  const result=await pageAwait(()=>store.setDocumentDeleted(data.staffId,key,deleted,current.revision,id()));
  current=result;
  records[data.staffId]=result;
  const baseline=JSON.parse(editorBaseline);
  for(const entry of [document,baseline.documents[key]]){
    if(deleted)entry.deleted=true;
    else delete entry.deleted;
  }
  editorBaseline=JSON.stringify(baseline);
  const hasEdits=JSON.stringify(collect())!==editorBaseline;
  $('savedState').textContent=hasEdits?'入力に未保存の変更があります':`保存確認済み・版 ${current.revision}`;
  if(deleted && readingKey===key)clearDocumentReading();
  $('history').replaceChildren();
  drawDocuments();
  drawList();
  $('documentResult').textContent=`${document.name} を${action}しました。`;
}
function drawDocuments(){
  const box=$('documents'),removed=$('deletedDocumentList');
  box.replaceChildren();
  removed.replaceChildren();
  for(const [key,d] of Object.entries(data.documents)){
    const row=el('div',null,'entry');
    row.append(el('strong',d.name));
    if(d.deleted){
      const actions=el('div',null,'actions');
      actions.append(documentButton('復元',()=>changeDocumentDeletion(key,d,false)));
      row.append(actions);
      removed.append(row);
      continue;
    }
    const r=retention(d),actions=el('div',null,'actions');
    row.append(el('p',`保存済み · ${d.size.toLocaleString()}バイト／${r.date||'期限未確定'} ${r.label}`),actions);
    actions.append(documentButton('保存コピーを開く',async()=>{
      const file=await pageAwait(()=>savedDocumentFile(key,d));
      const url=URL.createObjectURL(file);
      urls.add(url);
      const link=el('a','コピーを表示');
      link.href=url;link.target='_blank';link.rel='noopener';
      actions.append(link);
      link.click();
    }));
    const read=documentButton('この書類を読み取る',()=>readContract(d.name,()=>savedDocumentFile(key,d),key));
    read.hidden=d.category!=='contract';
    const remove=documentButton('削除',()=>changeDocumentDeletion(key,d,true));
    remove.classList.add('danger');
    actions.append(read,remove);
    for(const [key,label,type] of [['completedDate','起算日','date'],['holdReason','継続保管理由','text'],['originalLocation','原本の保管場所','text'],['versionLabel','版・書類の日付メモ','text']]){
      const f=input(label,d[key],type);
      f.input.oninput=()=>{d[key]=f.input.value;};
      row.append(f.label);
    }
    const category=el('select');
    category.setAttribute('aria-label','保存書類の区分');
    for(const option of field('documentCategory').options)category.append(option.cloneNode(true));
    category.value=d.category;
    category.onchange=()=>{d.category=category.value;read.hidden=d.category!=='contract';};
    row.append(category);
    const submitted=select('提出状況',d.submissionStatus||'未確認',['未確認','未提出','提出済み','確認済み','差戻し']);
    submitted.input.onchange=()=>d.submissionStatus=submitted.input.value;
    row.append(submitted.label);
    box.append(row);
  }
  if(!box.childElementCount)box.append(el('p','添付済みの書類はありません。'));
  $('deletedDocuments').hidden=!removed.childElementCount;
  $('deletedDocumentSummary').textContent=`削除済み（${removed.childElementCount}件）`;
}
let portalUsageRequest=0;
function pendingApplicationFor(employee){
  const email=employee.googleEmail?.trim().toLowerCase();
  const name=staffNameKey(employee.basic.fullName);
  const uniqueName=name && Object.values(records).filter(({data:d})=>staffNameKey(d.basic.fullName||d.basic.name)===name).length===1;
  const pending=Object.values(applications).filter(request=>request.state==='pending' &&
    (email ? request.email?.toLowerCase()===email : uniqueName && staffNameKey(request.name)===name));
  return pending.length;
}
function describePortalUsage(employee,usage){
  switch(usage.status){
    case 'active': return ['利用可能',usage.administrator?'既存の管理者アカウントでログインできます。':'登録済みのGoogleアカウントでログインできます。'];
    case 'scheduled': return ['利用開始前',usage.startDate+'から、登録済みのGoogleアカウントでログインできます。'];
    case 'stopped': return ['利用停止中','現在、この職員のアカウントではログインできません。'];
    case 'unregistered': {
      const confirmedApplication=Object.values(applications).some(r=>r.state==='approved' && r.approval?.staffId===employee.staffId);
      if(bindings[employee.staffId] || confirmedApplication)break;
      const state=recordStatus(employee,today(store.now()));
      if(state==='retired'||state==='cancelled')return ['利用アカウントなし','この職員に紐付いたアカウントはありません。'];
      const pending=pendingApplicationFor(employee);
      if(pending===1)return ['管理者の確認待ち','職員一覧の「未登録」から本人の申請を開き、内容を確認してください。'];
      if(pending===0)return ['本人の申請待ち','職員一覧の上にある「本人用の申請URLをコピー」からURLを本人に渡してください。'];
      break;
    }
  }
  return ['利用状況を確認できません','一覧を再読み込みするか、ログインアカウント一覧で確認してください。'];
}
async function refreshPortalUsage(employee){
  const request=++portalUsageRequest;
  $('accountStatus').textContent='確認中…';
  $('accountNextStep').textContent='';
  let usage;
  try {
    usage=await pageAwait(()=>store.portalUsage(employee.staffId));
  }catch(error){
    if(error?.code==='portal/access-lost')return;
    usage={status:'unknown'};
  }
  if(!pageLifecycle.active || request!==portalUsageRequest || data?.staffId!==employee.staffId)return;
  const [label,nextStep]=describePortalUsage(employee,usage);
  $('accountStatus').textContent=label;
  $('accountNextStep').textContent=nextStep;
}
function show(record){clearRead();current=record?structuredClone(record):null;data=structuredClone(record?.data||data);const displayState=recordStatus(data,today(store.now()));form.hidden=false;$('employeeTitle').textContent=employeeName(data)||'新しい職員';$('employeeTitle').tabIndex=-1;$('identity').textContent=`${data.staffId}／${listStatus[displayState]}`;$('savedState').textContent=current?`保存確認済み・版 ${current.revision}`:'未保存';for(const key of Object.keys(basic))field('basic_'+key).value=data.basic[key]??'';for(const key of ['role','type','googleEmail'])field(key).value=data[key];const p=data.periods[data.currentPeriod]||data.plannedPeriod||{};for(const k of ['startDate','endDate','contractEnd','days','hours'])field(k).value=p[k]||'';$('periods').replaceChildren(...Object.values(data.periods).map(x=>el('p',`${x.startDate}〜${x.endDate||'未定'}${x.cancelled?'（取消）':''}／契約終了 ${x.contractEnd||'未確認'}／${x.days||'所定日未確認'} ${x.hours||'所定時間未確認'}`)));$('lifecycleActions').replaceChildren();for(const [action,label]of [['retire','退職日を確定'],['cancel','入社を取り消す'],['withdraw','退職を撤回'],['rehire','再入社を確定']]){if(data.status==='draft'||action==='withdraw'&&data.status!=='retiring'||action==='rehire'&&!['retiring','cancelled'].includes(data.status))continue;const b=el('button',label);b.type='button';b.onclick=()=>run(async()=>{try{let next=transition(collect(),action,{id:id(),...Object.fromEntries(['startDate','endDate','contractEnd','days','hours'].map(k=>[k,field(k).value]))},store.now());if(!await pageAwait(async () => (confirmAction(label,`${next.basic.name}：入社 ${next.periods[next.currentPeriod].startDate}、退職 ${next.periods[next.currentPeriod].endDate||'未定'}。ポータルの利用期間とシフトの登録可能期間に反映します。`))))return;await pageAwait(async () => (save(next,true)));}catch(error){if(error?.code!=='portal/access-lost')throw error;}});$('lifecycleActions').append(b);}void refreshPortalUsage(data);for(const k of ['shiftReview','history'])$(k).replaceChildren();drawDocuments();drawContractReview(true);editorBaseline=JSON.stringify(collect());drawList();}
async function save(next=collect(),reflect=false,file=null){try{const result=await pageAwait(async () => (store.save(next,current?.revision||0,id(),{reflect,file})));records[next.staffId]=result;show(result);message('保存後の再読み込みで内容を確認しました。');}catch(error){if(error?.code!=='portal/access-lost')throw error;}}
async function reload(){
  const result=await pageAwait(()=>Promise.all([store.list(),store.requests(),store.bindings(),store.roster()]));
  [records,applications,bindings,roster]=[result[0],result[1]||{},result[2]||{},result[3]];
  drawList();
  if(data)void refreshPortalUsage(records[data.staffId]?.data||data);
  if(registrationAttempt){
    const {staffId,operationId,request}=registrationAttempt;
    const saved=await pageAwait(()=>store.checkRegistration(staffId,operationId,request));
    if(saved){completeApplication(saved);return;}
    const fresh=applications[request.uid];
    if(fresh?.state==='pending' && fresh.revision===request.revision && records[staffId]?.operationId!==operationId){
      registrationAttempt=null;$('completeRegistration').hidden=false;
      registrationFeedback('登録は確認されませんでした。入力内容を確認して再試行できます。',true);
    }else{
      registrationFeedback('登録結果を確認できません。職員一覧と申請の状態を確認してください。',true);
    }
  }else if(selectedApplication && applications[selectedApplication.uid]?.state!=='pending' && !$('completeRegistration').hidden){
    $('completeRegistration').hidden=true;
    registrationFeedback('この申請の状態が変わりました。職員一覧を確認してください。',true);
  }
  message('最新の職員情報と申請を読み込みました。');
}
form.onsubmit=e=>{e.preventDefault();void run(async()=>{try{const next=collect();if(next.currentPeriod){const p=next.periods[next.currentPeriod];if(next.plannedPeriod.startDate!==p.startDate||next.plannedPeriod.endDate!==p.endDate)throw Error('入社日・退職日は、対応する確定ボタンで反映してください。');next.periods[p.id]={...period({...p,...Object.fromEntries(['contractEnd','days','hours'].map(k=>[k,field(k).value]))},p.id),cancelled:p.cancelled};}await pageAwait(async () => (save(next)));}catch(error){if(error?.code!=='portal/access-lost')throw error;}});};$('search').oninput=drawList;$('employeeFilter').onchange=drawList;$('reload').onclick=()=>run(reload);
$('import').onclick=()=>run(async()=>{try{if(!await pageAwait(async () => (confirmAction('既存名簿の取り込み','既存の職員IDを維持して下書きを作ります。test・ハノワ・矯正医は取り込みません。既存名簿やシフトは残し、取込済みの労務情報も上書きしません。'))))return;const n=await pageAwait(async () => (store.importStaff()));await pageAwait(async () => (reload()));message(`${n}人を下書きとして取り込みました。`);}catch(error){if(error?.code!=='portal/access-lost')throw error;}});
$('reviewShifts').onclick=()=>run(async()=>{try{if(!current||!['retiring','cancelled'].includes(current.data.status))throw Error('先に退職日または入社取消を確定してください。');const rows=retirementShifts(await pageAwait(async () => (store.shifts())),data.staffId,current.data);$('shiftReview').replaceChildren(...rows.map(r=>el('p',`${r.date}：${r.value}${r.manual?'（手入力時間あり）':''}`)));if(!rows.length){$('shiftReview').append(el('p','解除対象はありません。'));return;}const b=el('button',`${rows.length}件を確認して解除`);b.type='button';b.onclick=()=>run(async()=>{try{if(!await pageAwait(async () => (confirmAction('未来シフトの解除',`${current.data.basic.name} の表示中 ${rows.length}件を解除します。解除済みシフトは復元されません。`))))return;await pageAwait(async () => (store.removeShifts(current.data,rows)));$('shiftReview').replaceChildren(el('p','解除を確認しました。'));message('対象シフトを解除しました。');}catch(error){if(error?.code!=='portal/access-lost')throw error;}});$('shiftReview').append(b);}catch(error){if(error?.code!=='portal/access-lost')throw error;}});
$('documentFile').onchange=()=>{clearDocumentReading();const box=$('documentPreview');box.replaceChildren();const file=$('documentFile').files[0];$('documentState').textContent=file?'未保存（ファイルを選択済み）':'未選択';if(file&&['application/pdf','image/png','image/jpeg'].includes(file.type)){const url=URL.createObjectURL(file);urls.add(url);const preview=el(file.type==='application/pdf'?'iframe':'img');preview.src=url;preview.title='選択した原本のプレビュー';preview.alt='選択した原本のプレビュー';preview.style.width='100%';preview.style.maxHeight='420px';preview.style.objectFit='contain';if(file.type==='application/pdf')preview.style.height='420px';box.append(preview);}};
$('saveDocument').onclick=()=>run(async()=>{try{const file=$('documentFile').files[0];if(!file)throw Error('書類を選んでください。');const prepared=await pageAwait(async () => (prepareFile(file,id()))),next=collect();next.documents[prepared.id]={name:prepared.name,size:prepared.size,mime:prepared.mime,hash:prepared.hash,category:field('documentCategory').value,completedDate:field('documentCompleted').value,holdReason:field('documentHold').value,originalLocation:'事務関連',versionLabel:'',submissionStatus:'未確認'};retention(next.documents[prepared.id]);if(!await pageAwait(async () => (confirmAction('書類コピーの保存',`${file.name} を ${next.basic.name} の書類として保存します。番号・口座情報が除去されていることを確認してください。`))))return;try{await pageAwait(async () => (save(next,false,prepared)));$('documentState').textContent='保存済み（再読み込みで確認）';}catch(e){if (pageLifecycle.active) {$('documentState').textContent='未保存・保存結果を確認してください。原本は事務関連に保持してください。';throw e;}}}catch(error){if(error?.code!=='portal/access-lost')throw error;}});
const candidateFields={name:'basic_fullName',startDate:'startDate',contractEnd:'contractEnd',role:'role',type:'type',days:'days',hours:'hours'};
const candidateCodes={role:{'歯科医師':'DR','歯科衛生士':'DH','歯科助手':'DA','受付':'DA','歯科助手・受付':'DA'},type:{'常勤':'full','非常勤':'part','パート':'part','スポット':'spot'}};
function showCandidates(source){
  for(const candidate of extractCandidates(source)){
    const row=el('div',null,'entry'),check=el('input'),label=el('label'),value=el('input');
    const target=field(candidateFields[candidate.field]);
    const shownValue=target.selectedOptions?.[0]?.textContent||target.value||(candidate.field==='name'?field('basic_name').value:'');
    check.type='checkbox';
    check.dataset.key=candidate.field;
    label.append(check,el('span',candidate.label));
    value.value=candidate.value;
    value.setAttribute('aria-label',candidate.label+'の読取候補');
    row.append(label,el('small','現在の入力値　'+(shownValue||'未入力')),value);
    if(candidate.field==='startDate' && data.currentPeriod){
      check.disabled=value.disabled=true;
      row.append(el('small','確定済みの入社日は比較用に表示しています。'));
    }
    $('candidates').append(row);
  }
  $('applyCandidates').hidden=!$('candidates').querySelector('input[type=checkbox]:enabled');
}
async function readContract(name,getFile,key=null){
  clearDocumentReading();
  readingKey=key;
  const status=$('ocrStatus');
  const controller=readerController=new AbortController();
  status.textContent=`${name} を端末内で読み取り中…`;
  status.focus();
  try{
    const file=await pageAwait(getFile);
    const source=await pageAwait(()=>readDocument(file,progress=>{
      if(!controller.signal.aborted)status.textContent=`${name} を端末内で読み取り中… ${progress}`;
    },controller.signal));
    $('ocrText').value=source;
    showCandidates(source);
    $('ocr').hidden=false;
    status.textContent=$('candidates').childElementCount
      ?`${name} の読み取りが完了しました。現在の入力値と候補を確認してください。`
      :`${name} から反映できる項目を検出できませんでした。原文を確認してください。`;
  }catch(error){
    if(pageLifecycle.active)status.textContent=`${name} の読み取りに失敗しました。${error.message||''}`;
    throw error;
  }
}
$('readDocument').onclick=()=>run(async()=>{
  const file=$('documentFile').files[0];
  if(!file)throw Error('書類を選んでください。');
  if(field('documentCategory').value!=='contract')throw Error('読取対象は雇用契約書・労働条件通知書です。');
  await readContract(file.name,async()=>{await prepareFile(file,id());return file;});
});
$('applyCandidates').onclick=()=>run(()=>{
  const selected=[];
  for(const check of $('candidates').querySelectorAll('input[type=checkbox]:checked')){
    const key=check.dataset.key,input=check.closest('.entry').querySelector('input:not([type=checkbox])');
    if(key==='startDate' && data.currentPeriod)continue;
    const value=input.value.trim();
    const converted=candidateCodes[key]?Object.hasOwn(candidateCodes[key],value)&&candidateCodes[key][value]:value;
    if(!converted || key==='name' && value.length>60)throw Error(input.getAttribute('aria-label')+'を確認してください。');
    if(key==='startDate'||key==='contractEnd')jstStart(converted);
    selected.push([key,converted]);
  }
  if(!selected.length){
    $('ocrStatus').textContent='反映する項目にチェックを入れてください。';
    return;
  }
  for(const [key,value] of selected){
    field(candidateFields[key]).value=value;
    if(key==='name' && !field('basic_name').value.trim())field('basic_name').value=value;
  }
  $('savedState').textContent='候補を反映・未保存';
  $('ocrStatus').textContent='選んだ候補を入力欄に反映しました。内容を確認し、「入力内容を保存」を押してください。';
});
function visibleHistory(snapshot){
  if(!snapshot)return null;
  const fields={...snapshot};
  delete fields.salaries;
  delete fields.insurance;
  return fields;
}
$('loadHistory').onclick=()=>run(async()=>{try{const h=await pageAwait(async () => (store.history(data.staffId)));$('history').replaceChildren();for(const entry of Object.values(h||{}).sort((a,b)=>b.at-a.at)){const d=el('details');d.append(el('summary',`${new Date(entry.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}／${entry.by}`),el('pre',JSON.stringify({変更前:visibleHistory(h[entry.previousOperationId]?.after),変更後:visibleHistory(entry.after)},null,2)));$('history').append(d);}const shifts=await pageAwait(async () => (store.shiftHistory(data.staffId)));for(const entry of Object.values(shifts||{}).sort((a,b)=>b.at-a.at)){const d=el('details');d.append(el('summary',`シフト解除 ${new Date(entry.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}／${entry.by}`),el('pre',JSON.stringify(entry.months,null,2)));$('history').append(d);}}catch(error){if(error?.code!=='portal/access-lost')throw error;}});
window.addEventListener('pagehide',clearRead);window.addEventListener('portalAccessLost',()=>{clearRead();current=null;data=null;records={};applications={};bindings={};roster=[];selectedApplication=null;registrationAttempt=null;});window.addEventListener('laborAccessLost',()=>{pageLifecycle.stop();clearRead();current=null;data=null;records={};applications={};bindings={};roster=[];selectedApplication=null;registrationAttempt=null;});
try{store=await pageAwait(async () => (connectLabor()));$('app').hidden=false;await pageAwait(async () => (reload()));pageLifecycle.interval(()=>{if(employeeListDate!==today(store.now())){drawList();if(data)void refreshPortalUsage(data);}},1000*60);}catch(e){if (pageLifecycle.active) {message(e.message,true);$('app').hidden=true;}}
