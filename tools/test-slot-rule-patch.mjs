// Preserve all live rules; add only the approved test lifecycle exception.
import fs from 'node:fs';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('input/output required');
const live=JSON.parse(fs.readFileSync(input,'utf8')),repo=JSON.parse(fs.readFileSync('database.rules.json','utf8'));
const replacement=repo.rules.staffLifecycle.$staffId['.write'];
const marker=") || (auth != null && $staffId === 'test'";
const index=replacement.indexOf(marker);if(index<0)throw Error('missing exception');
const suffix=replacement.slice(index+6,-1);
const old=live.rules.staffLifecycle.$staffId['.write'];
if(old.includes("$staffId === 'test'"))throw Error('exception already exists; inspect instead of reapplying');
if(!suffix.includes('protectedStaff/test'))throw Error('invalid exception');
live.rules.staffLifecycle.$staffId['.write']='('+old+') || ('+suffix+')';
fs.writeFileSync(output,JSON.stringify(live,null,2)+'\n');
