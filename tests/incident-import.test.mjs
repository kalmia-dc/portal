import test from 'node:test';
import assert from 'node:assert/strict';
import {matchImportedReporter,preservedChoices} from '../incident-report-ui.mjs';
import {createIncidentStore} from '../incident-report-store.mjs';
import {newReport} from '../incident-report-core.mjs';
const roster=[{id:'sugihira',name:'杉平'},{id:'tamiya',name:'田宮'},{id:'stopped',name:'退職者',availability:'stopped'}];
test('import resolves names only within permitted roster and preserves unresolved names',()=>{
 for(const name of ['院長','杉平'])assert.equal(matchImportedReporter({reporterName:name},roster,{staffId:'sugihira'},true).reporterId,'sugihira');
 assert.equal(matchImportedReporter({reporterName:'田宮'},roster,{staffId:'sugihira'},true).reporterId,'tamiya');
 for(const name of ['未知','退職者','院長']){const r=matchImportedReporter({reporterName:name,reporterId:'sugihira'},roster,{staffId:'tamiya'},false);assert.equal(r.reporterId,'');assert.equal(r.reporterName,name);}
 assert.equal(matchImportedReporter({reporterName:'田宮'},[...roster,{id:'another',name:'田宮'}],{},true).reporterId,'');
});
test('custom place phase and sharing values are preserved as selected options',()=>{
 for(const value of ['診療室の奥','補綴治療中','朝礼で共有済み'])assert.deepEqual(preservedChoices(value,{'':'未確認'}),[[value,value+'（取り込み値・要確認）'],['','未確認']]);
 assert.equal(preservedChoices('共有済み',{'':'未確認','共有済み':'共有済み'}).length,2);
});
test('director submission automatically confirms only known impact under manager authority',async()=>{
 const api={ref:(_,p)=>p,get:async()=>({val:()=>null}),update:async()=>{},serverTimestamp:()=>123};
 for(const [manager,owner,impact,expected]of [[true,'sugihira','0','confirmed'],[true,'sugihira','unknown','pending'],[true,'tamiya','0','pending'],[false,'sugihira','0','pending']]){
 const store=createIncidentStore({db:{},api,user:{staffId:'sugihira'},manager});
 const result=await store.commit({...newReport('fixture-auto-001'),reporterId:owner,reporterName:'院長',details:'架空',impact},{action:'import'});
 assert.equal(result.review,expected);assert.equal(result.reviewer,expected==='confirmed'?'sugihira':'');
 }
});
