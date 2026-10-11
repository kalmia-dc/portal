import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defaultStaff} from '../portal-default-staff.mjs';
const expected=JSON.parse(fs.readFileSync(new URL('./lifecycle-rule-baseline.json',import.meta.url),'utf8'));
export function buildLifecycleRuleCandidate(input){
  const output=structuredClone(input),r=output.rules;
  if(r?.['.read']!==false||r?.['.write']!==false)throw Error('Unexpected root grants');
  if(r.staffLifecycle)throw Error('Lifecycle rules already exist: review required');
  // Review the known rule tree before mechanically adding the common staff gate.
  if(JSON.stringify(r)!==JSON.stringify(expected.rules))throw Error('Live rules drift: review required');
  const me="root.child('portalAccess/users').child(auth.uid)",active=`${me}.child('active').val() === true`;
  const gate=`(${me}.child('role').val() === 'admin' || ${me}.child('role').val() === 'terminal' || root.child('staffLifecycle').child(${me}.child('staffId').val()).child('state').val() !== 'stopped')`;
  const walk=node=>{for(const [k,v]of Object.entries(node))if(typeof v==='string'&&['.read','.write'].includes(k)){
    // A conjunction requiring admin is already protected and needs no extra gate.
    if(v.includes(`${me}.child('role').val() === 'admin'`)&&!v.includes('||'))continue;
    node[k]=v.replaceAll(active,`(${active} && ${gate})`);
  }else if(v&&typeof v==='object')walk(v);};
  const unchanged=new Set(['portalAccess','portalAccessRequests','portalJoinRequests','portalJoinNames','serviceAccess','portalDailySummaryNotifications']);
  for(const [key,node]of Object.entries(r))if(!unchanged.has(key)&&node&&typeof node==='object')walk(node);
  // Prevent new binding/reactivation while stopped, including a concurrent approval.
  r.portalAccess.users.$uid['.write']=`(${r.portalAccess.users.$uid['.write']}) && (newData.child('active').val() !== true || newData.parent().parent().parent().child('staffLifecycle').child(newData.child('staffId').val()).child('state').val() !== 'stopped')`;
  const admin=`auth != null && auth.uid !== root.child('serviceAccess/notifications/uid').val() && ${active} && ${me}.child('role').val() === 'admin'`;
  const own=`auth != null && ${me}.child('staffId').val() === $staffId && auth.uid !== root.child('serviceAccess/notifications/uid').val()`;
  const known=`root.child('extra_staff').child($staffId).exists() || ${defaultStaff.map(s=>`$staffId === '${s.id}'`).join(' || ')}`;
  const same=['state','revision','operationId','updatedBy','updatedAt'].map(k=>`newData.child('${k}').val() === data.child('${k}').val()`).join(' && ');
  r.staffLifecycle={'.read':`auth != null && ${active} && (${me}.child('role').val() === 'admin' || ${me}.child('role').val() === 'terminal') && auth.uid !== root.child('serviceAccess/notifications/uid').val()`,$staffId:{
    '.read':own,
    '.write':`${admin} && $staffId !== ${me}.child('staffId').val() && $staffId !== root.child('portalAccess/users').child(root.child('serviceAccess/notifications/uid').val()).child('staffId').val() && newData.exists() && (${known})`,
    '.validate':`newData.hasChildren(['state','revision','operationId','updatedBy','updatedAt']) && ((${same}) || (newData.child('updatedBy').val() === auth.uid && newData.child('updatedAt').val() === now && newData.child('revision').val() === (data.exists()?data.child('revision').val()+1:1) && newData.child('state').val() !== data.child('state').val() && (data.exists() || newData.child('state').val() === 'stopped')))`,
    state:{'.validate':"newData.val() === 'stopped' || newData.val() === 'active'"},revision:{'.validate':'newData.isNumber()'},operationId:{'.validate':'newData.isString() && newData.val().length > 0 && newData.val().length <= 100'},updatedBy:{'.validate':'newData.isString()'},updatedAt:{'.validate':'newData.isNumber()'},'$other':{'.validate':false}
  }};
  // A shared terminal must not punch a retired staff member; historical records remain readable.
  const punches=r.attendance.punches.$date.$staffId;
  punches['.write']=`(${punches['.write']}) && (root.child('staffLifecycle').child($staffId).child('state').val() !== 'stopped' || ${me}.child('role').val() === 'admin')`;
  return output;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const [,,source,destination]=process.argv;fs.writeFileSync(destination,JSON.stringify(buildLifecycleRuleCandidate(JSON.parse(fs.readFileSync(source,'utf8'))),null,2)+'\n');}
