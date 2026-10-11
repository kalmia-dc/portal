import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {makeHarness} from './shift-admin-harness.mjs';
test('staff lifecycle hides an unlinked shift row, blocks changes, and restores row with mixed individual accounts; history unchanged',async()=>{
 const h=await makeHarness();h.run("shiftData={a:{'2026-10-01':'early'}};shiftLifecycle={a:{state:'stopped'}};");const before=h.run('JSON.stringify(shiftData)');
 assert.equal(h.run("visibleShiftStaff().some(s=>s.id==='a')"),false);assert.equal(h.run("canRegisterShiftStaff('a')"),false);
 h.run('showRevokedShiftStaff=true');assert.equal(h.run("visibleShiftStaff().some(s=>s.id==='a')"),true);assert.equal(h.run('JSON.stringify(shiftData)'),before);
 h.run("showRevokedShiftStaff=false;receiveShiftMembers({x:{staffId:'a',role:'staff',active:true},y:{staffId:'a',role:'staff',active:false}});shiftLifecycle.a.state='active';");assert.equal(h.run("visibleShiftStaff().some(s=>s.id==='a')"),true);assert.equal(h.run('JSON.stringify(shiftData)'),before);
});
test('attendance ordinary choices fail closed on state error; historical choices retain retired staff and restore without rewriting roster',()=>{
 const html=fs.readFileSync('attendance.html','utf8'),staffExpression=html.match(/allStaff=\(\)=>.*?,activeStaff=\(\)=>[^;]+;/)[0];
 const context=vm.createContext({STAFF:[{id:'a',name:'架空A'},{id:'b',name:'架空B',active:false}],extraStaff:[],lifecycleReady:true,lifecycleStates:{a:{state:'stopped'}},nodes:{profileStaff:{},cardStaff:{},recordStaff:{}}});
 vm.runInContext('const $=id=>nodes[id];const '+staffExpression+html.match(/function initSelects\(\)\{[^\n]+/)[0],context);
 vm.runInContext('initSelects()',context);assert.equal(context.nodes.profileStaff.innerHTML,'');assert.match(context.nodes.recordStaff.innerHTML,/架空A（退職・停止）/);assert.match(context.nodes.recordStaff.innerHTML,/架空B/);
 vm.runInContext("lifecycleStates={b:{state:'active'}};initSelects()",context);assert.match(context.nodes.profileStaff.innerHTML,/架空B/);
 vm.runInContext('lifecycleReady=false;initSelects()',context);assert.equal(context.nodes.profileStaff.innerHTML,'');assert.match(context.nodes.recordStaff.innerHTML,/架空A/);
});
