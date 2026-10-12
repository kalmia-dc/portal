import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildLifecycleRuleCandidate} from './build-lifecycle-rule-candidate.mjs';
export function buildLaborRules(input) {
  const result=structuredClone(input),r=result.rules;
  if(r?.['.read']!==false||r?.['.write']!==false||!r.staffLifecycle||r.laborRecords)throw Error('確認済みの在籍管理ルールが必要です。');
  const me="root.child('portalAccess/users').child(auth.uid)",life=`root.child('staffLifecycle').child(${me}.child('staffId').val())`;
  const active=`${me}.child('active').val() === true`;
  const gate=`(${life}.child('hrManaged').val() !== true || (${life}.child('state').val() !== 'stopped' && ((${life}.child('currentCancelled').val() !== true && ${life}.child('startAt').val() <= now && now < ${life}.child('endAt').val()) || (${life}.child('previousStartAt').val() <= now && now < ${life}.child('previousEndAt').val()))))`;
  const owner=`auth != null && ${active} && ${gate} && root.child('laborConfig/owners').child(auth.uid).val() === true && auth.uid !== root.child('serviceAccess/notifications/uid').val()`;
  const enabled="root.child('laborConfig/enabled').val() === true";
  const walk=node=>{for(const [k,v]of Object.entries(node)){if(['.read','.write'].includes(k)&&typeof v==='string'&&v.includes("root.child('portalAccess/users')"))node[k]=`(${v}) && (auth != null && ${active} && ${gate})`;else if(v&&typeof v==='object')walk(v);}};
  for(const [k,v]of Object.entries(r))if(!['portalAccess','portalAccessRequests','portalJoinRequests','staffLifecycle','serviceAccess','portalDailySummaryNotifications'].includes(k)&&v&&typeof v==='object')walk(v);
  const ownConfig="auth != null && auth.uid === $uid";
  r.laborConfig={'.write':false,enabled:{'.read':`auth != null && ${active}`},owners:{$uid:{'.read':ownConfig}},maxFileBytes:{'.read':owner},maxEncodedBytes:{'.read':owner},uploadsEnabled:{'.read':owner}};
  const finalRoot='newData.parent().parent()';
  const record=`${finalRoot}.child('laborRecords').child($sid)`;
  r.laborRecords={'.read':owner,$sid:{'.write':`${owner} && ${enabled} && newData.exists()`,
    '.validate':`newData.hasChildren(['data','revision','operationId','updatedBy','updatedAt']) && newData.child('data/staffId').val() === $sid && newData.child('revision').val() === (data.exists()?data.child('revision').val()+1:1) && newData.child('updatedBy').val() === auth.uid && newData.child('updatedAt').val() === now && ${finalRoot}.child('laborHistory').child($sid).child(newData.child('operationId').val()).child('after').val() === newData.child('data').val()`,
    data:{'.validate':"newData.hasChildren(['staffId','basic','role','type','googleEmail','status','imported','createdDate','currentPeriod'])",
      basic:{'.validate':"newData.child('name').isString() && newData.child('name').val().length > 0",...Object.fromEntries(['name','kana','birthDate','address','phone','email','emergency'].map(k=>[k,{'.validate':"newData.isString() && newData.val().length <= 2000"}])),'$other':{'.validate':false}},
      ...Object.fromEntries(['staffId','role','type','googleEmail','status','createdDate','currentPeriod'].map(k=>[k,{'.validate':'newData.isString()'}])),
      imported:{'.validate':'newData.isBoolean()'},...Object.fromEntries(['periods','salaries','insurance','tasks','documents'].map(k=>[k,{'.validate':true}])),'$other':{'.validate':false}},
    revision:{'.validate':'newData.isNumber()'},operationId:{'.validate':'newData.isString() && newData.val().length > 0'},updatedBy:{'.validate':'newData.isString()'},updatedAt:{'.validate':'newData.isNumber()'},'$other':{'.validate':false}}};
  r.laborHistory={'.read':owner,$sid:{$op:{'.write':`${owner} && !data.exists() && newData.exists()`,'.validate':`newData.child('by').val() === auth.uid && newData.child('at').val() === now && newData.child('before').val() === root.child('laborRecords').child($sid).child('data').val() && newData.child('after').val() === newData.parent().parent().parent().child('laborRecords').child($sid).child('data').val() && newData.parent().parent().parent().child('laborRecords').child($sid).child('operationId').val() === $op`}}};
  r.laborTemplates={'.read':owner,'.write':`${owner} && ${enabled} && newData.exists()`};
  const rootAfter='newData.parent().parent()',newRecord=`${rootAfter}.child('laborRecords').child($staffId)`,p=`${newRecord}.child('data/periods').child(${newRecord}.child('data/currentPeriod').val())`;
  const oldLife=r.staffLifecycle.$staffId;
  const hrLife=`${owner} && ${enabled} && $staffId !== ${me}.child('staffId').val() && newData.exists() && newData.child('hrManaged').val() === true`;
  r.staffLifecycle.$staffId={'.read':oldLife['.read'],'.write':`(${hrLife}) || ((${oldLife['.write']}) && !(${enabled}) && data.child('hrManaged').val() !== true)`,
    '.validate':`(newData.child('hrManaged').val() === true && newData.child('startAt').val() === ${p}.child('startAt').val() && newData.child('endAt').val() === ${p}.child('endAt').val() && newData.child('currentPeriod').val() === ${newRecord}.child('data/currentPeriod').val() && newData.child('operationId').val() === ${newRecord}.child('operationId').val() && newData.child('revision').val() === (data.exists()?data.child('revision').val()+1:1) && newData.child('updatedBy').val() === auth.uid && newData.child('updatedAt').val() === now && (newData.child('state').val() === (${p}.child('cancelled').val() === true && newData.child('previousPeriod').val() === '' ? 'stopped':'active'))) || (newData.child('hrManaged').val() !== true && (${oldLife['.validate']}))`};
  // Parent grants must be narrowed here, not shadowed with ineffective child denies.
  const extraWrite=r.extra_staff['.write'];delete r.extra_staff['.write'];r.extra_staff.$sid={'.write':`(${extraWrite}) && (!(${enabled}) || (${owner}) || (data.exists() && root.child('staffLifecycle').child($sid).child('hrManaged').val() !== true))`};
  r.portalAccess.users.$uid['.write']=`(${r.portalAccess.users.$uid['.write']}) && (!(${enabled}) || (${owner}))`;
  r.portalJoinRequests.$uid['.write']=`(${r.portalJoinRequests.$uid['.write']}) && (auth.uid === $uid || !(${enabled}) || (${owner}))`;
  const sroot='newData.parent().parent().parent().parent()',sidLife="root.child('staffLifecycle').child($sid)",pid="newData.parent().parent().child('__laborPeriods').child($sid).child($date).val()",win=`${sidLife}.child('periods').child(${pid})`;
  const validDate=`${win}.exists() && ${win}.child('cancelled').val() !== true && ${win}.child('startDate').val() <= $date && $date <= ${win}.child('endDate').val()`;
  r.shifts.$month={'.validate':"root.child('shift_locks').child($month.replace('-','_')).val() !== true",$sid:{$date:{'.validate':`$sid.beginsWith('__') || ${sidLife}.child('hrManaged').val() !== true || newData.val() === data.val() || (${validDate})`}},__manualTimes:{$sid:{$date:{'.validate':`${sidLife}.child('hrManaged').val() !== true || newData.val() === data.val() || (${sidLife}.child('periods').child(newData.parent().parent().parent().child('__laborPeriods').child($sid).child($date).val()).child('cancelled').val() !== true && ${sidLife}.child('periods').child(newData.parent().parent().parent().child('__laborPeriods').child($sid).child($date).val()).child('startDate').val() <= $date && $date <= ${sidLife}.child('periods').child(newData.parent().parent().parent().child('__laborPeriods').child($sid).child($date).val()).child('endDate').val())`}}}};
  // File bytes are append-only and never loaded with the employee list.
  const fileRoot='newData.parent().parent()',budget=`${fileRoot}.child('laborFileBudget')`;
  r.laborFiles={$doc:{'.read':owner,'.write':`${owner} && root.child('laborConfig/uploadsEnabled').val() === true && !data.exists() && newData.exists()`,'.validate':`newData.hasChildren(['staffId','base64','mime','hash','size']) && newData.child('base64').isString() && newData.child('base64').val().length <= 6990508 && newData.child('size').isNumber() && newData.child('size').val() > 0 && newData.child('size').val() <= root.child('laborConfig/maxFileBytes').val() && ${budget}.child('lastDocument').val() === $doc && ${budget}.child('used').val() === root.child('laborFileBudget/used').val() + newData.child('base64').val().length && ${fileRoot}.child('laborRecords').child(newData.child('staffId').val()).child('data/documents').child($doc).child('hash').val() === newData.child('hash').val()`}};
  r.laborFileBudget={'.read':owner,'.write':`${owner} && newData.exists()`,'.validate':`newData.child('revision').val() === data.child('revision').val()+1 && newData.child('used').val() <= root.child('laborConfig/maxEncodedBytes').val() && newData.child('used').val() === data.child('used').val() + newData.parent().child('laborFiles').child(newData.child('lastDocument').val()).child('base64').val().length && !root.child('laborFiles').child(newData.child('lastDocument').val()).exists()`};
  // RTDB cannot compare entire objects by value. Compare every leaf in both
  // directions; immutable snapshots plus the previous-operation pointer form
  // the audit chain without duplicating mutable "before" objects.
  const rec=r.laborRecords.$sid;
  rec.data.plannedPeriod={'.validate':true};
  rec['.validate']=`newData.hasChildren(['data','revision','operationId','updatedBy','updatedAt']) && newData.child('data/staffId').val() === $sid && newData.child('revision').val() === (data.exists()?data.child('revision').val()+1:1) && newData.child('updatedBy').val() === auth.uid && newData.child('updatedAt').val() === now && newData.parent().parent().child('laborHistory').child($sid).child(newData.child('operationId').val()).child('at').val() === now`;
  const finalLife="newData.parent().parent().child('staffLifecycle').child($sid)",currentP="newData.child('data/periods').child(newData.child('data/currentPeriod').val())";
  rec['.validate']+=` && (newData.child('data/status').val() === 'draft' ? !${finalLife}.child('hrManaged').exists() : (${finalLife}.child('hrManaged').val() === true && ${finalLife}.child('startAt').val() === ${currentP}.child('startAt').val() && ${finalLife}.child('endAt').val() === ${currentP}.child('endAt').val() && ${finalLife}.child('currentPeriod').val() === newData.child('data/currentPeriod').val() && ${finalLife}.child('state').val() === (${currentP}.child('cancelled').val() === true && ${finalLife}.child('previousPeriod').val() === ''?'stopped':'active') && newData.child('data/googleEmail').val().length > 0))`;
  rec.data.status['.validate']="newData.val() === 'draft' || newData.val() === 'confirmed' || newData.val() === 'retiring' || newData.val() === 'cancelled'";
  const history=r.laborHistory.$sid.$op;
  history['.validate']=`newData.hasChildren(['previousOperationId','after','by','at']) && newData.child('by').val() === auth.uid && newData.child('at').val() === now && newData.child('previousOperationId').val() === (root.child('laborRecords').child($sid).exists()?root.child('laborRecords').child($sid).child('operationId').val():'') && newData.parent().parent().parent().child('laborRecords').child($sid).child('operationId').val() === $op`;
  // Anchors climb along with the mirrored subtree.
  function mirrorTree(node,kind,parts=[]){
    const climb='newData'+'.parent()'.repeat(parts.length+(kind==='record'?3:4));
    const rootPath=kind==='record'?`${climb}.child('laborHistory').child($sid).child(${climb}.child('laborRecords').child($sid).child('operationId').val()).child('after')`:`${climb}.child('laborRecords').child($sid).child('data')`;
    const other=rootPath+parts.map(k=>`.child(${k.startsWith('$')?k:JSON.stringify(k)})`).join('');
    node['.validate']=`(${node['.validate']??true}) && (newData.hasChildren() || newData.val() === ${other}.val())`;
    if(parts.length===6){node['.validate']+=' && !newData.hasChildren()';return;}
    const children=Object.entries(node).filter(([k,v])=>!k.startsWith('.')&&typeof v==='object');
    if(!children.length){const k='$k'+parts.length;node[k]={};children.push([k,node[k]]);}
    for(const [k,c]of children)mirrorTree(c,kind,[...parts,k]);
  }
  mirrorTree(rec.data,'record');history.after={};mirrorTree(history.after,'history');
  for(const k of ['previousOperationId','by','at'])history[k]={'.validate':k==='at'?'newData.isNumber()':'newData.isString()'};
  history.$other={'.validate':false};
  const shiftWrite=r.shifts['.write'];delete r.shifts['.write'];r.shifts.$month['.write']=`(${shiftWrite}) && root.child('shift_locks').child($month.replace('-','_')).val() !== true`;
  r.staffLifecycle.$staffId['.write']=`(${r.staffLifecycle.$staffId['.write']}) && root.child('laborConfig/protectedStaff').child($staffId).val() !== true`;
  r.laborConfig.protectedStaff={'.read':owner};
  r.laborShiftHistory={'.read':owner,$sid:{$op:{'.write':`${owner} && !data.exists() && newData.exists()`,'.validate':"newData.hasChildren(['by','at','revision','months']) && newData.child('by').val() === auth.uid && newData.child('at').val() === now && newData.child('revision').val() === root.child('laborRecords').child($sid).child('revision').val()",months:{$month:{'.validate':"newData.parent().parent().parent().parent().parent().child('shifts').child($month).child('__laborRemoval/operationId').val() === $op && newData.parent().parent().parent().parent().parent().child('shifts').child($month).child('__laborRemoval/staffId').val() === $sid && root.child('shifts').child($month).child('__laborRemoval/operationId').val() !== $op",dates:{$date:{'.validate':"newData.child('value').val() === root.child('shifts').child($month).child($sid).child($date).val() && !newData.parent().parent().parent().parent().parent().parent().parent().child('shifts').child($month).child($sid).child($date).exists()"}}}}}}};
  r.laborNameClaims={'.read':owner,$name:{'.write':`${owner} && newData.isString() && (!data.exists() || newData.val() === data.val())`}};
  r.laborAccountBindings={'.read':owner,$sid:{'.write':`${owner} && newData.isString() && (!data.exists() || newData.val() === data.val())`,'.validate':"newData.parent().parent().child('portalAccess/users').child(newData.val()).child('staffId').val() === $sid"}};
  const binding="newData.parent().parent().parent().child('laborAccountBindings').child(newData.child('staffId').val()).val() === $uid";
  const targetRecord="root.child('laborRecords').child(newData.child('staffId').val()).child('data')";
  r.portalAccess.users.$uid['.write']+=` && (!(${enabled}) || (data.exists() && newData.child('staffId').val() === data.child('staffId').val() && newData.child('active').val() !== true) || (newData.child('role').val() === 'staff' && ${binding} && (${targetRecord}.child('status').val() === 'confirmed' || ${targetRecord}.child('status').val() === 'retiring') && newData.child('email').val() === ${targetRecord}.child('googleEmail').val()))`;
  const lp=r.staffLifecycle.$staffId;
  const previous=`newData.parent().parent().child('laborRecords').child($staffId).child('data/periods').child(newData.child('previousPeriod').val())`;
  lp['.validate']+=` && (newData.child('hrManaged').val() !== true || (newData.child('currentCancelled').val() === ${p}.child('cancelled').val() && (newData.child('previousPeriod').val() === '' ? (newData.child('previousStartAt').val() === 0 && newData.child('previousEndAt').val() === 0) : (${previous}.exists() && ${previous}.child('cancelled').val() === false && newData.child('previousStartAt').val() === ${previous}.child('startAt').val() && newData.child('previousEndAt').val() === ${previous}.child('endAt').val()))))`;
  lp.periods={$period:{'.validate':"newData.hasChildren(['startDate','endDate','startAt','endAt','cancelled'])"}};
  for(const k of ['startDate','startAt','endAt','cancelled','endDate']){
    const value=`newData.parent().parent().parent().parent().parent().child('laborRecords').child($staffId).child('data/periods').child($period).child('${k}').val()`;
    lp.periods.$period[k]={'.validate':`newData.val() === ${k==='endDate'?`(${value} === '' ? '9999-12-31' : ${value})`:value}`};
  }
  lp.periods.$period.$other={'.validate':false};
  for(const k of ['hrManaged','state','startAt','endAt','currentPeriod','currentCancelled','previousPeriod','previousStartAt','previousEndAt','revision','operationId','updatedBy','updatedAt'])lp[k]={'.validate':true};lp.$other={'.validate':false};
  const manual=r.shifts.$month.__manualTimes.$sid.$date;
  r.shifts.$month.__laborRemoval={'.validate':`newData.child('operationId').val() === data.child('operationId').val() || (${owner} && newData.child('revision').val() === root.child('laborRecords').child(newData.child('staffId').val()).child('revision').val() && (root.child('laborRecords').child(newData.child('staffId').val()).child('data/status').val() === 'retiring' || root.child('laborRecords').child(newData.child('staffId').val()).child('data/status').val() === 'cancelled'))`};
  const removalSid="newData.parent().parent().child('staffId').val()",oldRow=`root.child('shifts').child($month).child(${removalSid}).child($date)`,oldTime=`root.child('shifts').child($month).child('__manualTimes').child(${removalSid}).child($date)`;
  r.shifts.$month.__laborRemoval.dates={$date:{'.validate':`newData.parent().parent().child('operationId').val() === data.parent().parent().child('operationId').val() || (newData.child('value').val() === ${oldRow}.val() && !newData.parent().parent().parent().child(${removalSid}).child($date).exists() && ${['start','end','breakMinutes'].map(k=>`newData.child('manual/${k}').val() === ${oldTime}.child('${k}').val()`).join(' && ')})`}};
  manual['.validate']=manual['.validate'].replace('newData.val() === data.val()',"(newData.child('start').val() === data.child('start').val() && newData.child('end').val() === data.child('end').val() && newData.child('breakMinutes').val() === data.child('breakMinutes').val())");
  const metaRoot='newData.parent().parent().parent().parent().parent()';
  rec.data.documents.$doc={'.validate':`newData.child('hash').val() === ${metaRoot}.child('laborFiles').child($doc).child('hash').val() && newData.child('size').val() === ${metaRoot}.child('laborFiles').child($doc).child('size').val() && newData.child('mime').val() === ${metaRoot}.child('laborFiles').child($doc).child('mime').val() && ${metaRoot}.child('laborFiles').child($doc).child('staffId').val() === $sid`};
  // Rebuild the document mirror after applying the additional metadata validator.
  delete rec.data.documents.$k1;mirrorTree(rec.data.documents.$doc,'record',['documents','$doc']);
  const file=r.laborFiles.$doc;
  file['.validate']+=` && newData.child('hash').isString() && newData.child('hash').val().matches(/^[a-f0-9]{64}$/) && (newData.child('mime').val() === 'application/pdf' || newData.child('mime').val() === 'image/png' || newData.child('mime').val() === 'image/jpeg') && newData.child('base64').val().matches(/^[A-Za-z0-9+\/]*={0,2}$/) && newData.child('base64').val().length % 4 === 0 && newData.child('size').val() % 1 === 0 && newData.child('size').val() <= newData.child('base64').val().length / 4 * 3 && newData.child('size').val() > newData.child('base64').val().length / 4 * 3 - 3`;
  for(const k of ['size','mime','hash'])file['.validate']+=` && newData.child('${k}').val() === newData.parent().parent().child('laborRecords').child(newData.child('staffId').val()).child('data/documents').child($doc).child('${k}').val()`;
  for(const k of ['staffId','base64','mime','hash','size'])file[k]={'.validate':true};file.$other={'.validate':false};
  r.laborFileBudget['.validate']+=' && newData.child(\'used\').val() >= data.child(\'used\').val()';
  const punches=r.attendance.punches.$date.$staffId;
  punches['.write']+=` && (${me}.child('role').val() === 'admin' || root.child('staffLifecycle').child($staffId).child('hrManaged').val() !== true || (root.child('staffLifecycle').child($staffId).child('startAt').val() <= now && now < root.child('staffLifecycle').child($staffId).child('endAt').val()))`;
  return result;
}
export function localRules(){const base=JSON.parse(fs.readFileSync(new URL('./lifecycle-rule-baseline.json',import.meta.url)));return buildLaborRules(buildLifecycleRuleCandidate(base));}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='--local'){fs.mkdirSync('.labor-local',{recursive:true});fs.writeFileSync('.labor-local/database.rules.json',JSON.stringify(localRules(),null,2));}
  else {const [,,source,dest]=process.argv;if(!source||!dest)throw Error('適用中ルールの入力と候補の出力先が必要です。');fs.writeFileSync(dest,JSON.stringify(buildLaborRules(JSON.parse(fs.readFileSync(source))),null,2));}
}
