import fs from 'node:fs';
const base='skills/incident-report/';
fs.copyFileSync('incident-report-core.mjs',base+'scripts/incident-report-core.mjs');
fs.mkdirSync('skills/claude-incident-report',{recursive:true});
const instructions=fs.readFileSync(base+'SKILL.md','utf8');
const references=['classification','format'].map(n=>fs.readFileSync(base+'references/'+n+'.md','utf8')).join('\n\n');
const core=fs.readFileSync('incident-report-core.mjs','utf8');
fs.writeFileSync('skills/claude-incident-report/SKILL.md',instructions+`\n\n# Claudeプロジェクトでの実行\n\nこのファイルは必要な参照資料と共通コードを同梱した自己完結版です。上記のreferencesへの参照は以下の該当節を読みます。コード実行環境が利用できる場合は、以下のJavaScriptをincident-report-core.mjsとして保存し、確認済みJSONをnormalizeReportしてtoHTMLで出力してください。外部ライブラリ・通信は不要です。ファイルを生成できない環境では、生成・保存できたと装わず、その制約を伝えて確認済みJSONを提示してください。\n\n`+references+'\n\n## 共通生成モジュール（正本と同じコード）\n\n```javascript\n'+core+'\n```\n');
