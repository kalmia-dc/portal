import test from 'node:test';import assert from 'node:assert/strict';
import {newReport,normalizeReport,classification,monthKey,toHTML,reportText,fromLegacy} from '../incident-report-core.mjs';
test('classifies actual patient impact, never potential harm or a complaint',()=>{
 for(const level of ['0','1','2','3a'])assert.equal(classification({impact:level}),'ヒヤリ・ハット');
 for(const level of ['3b','4','5'])assert.equal(classification({impact:level}),'医療事故');
 assert.equal(classification({impact:'unknown',details:'苦情',potential:['患者への健康被害']}),'判定保留');
 assert.equal(classification({impact:'na'}),'患者尺度の対象外');
});
test('unknowns remain unknown, mixed impacts rejected, imported extra privileges discarded',()=>{
 const r=newReport('test-core-001');
 assert.throws(()=>normalizeReport({...r,actual:['影響なし・未然に防止','金銭上の影響']}));
 const v=normalizeReport({...r,review:'confirmed',actor:'admin',submittedAt:1,rawText:'秘密'});
 for(const k of ['review','actor','submittedAt','rawText'])assert.equal(k in v,false);
 assert.equal(fromLegacy({details:'旧事例',type:'accident',level:'A'},'test-core-002').impact,'unknown');
});
test('HTML is inert, printable, and timestamps use JST boundary',()=>{
 const r={...newReport('test-core-003'),details:'<img src=x onerror=alert(1)> </script>',reporterName:'架空'};
 const html=toHTML(r);assert.ok(!html.includes('<img'));assert.ok(html.includes('\\u003c/script>'));assert.ok(html.includes('incident-visible'));
 assert.ok(reportText(r).includes('まだ')===false);assert.equal(monthKey(Date.parse('2026-09-30T15:00:00Z')),'2026-10');assert.equal(monthKey(0),'');
});
