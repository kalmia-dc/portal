import {createLaborStore} from '../labor-store.mjs';
import {draftEmployee} from '../labor-model.mjs';
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
},timestamp:()=>Date.now(),now:()=>Date.now(),update:async updates=>{const registration=Object.keys(updates).some(p=>p.startsWith('portalJoinRequests/'));
if(registration && fixtureQuery.has('deny'))throw Object.assign(Error('保存できませんでした。'),{code:'PERMISSION_DENIED'});
for(const [p,v]of Object.entries(updates))set(p,v);
if(registration && fixtureQuery.has('uncertain'))failVerification=true;},transaction:async(p,fn)=>{const value=fn(structuredClone(pathGet(p)));if(value===undefined)return {committed:false};set(p,value);return {committed:true};}},actor,[staff]);}
