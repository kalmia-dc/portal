// Generate only incident-specific rules; preserve the current roster/lifecycle and other products.
const fs=require('node:fs');
const file=process.argv[2]||'database.rules.json';
const rules=JSON.parse(fs.readFileSync(file,'utf8'));
const m=rules.rules.meetingManagement;
const active=m.incidentReports['.read'];
const profile="root.child('portalAccess/users').child(auth.uid)";
const sid=`${profile}.child('staffId').val()`;
const staff=`(${active}) && ${profile}.child('role').val() !== 'terminal'`;
const manager=`(${staff}) && (${profile}.child('role').val() === 'admin' || ${sid} === 'momo' || ${sid} === 'yamada')`;
const base="root.child('meetingManagement/incidentV2')";
const fields=['owner','payload','revision','state','submittedAt','updatedAt','actor','action','reason','review','reviewer','reviewedAt','legacy','legacyKey','linkedTaskId','linkedNoticeId','basis','legacyType','legacyLevel','linkedOriginals','counterStatus','countermeasure','importedBy','importedAt'];
const publicFields=fields.filter(k=>!['reason','legacy','linkedOriginals'].includes(k));
const same=(a,b,keys=fields)=>keys.map(k=>`${a}.child('${k}').val() === ${b}.child('${k}').val()`).join(' && ');
const r=newData=>`${newData}.parent().parent().child('records').child($id)`;
const ownerAccess=`((${manager}) || ((${staff}) && ${base}.child('records').child($id).child('owner').val() === ${sid}))`;
const fullFields=Object.fromEntries(fields.map(k=>[k,{'.validate':(['revision','submittedAt','updatedAt','reviewedAt','importedAt'].includes(k)?'newData.isNumber()':"newData.isString()")}]));
const old="root.child('meetingManagement/incidentReports').child(newData.child('legacyKey').val())";
const preservedOld=key=>`newData.child('${key}').val() === (${old}.child('${key}').exists() ? ${old}.child('${key}').val() : '${key==='counterStatus'?'pending':''}')`;
const recordV=[
...['legacyType','legacyLevel'].map(k=>{const source=k==='legacyType'?'type':'level';return `(data.exists() ? newData.child('${k}').val() === data.child('${k}').val() : newData.child('${k}').val() === (${old}.child('${source}').exists() ? ${old}.child('${source}').val() : ''))`;}),
`(data.exists() ? newData.child('importedBy').val() === data.child('importedBy').val() && newData.child('importedAt').val() === data.child('importedAt').val() : ((newData.child('importedBy').val() === '' && newData.child('importedAt').val() === 0) || (newData.child('importedBy').val() === ${sid} && newData.child('importedAt').val() === now) || (newData.child('importedBy').val() === ${base}.child('drafts').child(newData.child('owner').val()).child($id).child('importedBy').val() && newData.child('importedAt').val() === ${base}.child('drafts').child(newData.child('owner').val()).child($id).child('importedAt').val())))`,
...['tasks','notices'].map(kind=>{const key=kind==='tasks'?'linkedTaskId':'linkedNoticeId';return `(newData.child('${key}').val() === '' || (newData.parent().parent().parent().child('${kind}').child(newData.child('${key}').val()).child('sourceIncidentWithdrawn').val() === true) === (newData.child('state').val() === 'withdrawn'))`;}),
`(data.exists() || (newData.child('legacyKey').val() === '' ? newData.child('basis').val() === 'nho2020' && newData.child('legacy').val() === '' : ${old}.exists() && $id === 'legacy_' + newData.child('legacyKey').val() && newData.child('basis').val() === 'legacy' && !newData.parent().parent().parent().child('incidentReports').child(newData.child('legacyKey').val()).exists() && ((${manager}) || (${old}.child('reporterId').val() === ${sid} && ${old}.child('createdById').val() === ${sid}))))`,
`((${manager}) || (newData.child('linkedOriginals').val() === (data.exists() ? data.child('linkedOriginals').val() : '') && (!data.exists() ? (newData.child('legacyKey').val() !== '' ? ${['counterStatus','countermeasure','linkedTaskId','linkedNoticeId'].map(preservedOld).join(' && ')} : newData.child('counterStatus').val() === 'pending' && newData.child('countermeasure').val() === '' && newData.child('linkedTaskId').val() === '' && newData.child('linkedNoticeId').val() === '') : newData.child('counterStatus').val() === data.child('counterStatus').val() && newData.child('countermeasure').val() === data.child('countermeasure').val() && newData.child('linkedTaskId').val() === data.child('linkedTaskId').val() && newData.child('linkedNoticeId').val() === data.child('linkedNoticeId').val())))`,
`(newData.child('counterStatus').val() !== 'confirmed' || data.child('counterStatus').val() === 'confirmed' || (!data.exists() && ${old}.child('counterStatus').val() === 'confirmed') || ${profile}.child('role').val() === 'admin' || ${sid} === 'sugihira')`,
 `newData.hasChildren(${JSON.stringify(fields)})`,
 `newData.child('payload').val().length <= 100000`,
 `newData.child('legacy').val().length <= 300000`,
 `newData.child('owner').val().matches(/^[A-Za-z0-9_-]{1,100}$/)`,
 `newData.child('actor').val() === ${sid}`,
 `newData.child('updatedAt').val() === now`,
 `newData.child('revision').val() === (data.exists() ? data.child('revision').val() + 1 : 1)`,
 `(data.exists() ? newData.child('submittedAt').val() === data.child('submittedAt').val() : (newData.child('legacyKey').val() === '' ? newData.child('submittedAt').val() === now : (newData.child('submittedAt').val() === root.child('meetingManagement/incidentReports').child(newData.child('legacyKey').val()).child('createdAt').val() || newData.child('submittedAt').val() === root.child('meetingManagement/incidentReports').child(newData.child('legacyKey').val()).child('importedAt').val() || newData.child('submittedAt').val() === 0)))`,
 `(newData.child('state').val() === 'submitted' || newData.child('state').val() === 'withdrawn')`,
 `(!data.exists() ? (newData.child('state').val() === 'submitted' || (newData.child('state').val() === 'withdrawn' && (${manager}) && newData.child('legacyKey').val() !== '' && newData.child('reason').val().length > 0)) : (data.child('state').val() === newData.child('state').val() || ((${manager}) && newData.child('reason').val().length > 0)))`,
 `(!data.exists() || (newData.child('owner').val() === data.child('owner').val() || ((${manager}) && newData.child('reason').val().length > 0)))`,
 `(!data.exists() || (newData.child('legacy').val() === data.child('legacy').val() && newData.child('legacyKey').val() === data.child('legacyKey').val() && newData.child('basis').val() === data.child('basis').val()))`,
 `((newData.child('review').val() === 'pending' && newData.child('reviewer').val() === '' && newData.child('reviewedAt').val() === 0) || (newData.child('review').val() === 'confirmed' && (((${manager}) && newData.child('reviewer').val() === ${sid} && newData.child('reviewedAt').val() === now) || (data.exists() && newData.child('payload').val() === data.child('payload').val() && newData.child('review').val() === data.child('review').val() && newData.child('reviewer').val() === data.child('reviewer').val() && newData.child('reviewedAt').val() === data.child('reviewedAt').val()))))`,
 same('newData',"newData.parent().parent().child('history').child($id).child('r' + newData.child('revision').val())"),
 `(newData.child('state').val() === 'withdrawn' ? !newData.parent().parent().child('feed').child($id).exists() : (${same('newData',"newData.parent().parent().child('feed').child($id)",publicFields)}))`,
 `newData.parent().parent().child('owners').child(newData.child('owner').val()).child($id).val() === true`,
 `(!data.exists() || data.child('owner').val() === newData.child('owner').val() || !newData.parent().parent().child('owners').child(data.child('owner').val()).child($id).exists())`,
];
m.incidentV2={
 records:{'.read':manager,'$id':{'.read':ownerAccess,'.write':`(${staff}) && newData.exists() && ((${manager}) || (data.exists() ? data.child('owner').val() === ${sid} && data.child('state').val() === 'submitted' : newData.child('owner').val() === ${sid}))`,'.validate':recordV.join(' && '),...fullFields,'$other':{'.validate':false}}},
 feed:{'.read':active,'$id':{'.write':`(${staff}) && ((${manager}) || ${sid} === ${base}.child('records').child($id).child('owner').val() || (!${base}.child('records').child($id).exists() && newData.child('owner').val() === ${sid})) && (newData.exists() ? (${r('newData')}.child('state').val() === 'submitted' && (${same('newData',r('newData'),publicFields)})) : ((${manager}) && ${r('newData')}.child('state').val() === 'withdrawn'))`,...Object.fromEntries(publicFields.map(k=>[k,fullFields[k]])),'$other':{'.validate':false}}},
 history:{'$id':{'.read':ownerAccess,'$rev':{'.write':`(${staff}) && !data.exists() && newData.exists() && ((${manager}) || ${sid} === ${base}.child('records').child($id).child('owner').val() || (!${base}.child('records').child($id).exists() && newData.child('owner').val() === ${sid}))`,'.validate':`$rev === 'r' + newData.child('revision').val() && (${same('newData',"newData.parent().parent().parent().child('records').child($id)")})`,...fullFields,'$other':{'.validate':false}}}},
 owners:{'.read':manager,'$owner':{'.read':`(${staff}) && $owner === ${sid}`,'$id':{'.write':`(${staff}) && ((${manager}) || $owner === ${sid}) && (newData.exists() ? (newData.val() === true && newData.parent().parent().parent().child('records').child($id).child('owner').val() === $owner) : ((${manager}) && newData.parent().parent().parent().child('records').child($id).child('owner').val() !== $owner))`}}},
 drafts:{'$owner':{'.read':`(${staff}) && $owner === ${sid}`,'$id':{'.write':`(${staff}) && ($owner === ${sid} || ((${manager}) && !data.exists() && newData.exists()))`,'.validate':`newData.hasChildren(['owner','payload','revision','updatedAt','actor']) && newData.child('owner').val() === $owner && newData.child('payload').isString() && newData.child('payload').val().length <= 100000 && newData.child('revision').val() === (data.exists() ? data.child('revision').val()+1 : 1) && newData.child('actor').val() === ${sid} && newData.child('updatedAt').val() === now`,'$other':{'.validate':false},...Object.fromEntries(['owner','payload','revision','updatedAt','actor'].map(k=>[k,{}]))}}},
};
// Legacy content is preserved until an explicit versioned edit/withdrawal moves it.
const draftRule=m.incidentV2.drafts.$owner.$id;
draftRule['.validate']+=` && newData.hasChildren(['importedBy','importedAt']) && (data.exists() ? (newData.child('importedBy').val() === data.child('importedBy').val() && newData.child('importedAt').val() === data.child('importedAt').val()) : ((newData.child('importedBy').val() === '' && newData.child('importedAt').val() === 0) || (newData.child('importedBy').val() === ${sid} && newData.child('importedAt').val() === now)))`;
draftRule.importedBy={'.validate':'newData.isString()'};
draftRule.importedAt={'.validate':'newData.isNumber()'};
const legacy=m.incidentReports.$reportId;
legacy['.write']=`((${manager}) || ((${staff}) && data.child('reporterId').val() === ${sid} && data.child('createdById').val() === ${sid})) && data.exists() && !newData.exists() && newData.parent().parent().child('incidentV2/records').child('legacy_' + $reportId).child('legacyKey').val() === $reportId`;
for(const key of Object.keys(legacy))if(!key.startsWith('.'))delete legacy[key];
// Existing follow-up operations stay usable; identity/content changes use the versioned route.
for(const key of ['counterStatus','countermeasure','confirmedAt','confirmedBy','confirmedById','updatedAt','updatedBy','linkedTaskId','linkedNoticeId','routedAt','routedBy'])legacy[key]={'.write':manager};
fs.writeFileSync(file,JSON.stringify(rules,null,2)+'\n');
