import test from 'node:test';
import assert from 'node:assert/strict';
import {clinicCategory,comparisonHtml} from '../incident-report-ui.mjs';
test('actual leakage counts as accident; potential leakage alone does not',()=>{
 assert.equal(clinicCategory({value:{impact:'na',actual:['情報の誤送付・漏えい']}}),'accident');
 assert.equal(clinicCategory({value:{impact:'0',potential:['情報の漏えい']}}),'near_miss');
 assert.equal(clinicCategory({value:{impact:'unknown'}}),'unknown');
 assert.equal(clinicCategory({old:{type:'accident'}}),'accident');
 assert.equal(clinicCategory({record:{basis:'legacy',legacyType:'near_miss'},value:{impact:'unknown'}}),'near_miss');
});
test('ratio excludes unclassified and outside; handles empty and zero accident',()=>{
 const rows=[{old:{type:'accident'}},{old:{type:'near_miss'}},{value:{impact:'na'}},{value:{impact:'unknown'}}];
 const html=comparisonHtml(rows);assert.match(html,/当院 1件：1件/);assert.match(html,/50.0%/);assert.match(html,/比較対象外：1件 ／ 分類要確認：1件/);
 for(const subset of [[],rows.slice(1)]){const view=comparisonHtml(subset);assert.doesNotMatch(view,/NaN|Infinity/);assert.match(view,/比較(?:は)?できません/);}
});

