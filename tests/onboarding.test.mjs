import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,people,png} from './onboarding-fixture.mjs';
import {documents, VERSION} from '../onboarding-functions/catalog.mjs';

const self=(action,extra={})=>({action,mode:'self',...extra});
const review=(action,extra={})=>({action,mode:'review',staff:'doctor',period:'p1',...extra});
const mutation=(item,revision,operation,extra={})=>({item,revision,operation,version:VERSION,...extra});

test('職員用受付は個人アカウントと対象の雇用期間に限定する',async()=>{
  const {service}=fixture({preopened:false});
  await assert.rejects(service(people.doctor,self('status')),{code:'failed-precondition'});
  await assert.rejects(service(people.doctor,review('open')),{code:'permission-denied'});
  await service(people.hr,review('open'));
  await assert.rejects(service({...people.doctor,uid:'other'},self('status')),{code:'permission-denied'});
  assert.equal((await service(people.doctor,self('status'))).role,'DR');
  await assert.rejects(service(people.doctor,review('status')),{code:'permission-denied'});
});

test('三職種の書類と保険医登録票の要否を判定する',async()=>{
  const {service}=fixture();
  for(const [uid,license,registration] of [['doctor',true,true],['hygienist',true,false],['assistant',false,false]]) {
    const {items}=await service(people[uid],self('status'));
    assert.equal('license' in items,license);
    assert.equal('insuranceRegistration' in items,registration);
  }
  await service(people.hr,review('require',mutation('insuranceRegistration',0,'require-id')));
  const result=await service(people.doctor,self('status'));
  assert.equal(result.items.insuranceRegistration.required,true);
});

test('給与口座の途中保存、添付、差し戻し、再提出、受領を処理する',async()=>{
  const {service,records}=fixture();
  const fields={bank:'架空銀行',branch:'架空支店',accountType:'普通',account:'0012345',holder:'カクウ',payMonth:'2026-11'};
  await service(people.doctor,self('save',mutation('bank',0,'draft-id',{fields})));
  await assert.rejects(service(people.hr,review('detail',{item:'bank'})),{code:'permission-denied'});
  await assert.rejects(service(people.doctor,self('submit',mutation('bank',1,'bad-mime',{fields,agreed:[true],files:[{...png,type:'application/pdf'}]}))),{code:'invalid-argument'});
  await service(people.doctor,self('submit',mutation('bank',1,'submit-id',{fields,agreed:[true],files:[png]})));
  assert.deepEqual((await service(people.hygienist,self('detail',{staff:'doctor',item:'bank'}))).fields,{});
  const shown=await service(people.hr,review('detail',{item:'bank'}));
  assert.equal(shown.fields.account,'0012345');
  assert.equal(shown.consent.uid,'doctor');
  await assert.rejects(service(people.hr,review('accept',mutation('bank',1,'outdated'))),{code:'aborted'});
  await service(people.hr,review('return',mutation('bank',2,'return-id',{reason:'口座名義を確認してください。'})));
  await service(people.doctor,self('submit',mutation('bank',3,'resubmit-id',{fields,agreed:[true]})));
  assert.equal(records.get('doctor/p1/bank').body.priorConsents.length,1);
  await service(people.hr,review('accept',mutation('bank',4,'accept-id')));
  assert.equal((await service(people.doctor,self('status'))).items.bank.state,'accepted');
});

test('服務規程と貸付条件の同意には文面と本人情報を記録する',async()=>{
  const {service}=fixture();
  await assert.rejects(service(people.doctor,self('submit',mutation('service',0,'incomplete',{agreed:[true]}))),{code:'invalid-argument'});
  await assert.rejects(service(people.doctor,self('submit',mutation('service',0,'stale',{version:'2026-11-12.1',agreed:Array(44).fill(true)}))),{code:'failed-precondition'});
  await service(people.doctor,self('submit',mutation('service',0,'approved',{agreed:Array(44).fill(true)})));
  const approved=(await service(people.hr,review('detail',{item:'service'}))).consent;
  assert.deepEqual(approved.blocks,documents.service.approved);
  assert.equal(approved.signerName,'架空 医師');
  assert.equal(approved.blocks.filter(([kind])=>kind==='check').length,44);
  await service(people.doctor,self('submit',mutation('loan',0,'loan-id',{agreed:documents.loan.consent.map(()=>true)})));
  const {consent}=await service(people.hr,review('detail',{item:'loan'}));
  assert.equal(consent.version,VERSION);
  assert.match(consent.paragraphs.join(' '),/制服・名札は購入日から2年/);
});

test('番号画像は指定2名のみ閲覧でき、差し戻しと削除で画像を消去する',async()=>{
  const {service,records,logs,config}=fixture();
  const images=[png,png];
  await service(people.doctor,self('submit',mutation('myNumber',0,'vault-submit',{files:images})));
  assert.equal((await service(people.hr,review('status'))).items.myNumber.state,'submitted');
  for(const [actor,request] of [[people.hr,review('detail',{item:'myNumber'})],[people.doctor,self('detail',{item:'myNumber'})]]) {
    await assert.rejects(service(actor,request),{code:'permission-denied'});
  }
  for(const actor of [people.director,people.payroll]) {
    assert.equal((await service(actor,review('detail',{item:'myNumber'}))).files.length,2);
  }
  await service(people.payroll,review('return',mutation('myNumber',1,'vault-return')));
  assert.deepEqual(records.get('doctor/p1/myNumber').body,{});
  await service(people.doctor,self('submit',mutation('myNumber',2,'vault-resubmit',{files:images})));
  await service(people.director,review('accept',mutation('myNumber',3,'vault-accept')));
  await assert.rejects(service(people.hr,review('purge',mutation('myNumber',4,'vault-purge',{confirm:true}))),{code:'permission-denied'});
  await service(people.director,review('purge',mutation('myNumber',4,'vault-purge',{confirm:true})));
  assert.deepEqual(records.get('doctor/p1/myNumber').body,{});
  assert.equal((await service(people.hr,review('status'))).items.myNumber.state,'purged');
  assert.equal(logs.filter(e=>e.event==='view').length,2);
  assert.ok(logs.some(e=>e.event==='purge-completed'));
  assert.doesNotMatch(JSON.stringify(logs),/base64|iVBOR|reason/);
  config.vaultEnabled=false;
  assert.equal((await service(people.doctor,self('status'))).items.myNumber.available,false);
});
