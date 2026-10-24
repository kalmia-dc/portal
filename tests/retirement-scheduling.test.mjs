import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {draftEmployee,transition,lifecycleProjection,jstStart,accessAt} from '../labor-model.mjs';
import {createLaborStore} from '../labor-store.mjs';
import {buildBusinessRoster} from '../portal-business-roster.mjs';
import {scheduleMembers} from '../schedule-members.mjs';
const now=jstStart('2026-10-24');
const retired=()=>transition({...draftEmployee({id:'fixture',name:'架空職員',role:'DR',type:'part'}),googleEmail:''},'confirm',{id:'period1',startDate:'2025-07-01',endDate:'2026-08-31'},now);
test('no-account retirement preserves blank email and stops at next JST midnight',()=>{
 const d=retired(),l=lifecycleProjection(d,null,'op',{uid:'owner'},now);
 assert.equal(d.status,'retiring');assert.equal(d.googleEmail,'');
 assert.equal(accessAt(l,jstStart('2026-08-31')),true);assert.equal(accessAt(l,jstStart('2026-09-01')),false);
 assert.throws(()=>transition({...d,googleEmail:'bad'},'withdraw'),/メール/);
});
test('retirement writes only scoped HR, roster and history; does not grant accounts or remove shifts/answers',async()=>{
 let saved=null,patch;
 const store=createLaborStore({read:async p=>p.startsWith('laborConfig/')?true:p==='laborRecords/fixture'?saved:null,timestamp:()=>now,now:()=>now,update:async p=>{patch=p;saved=p['laborRecords/fixture'];}},{uid:'owner',staffId:'owner',isAdmin:true},[{id:'fixture',name:'架空職員',role:'DR'}]);
 await store.save(retired(),0,'op',{reflect:true});
 assert.deepEqual(Object.keys(patch).sort(),['extra_staff/fixture','laborHistory/fixture/op','laborNameClaims/e69eb6e7a9bae881b7e593a1','laborRecords/fixture','staffLifecycle/fixture'].sort());
 assert.deepEqual(patch['extra_staff/fixture'].schedulePeriods,[{start:'2025-07-01',end:'2026-08-31'}]);
 await assert.rejects(store.matchAccount(retired(),{email:''}),/アカウントなし/);
});
test('admin and ordinary roster omit retired staff in future and retain past answers and shared slots',()=>{
 const defaults=[{id:'fixture',name:'架空職員',role:'DR'},{id:'test',name:'test',role:'DH'},{id:'hanowa',name:'ハノワ',role:'DH'}];
 const extra={fixture:{...defaults[0],schedulePeriods:[{start:'2025-07-01',end:'2026-08-31'}]}};
 const life=lifecycleProjection(retired(),null,'op',{uid:'owner'},now);
 for(const lifecycle of [{},{fixture:life}]){
  const roster=buildBusinessRoster({defaults,extra,lifecycle,now});
  const event={dates:['2026-11-08'],responses:{fixture:{'2026-11-08':'o'}}},before=JSON.stringify(event);
  assert.deepEqual(scheduleMembers(roster,event,now).map(s=>s.id),['test','hanowa']);
  assert.deepEqual(scheduleMembers(roster,{...event,members:['fixture','test','hanowa']},now).map(s=>s.id),['test','hanowa']);
  assert.equal(JSON.stringify(event),before);
  assert.equal(scheduleMembers(roster,{dates:['2026-08-01']},now).length,3);
 }
});
test('known legacy stopped entries are not reactivated; rehire periods and empty cancellation windows work',()=>{
 assert.deepEqual(scheduleMembers([{id:'s',availability:'stopped'}],{dates:['2026-11-08']},now),[]);
 const s={id:'s',availability:'stopped',schedulePeriods:[{start:'2026-11-01',end:'9999-12-31'}]};
 assert.equal(scheduleMembers([s],{dates:['2026-11-08']},now).length,1);
 assert.equal(scheduleMembers([{...s,schedulePeriods:[]}],{dates:['2026-11-08']},now).length,0);
});
test('changed inline scripts parse and database rules still allow blank email without schema changes',()=>{
 for(const file of ['schedule.html','labor-management.html'])for(const m of fs.readFileSync(file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(m[2].trim())new vm.SourceTextModule(m[2]);}
 const rules=JSON.parse(fs.readFileSync('database.rules.json','utf8'));
 assert.match(rules.rules.laborRecords['$sid'].data.googleEmail['.validate'],/isString/);
 assert.doesNotMatch(rules.rules.laborRecords['$sid']['.validate'],/googleEmail.*length > 0/);
});
