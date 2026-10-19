import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {todayItems} from '../portal-today.mjs';

const source={requests:{pending:{type:'paid',status:'pending'},cancelled:{type:'paid',status:'pending',cancelled:true},approved:{type:'paid',status:'approved'},rejected:{type:'paid',status:'rejected'},wish:{type:'wish',status:'pending'}},corrections:{correction:{status:'pending'}},tasks:{task:{title:'Assigned task',assignees:['Test']}},meetingTasks:{review:{title:'Review',status:'review'}}};
const html=fs.readFileSync('index.html','utf8');
for(const [staffId,portalRole,paid,correction] of [['momo','admin',true,true],['sugihira','admin',false,true],['other','admin',false,true],['momo','staff',false,false],['other','staff',false,false],['guest','admin',false,false],['momo','terminal',false,false]]){
 test(`paid action ownership and rendered list: ${staffId}/${portalRole}`,()=>{
  const profile={staffId,portalRole,name:'Test'};
  const rows=todayItems(source,profile);
  assert.equal(rows.some(x=>x.id==='pending'),paid);
  assert.equal(rows.some(x=>x.id==='correction'),correction);
  for(const id of ['cancelled','approved','rejected','wish'])assert.equal(rows.some(x=>x.id===id),false);
  if(staffId!=='guest'&&portalRole!=='terminal')assert(rows.some(x=>x.id==='task'));
  if(staffId==='sugihira')assert(rows.some(x=>x.kind==='院長確認'));
  const nodes={heroTaskCard:{style:{}},heroTaskList:{innerHTML:''}};
  const c=vm.createContext({authenticatedProfile:profile,isGuestUser:()=>staffId==='guest',todayItems,document:{getElementById:id=>nodes[id]},escHtml:s=>String(s),Set,source});
  const start=html.indexOf('const todaySources=');
  vm.runInContext(html.slice(start,html.indexOf('function watchToday(',start))+'Object.assign(todaySources,source);renderTodayActions();',c);
  assert.equal(nodes.heroTaskList.innerHTML.includes('有給申請の承認'),paid);
  assert.equal(nodes.heroTaskList.innerHTML.includes('打刻修正の承認'),correction);
  if(paid)assert(nodes.heroTaskList.innerHTML.includes('attendance.html?tab=admin&kind=paid&item=pending'));
 });
}
