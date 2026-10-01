import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('deadline stays current throughout the 25th and advances on the 26th', () => {
  const html = read('index.html');
  const start = html.indexOf('  const deadline = new Date(now.getFullYear()');
  const source = html.slice(start, html.indexOf('  // 管理者リンクを表示', start));
  assert.ok(start > 0 && source.length > 100);
  for (const [month, day, hour, minute, expectedMain, expectedSub] of [
    [9, 1, 0, 0, 'シフト提出締切：2月分', '10月25日まで（残り24日）'],
    [9, 24, 12, 0, 'シフト提出締切：2月分', '10月25日まで（残り1日）'],
    [9, 25, 0, 0, 'シフト提出締切：2月分', '10月25日まで（残り0日）'],
    [9, 25, 12, 0, 'シフト提出締切：2月分', '10月25日まで（残り0日）'],
    [9, 25, 23, 59, 'シフト提出締切：2月分', '10月25日まで（残り0日）'],
    [9, 26, 0, 0, '次回締切：3月分', '11月25日まで'],
    [11, 25, 23, 59, 'シフト提出締切：4月分', '12月25日まで（残り0日）'],
    [11, 26, 0, 0, '次回締切：5月分', '1月25日まで'],
  ]) {
    const elements = {deadlineNotice:{}, deadlineNoticeMain:{}, deadlineNoticeSub:{}};
    vm.runInNewContext(source, {now:new Date(2026,month,day,hour,minute), document:{getElementById:id=>elements[id]}});
    assert.equal(elements.deadlineNoticeMain.textContent, expectedMain);
    assert.equal(elements.deadlineNoticeSub.textContent, expectedSub);
  }
});

test('goal initialization subscribes to private metrics only for admin roles', () => {
  const html = read('goal-manager.html');
  const start = html.indexOf('function init() {');
  const source = html.slice(start, html.indexOf('function currentMonth(',start));
  assert.ok(start > 0 && source.length > 100);
  for (const role of ['staff','trainingAdmin','terminal','admin']) {
    const paths=[];
    const el={style:{},classList:{add(){}}};
    const context={
      currentUser:{staffId:'sugihira',name:'Test'}, authenticatedProfile:{portalRole:role},
      isEditor:()=>true, populatePeriodFilter(){},populateEntryMonthFilter(){},render(){},showToast(){},
      document:{getElementById:()=>el,querySelectorAll:()=>[]},db:{},
      DB_PATH:'monthlyGoals',TARGET_DB_PATH:'halfYearGoalTargets',PRIVATE_METRICS_PATH:'privateMetrics',
      ref:(_db,p)=>p,onValue:(p,cb)=>{paths.push(p);cb({val:()=>({})});},
    };
    vm.runInNewContext(source+'\ninit();', context);
    assert.deepEqual(paths, role==='admin'?['monthlyGoals','halfYearGoalTargets','privateMetrics']:['monthlyGoals','halfYearGoalTargets']);
  }
});
