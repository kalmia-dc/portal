import test from 'node:test';
import assert from 'node:assert/strict';
import {reporterGroup} from '../incident-report-ui.mjs';
test('director ID and legacy aliases aggregate once without changing source reports',()=>{
 const reports=[{reporterId:'sugihira',reporterName:'杉平'},{reporterId:'sugihira',reporterName:'院長'},{reporterName:'院長'},{reporterName:'杉平'}];
 const before=JSON.stringify(reports),totals=new Map();
 for(const r of reports){const group=reporterGroup(r);totals.set(group.key,(totals.get(group.key)||0)+1);assert.equal(group.name,'院長');}
 assert.deepEqual([...totals],[['sugihira',4]]);assert.equal(JSON.stringify(reports),before);
 assert.deepEqual(reporterGroup({},'杉平'),{key:'sugihira',name:'院長'});
});
test('proxy authors and distinct staff identities are not merged into director',()=>{
 assert.deepEqual(reporterGroup({reporterName:'保刈（院長代筆）'}),{key:'legacy-name:保刈（院長代筆）',name:'保刈（院長代筆）'});
 assert.deepEqual(reporterGroup({reporterId:'other',reporterName:'院長'}),{key:'other',name:'院長'});
 assert.deepEqual(reporterGroup({reporterName:'田宮',createdById:'sugihira'}),{key:'tamiya',name:'田宮'});
});

test('verified Tamiya ID and legacy name merge without merging another explicit ID',()=>{
 const rows=[{reporterId:'tamiya',reporterName:'田宮'},...Array.from({length:4},()=>({reporterName:'田宮'}))];
 const original=JSON.stringify(rows),totals=new Map();
 for(const row of rows){const g=reporterGroup(row);totals.set(g.key,(totals.get(g.key)||0)+1);assert.equal(g.name,'田宮');}
 assert.deepEqual([...totals],[['tamiya',5]]);assert.equal(JSON.stringify(rows),original);
 assert.equal(reporterGroup({reporterId:'another-person',reporterName:'田宮'}).key,'another-person');
 assert.equal(reporterGroup({reporterName:'保刈（院長代筆）'}).key,'legacy-name:保刈（院長代筆）');
});
