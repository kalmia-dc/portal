import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {canUseStaff,canAssignStaff} from '../portal-staff-usage.mjs';
import {scheduleMembers} from '../schedule-members.mjs';
import {buildBusinessRoster,historyStaffLabel} from '../portal-business-roster.mjs';
import {createRtdbTransport} from '../support-rtdb.mjs';
const now=Date.parse('2026-10-24T03:00:00Z');
test('exact ID usage policy preserves real external staff and historical assignments',()=>{
 assert.equal(canUseStaff('test','attendance'),true);assert.equal(canUseStaff('test','shift'),false);
 assert.equal(canUseStaff('hanowa','shift'),true);assert.equal(canUseStaff('hanowa','attendance'),true);
 for(const id of ['test','hanowa']){assert.equal(canUseStaff(id),false);assert.equal(canAssignStaff(id,[id]),true);assert.equal(canAssignStaff(id,[]),false);}
 for(const id of ['shinoda','kyosei','external-real-person','test-person','hanowa-person'])assert.equal(canUseStaff(id),true);
});
test('future targets exclude only usage slots; historic schedule and source answers survive',()=>{
 const roster=buildBusinessRoster({defaults:[{id:'test',name:'test',role:'DH'},{id:'hanowa',name:'ハノワ',role:'DH'},{id:'real',name:'外部職員',role:'DH'}]});
 assert.equal(roster.length,3);assert.equal(historyStaffLabel(roster,'test'),'test');
 const event={dates:['2026-11-08'],members:['test','hanowa','real'],responses:{test:{'2026-11-08':'o'},real:{'2026-11-08':'x'}}},before=JSON.stringify(event);
 assert.deepEqual(scheduleMembers(roster,event,now).map(s=>s.id),['real']);assert.equal(JSON.stringify(event),before);
 assert.equal(scheduleMembers(roster,{...event,dates:['2026-08-01']},now).length,3);
});
test('shift test slot cannot register, but existing shifts and manual times survive generation protection',()=>{
 const c={window:{},STAFF:[{id:'test'},{id:'hanowa'}],structuredClone,shiftData:{test:{'2026-10-01':'early'},__manualTimes:{test:{'2026-10-01':{start:'09:00'}}}}};vm.createContext(c);
 vm.runInContext(fs.readFileSync('portal-staff-usage.js','utf8')+fs.readFileSync('shift-member-access.js','utf8'),c);
 assert.match(vm.runInContext("staffAccessIssue('test')",c),/打刻テスト/);assert.equal(vm.runInContext("staffAccessIssue('hanowa')",c),'');
 vm.runInContext('var saved=snapshotRevokedShiftData();shiftData={};restoreRevokedShiftData(saved);',c);
 assert.equal(c.shiftData.test['2026-10-01'],'early');assert.equal(c.shiftData.__manualTimes.test['2026-10-01'].start,'09:00');
});
test('new support threads for usage slots fail before any network call',async()=>{
 let reads=0;const api=createRtdbTransport({databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',user:{uid:'fixture'},profile:{staffId:'test',portalRole:'staff'},fetcher:()=>{reads++;throw Error('unexpected network');}});
 await assert.rejects(api.request('threads',{kind:'create',requestId:'fixture-thread'}),/専用/);assert.equal(reads,0);
});
test('all changed public scripts parse',()=>{
 for(const name of ['task-manager.html','goal-manager.html','loan-management.html','meeting-management.html','skill.html','index.html','schedule.html','shift.html'])for(const m of fs.readFileSync(name,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(m[2].trim())/type=["']module/.test(m[1])?new vm.SourceTextModule(m[2]):new vm.Script(m[2]);}
});
