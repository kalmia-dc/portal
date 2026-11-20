import {createLaborStore} from '../labor-store.mjs';
import {draftEmployee} from '../labor-model.mjs';
import {roleDocuments} from '../onboarding-functions/catalog.mjs';
const actor={uid:'fixture-momo',staffId:'fixture-office',portalRole:'admin'};
const staff={id:'fixture-staff',name:'架空 花子',role:'DH',type:'part'};
const seed={laborConfig:{enabled:true,owners:{'fixture-momo':true},uploadsEnabled:true,maxFileBytes:5242880,maxEncodedBytes:52428800},laborFileBudget:{used:0,revision:0},portalAccess:{users:{'fixture-momo':{staffId:'fixture-office',role:'admin',active:true}}},extra_staff:{'fixture-staff':staff}};
const fixtureQuery=new URL(location.href).searchParams;
if(fixtureQuery.has('onboarding')){
  seed.portalJoinRequests={'fixture-new':{uid:'fixture-new',email:'fixture-new@example.test',name:'架空 新入',jobRole:'DH',revision:1,submittedAt:1,state:'pending'}};
  const previous=draftEmployee(staff);
  seed.laborRecords={[staff.id]:{revision:1,operationId:'fixture-existing',data:previous}};
}
let db=structuredClone(seed);
if(fixtureQuery.has('labor-review')){
  const data=draftEmployee({...staff,imported:true});
  data.basic.fullName='架空 花子';data.plannedPeriod.startDate='2020-04-01';
  if(fixtureQuery.has('missing')){data.basic.fullName='';data.type='';data.plannedPeriod.startDate='';}
  db.laborRecords={[staff.id]:{revision:1,operationId:'seed-labor-review',data}};
  db.portalJoinRequests={'fixture-new':{uid:'fixture-new',email:'fixture-new@example.test',name:'架空 新入',jobRole:'DH',revision:1,submittedAt:1,state:'pending'}};
}
if(fixtureQuery.has('usage')){
  db.laborRecords={};db.staffLifecycle={};db.onboardingAccess={};db.onboardingV1={cases:{}};
  const names={active:'架空 利用可能',opening:'架空 受付待ち',documents:'架空 書類待ち',start:'架空 入社日待ち',stopped:'架空 停止',unregistered:'架空 未登録',unknown:'架空 確認失敗'};
  for(const [state,name] of Object.entries(names)){
    const id='fixture-'+state,d=draftEmployee({id,name,role:'DH',type:'part'});
    d.basic.fullName=name;d.status='confirmed';d.currentPeriod='p';
    d.periods={p:{startDate:state==='start'?'2099-01-01':'2026-01-01'}};
    db.laborRecords[id]={revision:1,data:d};
    if(state==='unregistered')continue;
    db.portalAccess.users[id]={staffId:id,role:'staff',active:state!=='stopped'};
    if(['opening','documents','start'].includes(state)){
      db.onboardingAccess[id]={staff:id,period:'p',pending:true};
      if(state!=='opening')db.onboardingV1.cases[id]={p:{role:'DH'}};
    }
    if(state==='start')db.staffLifecycle[id]={hrManaged:true,state:'active',startAt:Date.parse('2099-01-01T00:00:00+09:00'),endAt:Date.parse('2100-01-01T00:00:00+09:00'),currentPeriod:'p'};
  }
}
let failVerification=false;

const fixtureTools=document.createElement('details');fixtureTools.append(Object.assign(document.createElement('summary'),{textContent:'ローカル検証用の架空書類'}));
for(const name of ['synthetic-contract-text.pdf','synthetic-contract-scan.pdf','synthetic-contract.png','synthetic-contract.jpg','synthetic-locked.pdf','synthetic-broken.pdf']){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=async()=>{const res=await fetch('/__fixtures/'+name);if(!res.ok)throw Error('Fixture unavailable');const blob=await res.blob(),type=name.endsWith('.pdf')?'application/pdf':name.endsWith('.png')?'image/png':'image/jpeg',transfer=new DataTransfer();transfer.items.add(new File([blob],name,{type}));const input=document.getElementById('documentFile');input.files=transfer.files;input.dispatchEvent(new Event('change'));};fixtureTools.append(b);}document.querySelector('header').append(fixtureTools);
const pathGet=p=>p.split('/').reduce((o,k)=>o?.[k],db)??null;
const set=(p,v)=>{const parts=p.split('/'),last=parts.pop();let node=db;for(const k of parts)node=node[k]??={};if(v===null)delete node[last];else node[last]=structuredClone(v);};
export async function connectLabor(){document.getElementById('environment').textContent='ローカル検証・架空データのみ／閉じると消去';return createLaborStore({read:async p=>{
  if(failVerification && p.startsWith('laborRecords/')){
    failVerification=false;
    throw Error('Fixture read temporarily unavailable');
  }
  return structuredClone(pathGet(p));
},portalUsages:async()=>{
  if(fixtureQuery.has('usage-failure'))throw Error('Fixture usage unavailable');
  const usage={opening:{status:db.onboardingV1?.cases?.['fixture-opening']?.p?'documents':'opening'},documents:{status:'documents'},start:{status:'start',startDate:'2099-01-01'},unknown:{status:'unknown'}};
  usage.opening.checklist={opened:!!db.onboardingV1?.cases?.['fixture-opening']?.p,complete:false,
    items:roleDocuments('DR').map(([key,doc])=>({key,required:!doc.optional,state:'draft'}))};
  if(fixtureQuery.has('exception')){usage.opening.status='active';usage.opening.exception=true;}
  return Object.fromEntries(Object.entries(db.portalAccess.users).map(([uid,member])=>[
    member.staffId,usage[member.staffId.replace('fixture-','')]||
      (member.active?db.onboardingAccess?.[uid]?.pending?{status:'opening'}:{status:'active',administrator:member.role==='admin'}:{status:'stopped'}),
  ]));
},openOnboarding:async({staff,period})=>{
  if(fixtureQuery.has('opening-failure'))throw Error('受付を開始できませんでした。もう一度お試しください。');
  db.onboardingV1??={cases:{}};db.onboardingV1.cases??={};db.onboardingV1.cases[staff]??={};db.onboardingV1.cases[staff][period]??={role:'DH'};
},timestamp:()=>Date.now(),now:()=>Date.now(),update:async updates=>{const registration=Object.keys(updates).some(p=>p.startsWith('portalJoinRequests/'));
if(registration && fixtureQuery.has('deny'))throw Object.assign(Error('保存できませんでした。'),{code:'PERMISSION_DENIED'});
for(const [p,v]of Object.entries(updates))set(p,v);
if(registration && fixtureQuery.has('uncertain'))failVerification=true;},transaction:async(p,fn)=>{const value=fn(structuredClone(pathGet(p)));if(value===undefined)return {committed:false};set(p,value);return {committed:true};}},actor,[staff]);}
