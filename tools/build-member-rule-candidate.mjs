import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Merge only membership leaves into a freshly read production rules document.
// Preserve all other rule branches, including notification service permissions.
export function buildMemberRuleCandidate(input, reviewed=JSON.parse(fs.readFileSync(new URL('../database.rules.json',import.meta.url),'utf8'))) {
  const result=structuredClone(input),rules=result.rules;
  if(rules?.['.read']!==false || rules?.['.write']!==false) throw Error('Unexpected root permissions');
  const select=r=>({portalAccess:r.portalAccess,portalAccessRequests:r.portalAccessRequests});
  const base=JSON.parse(fs.readFileSync(new URL('./member-rule-baseline.json',import.meta.url),'utf8'));
  const notifyWrap=input=>{
    const copy=structuredClone(input);
    const human="auth != null && auth.uid !== root.child('serviceAccess/notifications').child('uid').val()";
    for(const [node,key] of [[copy.portalAccess.users.$uid,'.read'],[copy.portalAccessRequests.$uid,'.read'],[copy.portalAccessRequests.$uid,'.write']]) node[key]=`(${node[key]}) && (${human})`;
    const users=copy.portalAccess.users.$uid;
    users['.write']=`(${users['.write']}) && $uid !== root.child('serviceAccess/notifications').child('uid').val()`;
    return copy;
  };
  const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const expected=select(reviewed.rules);
  // Accept only the reviewed baseline or either known application order of the
  // notification candidate. New policies require review; never silently drop them.
  if(![base,notifyWrap(base),expected,notifyWrap(expected)].some(v=>canonical(v)===canonical(select(rules)))) throw Error('Membership rule drift: manual merge required');
  rules.portalAccess=structuredClone(expected.portalAccess);
  rules.portalAccessRequests=structuredClone(expected.portalAccessRequests);
  return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [,,source,destination]=process.argv;
  if(!source || !destination) throw Error('Usage: node tools/build-member-rule-candidate.mjs LIVE_RULES OUTPUT');
  const live=JSON.parse(fs.readFileSync(source,'utf8').replace(/^\uFEFF/,''));
  fs.writeFileSync(destination,JSON.stringify(buildMemberRuleCandidate(live),null,2)+'\n');
}
