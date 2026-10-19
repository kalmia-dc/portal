import test from 'node:test';
import assert from 'node:assert/strict';
import {reportHeading,reportDate} from '../incident-report-ui.mjs';
test('heading uses a semantic title without truncating the narrative',()=>{
 assert.equal(reportHeading({title:'患者の画像を表示したままにした',details:'長い本文'}),'患者の画像を表示したままにした');
 assert.equal(reportHeading({details:'あ'.repeat(60)}),'タイトル未設定（詳細を確認）');
});
test('report date uses initial timestamp in Japan and leaves missing dates unknown',()=>{
 assert.equal(reportDate(Date.parse('2026-10-18T15:00:00Z')),'2026/10/19');
 for(const v of [0,undefined,NaN,-1,1e20])assert.equal(reportDate(v),'不明');
});
