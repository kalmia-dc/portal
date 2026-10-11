import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defaultStaff} from '../portal-default-staff.mjs';
const baseline=JSON.parse(fs.readFileSync(new URL('./portal-join-rule-baseline.json',import.meta.url),'utf8'));
export function buildJoinRuleCandidate(input) {
  const output=structuredClone(input),r=output.rules;
  if(r?.['.read']!==false || r?.['.write']!==false) throw Error('Unexpected root permissions');
  const human="auth != null && auth.uid !== root.child('serviceAccess/notifications').child('uid').val()";
  const admin=`${human} && root.child('portalAccess/users').child(auth.uid).child('active').val() === true && root.child('portalAccess/users').child(auth.uid).child('role').val() === 'admin'`;
  const targetHuman="$uid !== root.child('serviceAccess/notifications').child('uid').val()";
  const google="auth.token.email_verified === true && auth.token.firebase.sign_in_provider === 'google.com'";
  const j="root.child('portalJoinRequests').child($uid)";
  const finalRoot='newData.parent().parent().parent()'; // portalAccess/users/$uid -> root
  const finalJoin=`${finalRoot}.child('portalJoinRequests').child($uid)`;
  const a=`${finalJoin}.child('approval')`;
  const joinWrite=`${admin} && ${targetHuman} && auth.uid !== $uid && !data.exists() && ${j}.child('state').val() === 'pending' && ${finalJoin}.child('state').val() === 'approved' && newData.child('role').val() === 'staff' && newData.child('active').val() === true && newData.child('email').val() === ${j}.child('email').val() && newData.child('staffId').val() === ${a}.child('staffId').val() && newData.child('name').val() === ${a}.child('name').val() && newData.child('staffRole').val() === ${a}.child('role').val()`;
  const memberWrite=`((${baseline['.write']}) && (!${j}.exists() || data.exists())) || (${joinWrite})`;
  const memberExpected={...baseline,'.write':memberWrite};
  const current=r.portalAccess?.users?.$uid;
  if(![JSON.stringify(baseline),JSON.stringify(memberExpected)].includes(JSON.stringify(current))) throw Error('Member rules drift: manual review required');
  r.portalAccess.users.$uid=memberExpected;

  const nr='newData.parent().parent()'; // portalJoinRequests/$uid -> root
  const approval="newData.child('approval')";
  const staff=`${nr}.child('extra_staff').child(${approval}.child('staffId').val())`;
  const oldStaff=`root.child('extra_staff').child(${approval}.child('staffId').val())`;
  const user=`${nr}.child('portalAccess/users').child($uid)`;
  const claim=`${nr}.child('portalJoinNames').child(${approval}.child('nameKey').val())`;
  const roles=p=>`(${p}.val() === 'DR' || ${p}.val() === 'DH' || ${p}.val() === 'DA')`;
  const types=p=>`(${p}.val() === 'full' || ${p}.val() === 'part' || ${p}.val() === 'spot')`;
  const defaults=defaultStaff.map(s=>`(${approval}.child('staffId').val() === '${s.id}' && ${approval}.child('name').val() === '${s.name}' && ${approval}.child('role').val() === '${s.role}')`).join(' || ');
  const staffMatches=p=>`${p}.child('id').val() === ${approval}.child('staffId').val() && ${p}.child('name').val() === ${approval}.child('name').val() && ${p}.child('role').val() === ${approval}.child('role').val()`;
  const applicant=`${human} && ${targetHuman} && auth.uid === $uid && ${google} && !root.child('portalAccess/users').child($uid).exists() && newData.child('uid').val() === auth.uid && newData.child('email').val() === auth.token.email && newData.child('state').val() === 'pending' && !newData.child('approval').exists() && (!data.exists() || data.child('state').val() === 'pending') && ((newData.child('uid').val() === data.child('uid').val() && newData.child('email').val() === data.child('email').val() && newData.child('name').val() === data.child('name').val() && newData.child('jobRole').val() === data.child('jobRole').val() && newData.child('revision').val() === data.child('revision').val() && newData.child('submittedAt').val() === data.child('submittedAt').val()) || (newData.child('submittedAt').val() === now && newData.child('revision').val() === (data.exists() ? data.child('revision').val() + 1 : 1)))`;
  const frozen=['uid','email','name','jobRole','revision','submittedAt'].map(k=>`newData.child('${k}').val() === data.child('${k}').val()`).join(' && ');
  const finish=`${admin} && ${targetHuman} && auth.uid !== $uid && data.child('state').val() === 'pending' && newData.child('state').val() === 'approved' && ${frozen} && !root.child('portalAccess/users').child($uid).exists() && ${approval}.child('by').val() === auth.uid && ${approval}.child('at').val() === now && ${user}.child('staffId').val() === ${approval}.child('staffId').val() && ${user}.child('name').val() === ${approval}.child('name').val() && ${user}.child('staffRole').val() === ${approval}.child('role').val() && ${user}.child('email').val() === data.child('email').val() && ${user}.child('role').val() === 'staff' && ${user}.child('active').val() === true && ((${approval}.child('mode').val() === 'new' && !${oldStaff}.exists() && ${staffMatches(staff)} && ${staff}.child('type').val() === ${approval}.child('type').val() && ${claim}.child('uid').val() === $uid && ${claim}.child('staffId').val() === ${approval}.child('staffId').val()) || (${approval}.child('mode').val() === 'existing' && ((${staffMatches(oldStaff)}) || (!${oldStaff}.exists() && (${defaults})))))`;
  const requests={'.read':admin,$uid:{
    '.read':`${human} && ${targetHuman} && auth.uid === $uid`,
    '.write':`newData.exists() && ((${applicant}) || (${finish}))`,
    '.validate':"newData.hasChildren(['uid','email','name','jobRole','revision','submittedAt','state'])",
    uid:{'.validate':'newData.val() === $uid'},email:{'.validate':'newData.isString() && newData.val().length <= 254'},
    name:{'.validate':'newData.isString() && newData.val().length > 0 && newData.val().length <= 60'},
    jobRole:{'.validate':roles('newData')},revision:{'.validate':'newData.isNumber() && newData.val() >= 1'},submittedAt:{'.validate':'newData.isNumber()'},
    state:{'.validate':"newData.val() === 'pending' || newData.val() === 'approved'"},
    approval:{'.validate':`newData.hasChildren(['mode','staffId','name','role','type','nameKey','by','at']) && ${roles("newData.child('role')")} && ((${types("newData.child('type')")} && newData.child('mode').val() === 'new') || (newData.child('type').val() === 'unchanged' && newData.child('mode').val() === 'existing')) && newData.child('staffId').isString() && newData.child('staffId').val().length > 0 && newData.child('name').isString() && newData.child('name').val().length > 0 && newData.child('name').val().length <= 60`,
      ...Object.fromEntries(['mode','staffId','name','role','type','nameKey','by','at'].map(k=>[k,{'.validate':true}])), '$other':{'.validate':false}},
    '$other':{'.validate':false},
  }};
  const names={'.read':admin,$key:{'.write':`${admin} && !data.exists() && newData.exists()`,
    '.validate':"newData.hasChildren(['uid','staffId']) && newData.child('uid').isString() && newData.child('staffId').isString() && newData.parent().parent().child('portalJoinRequests').child(newData.child('uid').val()).child('state').val() === 'approved' && newData.parent().parent().child('portalJoinRequests').child(newData.child('uid').val()).child('approval/nameKey').val() === $key && newData.parent().parent().child('portalJoinRequests').child(newData.child('uid').val()).child('approval/staffId').val() === newData.child('staffId').val()",
    uid:{'.validate':true},staffId:{'.validate':true},'$other':{'.validate':false}}};
  for(const [key,value] of Object.entries({portalJoinRequests:requests,portalJoinNames:names})) {
    if(r[key] && JSON.stringify(r[key])!==JSON.stringify(value)) throw Error(`${key} drift: manual review required`);
    r[key]=value;
  }
  return output;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [,,source,destination]=process.argv;
  if(!source || !destination) throw Error('Usage: node tools/build-join-rule-candidate.mjs LIVE_RULES OUTPUT');
  const input=JSON.parse(fs.readFileSync(source,'utf8').replace(/^\uFEFF/,''));
  fs.writeFileSync(destination,JSON.stringify(buildJoinRuleCandidate(input),null,2)+'\n');
}
