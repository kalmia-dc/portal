import test from 'node:test';
import assert from 'node:assert/strict';
import {reportHeading,reportDate} from '../incident-report-ui.mjs';
test('heading uses report contents without inventing a title',()=>{
 assert.equal(reportHeading({reportNumber:'KD-123',details:'器具を確認\n 準備中に発見'}),'器具を確認 準備中に発見');
 assert.equal(reportHeading({details:'あ'.repeat(60)}),'あ'.repeat(56)+'…');
 assert.equal(reportHeading({}),'内容未記入の報告');
});
test('report date uses initial timestamp in Japan and leaves missing dates unknown',()=>{
 assert.equal(reportDate(Date.parse('2026-10-18T15:00:00Z')),'2026/10/19');
 for(const v of [0,undefined,NaN,-1,1e20])assert.equal(reportDate(v),'不明');
});
