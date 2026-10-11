import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('registration uses applicant URL and approval only; legacy requests and existing binding remain available',()=>{
 const html=fs.readFileSync('portal-members.html','utf8'),js=fs.readFileSync('portal-members.js','utf8');
 for(const text of ['名簿だけ先に追加','id="rosterForm"','id="staffName"'])assert.equal(html.includes(text),false);
 for(const text of ['performRosterAdd','async function addStaff','rosterReady','rosterList'])assert.equal(js.includes(text),false);
 for(const text of ['登録URLをコピー','本人のメールアドレス','以前のログイン申請','id="requests"','既存の名簿と紐付け','id="currentRoster"'])assert.ok(html.includes(text),text);
 assert.ok(js.includes("if(!$('requests').children.length) text($('requests'),'未登録の申請はありません。')"));
 assert.ok(!js.includes("$('requests').hidden"));
});
