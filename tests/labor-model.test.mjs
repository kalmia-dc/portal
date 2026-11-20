import test from 'node:test';import assert from 'node:assert/strict';
import {draftEmployee,transition,lifecycleProjection,applicablePeriod,accessAt,jstStart,retention,retirementShifts,removeReviewedShifts,recordUpdate} from '../labor-model.mjs';
import {confirmLaborInformation,laborConfirmationIssues,laborInformationConfirmed} from '../labor-model.mjs';
import {extractCandidates,prepareFile} from '../labor-documents.mjs';
const draft=()=>({...draftEmployee({id:'s',name:'架空',role:'DH',type:'part'}),googleEmail:'test@example.test'});
test('labor information requires the four reviewed fields and invalidates only when they change',()=>{
  const data=draft();data.imported=true;
  assert.deepEqual(laborConfirmationIssues(data),['氏名（姓・名）','入社日']);
  assert.throws(()=>confirmLaborInformation(data,{uid:'owner'},1),/氏名/);
  data.basic.fullName='架空 花子';data.plannedPeriod.startDate='2020-04-01';
  const saved=confirmLaborInformation(data,{uid:'owner'},123);
  assert.equal(laborInformationConfirmed(saved),true);assert.equal(laborInformationConfirmed(data),false);
  assert.equal(saved.tasks['labor-information-review'].checkedBy,'owner');
  assert.equal(saved.tasks['labor-information-review'].checkedAt,123);
  for(const change of [d=>d.basic.fullName='別の 氏名',d=>d.role='DR',d=>d.type='full',d=>d.plannedPeriod.startDate='2020-04-02']){
    const edited=structuredClone(saved);change(edited);assert.equal(laborInformationConfirmed(edited),false);
  }
  saved.basic.phone='変更した電話番号';assert.equal(laborInformationConfirmed(saved),true);
  data.plannedPeriod.startDate='2020-02-31';assert.throws(()=>confirmLaborInformation(data,{uid:'owner'},1),/入社日/);
});
test('employment changes do not create checklists and preserve previous records',()=>{
  const fresh=draft();
  assert.deepEqual(fresh.tasks,{});
  const historicalTasks={old:{title:'架空の記録',owner:'担当者',due:'',status:'完了'}};
  const confirmed=transition({...fresh,tasks:historicalTasks},'confirm',{id:'first',startDate:'2026-10-01'});
  const retired=transition(confirmed,'retire',{endDate:'2026-10-31'});
  const rehired=transition(retired,'rehire',{id:'second',startDate:'2026-11-01',endDate:'2026-11-30'});
  for(const record of [confirmed,retired,rehired])assert.deepEqual(record.tasks,historicalTasks);
});
test('hire and retirement JST boundaries, cancellation, rehire gaps',()=>{let d=transition(draft(),'confirm',{id:'p',startDate:'2026-10-20'});d=transition(d,'retire',{endDate:'2026-10-25'});let l=lifecycleProjection(d,null,'op',{uid:'m'},0);assert.equal(accessAt(l,jstStart('2026-10-20')-1),false);assert.equal(accessAt(l,jstStart('2026-10-20')),true);assert.equal(accessAt(l,jstStart('2026-10-26')-1),true);assert.equal(accessAt(l,jstStart('2026-10-26')),false);d=transition(d,'rehire',{id:'p2',startDate:'2026-11-01'});l=lifecycleProjection(d,l,'op2',{uid:'m'},0);assert.equal(applicablePeriod(l,'2026-10-22'),'p');assert.equal(applicablePeriod(l,'2026-10-28'),null);assert.equal(applicablePeriod(l,'2026-11-01'),'p2');assert.throws(()=>transition(d,'cancel',{},jstStart('2026-11-01')));const c=transition(d,'cancel',{},jstStart('2026-10-30'));assert.equal(c.periods.p.cancelled,false);assert.equal(c.periods.p2.cancelled,true);});
test('date errors, incomplete onboarding, overlapping rehire',()=>{assert.throws(()=>jstStart('2026-02-30'));assert.throws(()=>transition({...draft(),type:''},'confirm',{id:'p',startDate:'2026-10-20'}));let d=transition(draft(),'confirm',{id:'p',startDate:'2026-10-20'});d=transition(d,'retire',{endDate:'2026-10-25'});assert.throws(()=>transition(d,'rehire',{id:'p2',startDate:'2026-10-25'}));assert.equal(transition(d,'withdraw').periods.p.endDate,'');});
test('retention is not upload-date-based',()=>{assert.equal(retention({category:'contract'}).date,'');assert.equal(retention({category:'contract',completedDate:'2024-02-29'}).date,'2029-02-28');assert.equal(retention({category:'employmentInsured',completedDate:'2026-10-13'}).date,'2030-10-13');});
test('future removals preserve history, other staff and detect concurrent manual edits/locks',()=>{let d=transition(draft(),'confirm',{id:'p',startDate:'2026-10-01'});d=transition(d,'retire',{endDate:'2026-10-20'});const month={s:{'2026-10-20':'A','2026-10-21':'B'},other:{'2026-10-21':'C'},__manualTimes:{s:{'2026-10-21':{start:'9:00'}}}};const rows=retirementShifts({'2026-10':month},'s',d);assert.equal(rows.length,1);assert.throws(()=>removeReviewedShifts(month,rows,'s',true));const changed=structuredClone(month);changed.__manualTimes.s['2026-10-21'].start='10:00';assert.throws(()=>removeReviewedShifts(changed,rows,'s',false));const out=removeReviewedShifts(month,rows,'s',false);assert.equal(out.s['2026-10-20'],'A');assert.equal(out.other['2026-10-21'],'C');assert.equal(out.s['2026-10-21'],undefined);});
test('record revisions reject stale edits and allow idempotent retries',()=>{const d=draft(),r=recordUpdate(null,d,{uid:'m'},'op',0,0);assert.throws(()=>recordUpdate(r,d,{uid:'m'},'op2',0,0));assert.equal(recordUpdate(r,d,{uid:'m'},'op',0,0),null);});
test('OCR keeps contract fields and omits compensation candidates',()=>{
  const candidates=extractCandidates('氏名：架空 花子\n入社日：2026年10月1日\n基本給：230,000円\n時給：2,100円\n資格手当：5,000円');
  assert.deepEqual(candidates.map(({field,value})=>[field,value]),[['name','架空 花子'],['startDate','2026-10-01']]);
});
test('file bytes roundtrip, magic and maximum',async()=>{const f=new File(['%PDF-test'],'draft.pdf',{type:'application/pdf'}),p=await prepareFile(f,'doc');assert.equal(atob(p.base64),'%PDF-test');assert.equal(p.hash.length,64);await assert.rejects(prepareFile(new File(['bad'],'x.pdf',{type:'application/pdf'}),'x'));await assert.rejects(prepareFile(new File([new Uint8Array(5242881)],'x.png',{type:'image/png'}),'x'));});
