import test from 'node:test';import assert from 'node:assert/strict';import {createLaborStore} from '../labor-store.mjs';import {draftEmployee} from '../labor-model.mjs';
test('roster import excludes shared slots, preserves existing data and is repeatable',async()=>{
  const roster=[{id:'s',name:'架空'},...['test','hanowa','kyosei'].map(id=>({id,name:id}))];
  const original={extra_staff:Object.fromEntries(roster.map(s=>[s.id,s])),shifts:{'2099-01':{hanowa:{'2099-01-01':'day'}}},portalAccess:{users:{u:{staffId:'s',active:true}}}};
  const records={},updates=[];const before=JSON.stringify(original);
  const port={read:async p=>p.startsWith('laborConfig/')?true:p==='laborRecords'?records:p.startsWith('laborRecords/')?records[p.split('/')[1]]:original[p]||null,timestamp:()=>1,now:()=>1,update:async value=>{updates.push(value);for(const [p,v]of Object.entries(value))if(p.startsWith('laborRecords/'))records[p.split('/')[1]]=structuredClone(v);}};
  const store=createLaborStore(port,{uid:'owner'},roster);
  assert.equal(await store.importStaff(),1);assert.equal(records.s.data.status,'draft');assert.equal(records.s.data.staffId,'s');
  records.s.data.basic.address='既存の編集';assert.equal(await store.importStaff(),0);assert.equal(records.s.data.basic.address,'既存の編集');
  assert.deepEqual(Object.keys(records),['s']);assert.equal(JSON.stringify(original),before);
  assert.ok(updates.flatMap(Object.keys).every(p=>p.startsWith('laborRecords/')||p.startsWith('laborHistory/')));
});
test('lost acknowledgement re-reads operation ID; retry does not write twice',async()=>{let record=null,writes=0;const actor={uid:'m',staffId:'owner'},d=draftEmployee({id:'s',name:'架空'});const store=createLaborStore({read:async p=>p.startsWith('laborConfig/')?true:p==='laborRecords/s'?record:null,timestamp:()=>1,now:()=>1,update:async updates=>{writes++;record=updates['laborRecords/s'];throw Error('lost acknowledgement');}},actor);const r=await store.save(d,0,'same');assert.equal(r.revision,1);await store.save(d,0,'same');assert.equal(writes,1);});
test('failed commit or unreadable outcome never reports success',async()=>{const store=createLaborStore({read:async p=>p.startsWith('laborConfig/')?true:null,timestamp:()=>1,now:()=>1,update:async()=>{throw Error('offline');}},{uid:'m'});await assert.rejects(store.save(draftEmployee({id:'s',name:'架空'}),0,'op'),/offline/);});
