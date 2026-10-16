import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=fs.readFileSync('meeting-management.html','utf8');
const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
fs.writeFileSync('.incident-inline-check.mjs',code);
for(const file of ['.incident-inline-check.mjs','incident-report-core.mjs','incident-report-store.mjs','incident-report-ui.mjs']){
 const run=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(run.status){console.error(run.stderr);process.exit(1);}
}
console.log('Inline module and incident modules: syntax OK');
