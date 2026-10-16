import fs from 'node:fs';
import {normalizeReport,toHTML} from './incident-report-core.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output){console.error('Usage: node render.mjs input.json output.html');process.exit(1);}
const report=normalizeReport(JSON.parse(fs.readFileSync(input,'utf8')));
fs.writeFileSync(output,toHTML(report),'utf8');
console.log('HTMLを保存しました。ポータルへの提出はまだ行っていません。');
