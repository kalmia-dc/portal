import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

// Review-only candidate. Not imported by the live app and never deployed here.
import {ownerFields} from '../incident-owner-policy.mjs';
export {ownerFields,ownerPayload} from '../incident-owner-policy.mjs';
export function buildCandidate(baseline){
 const next=structuredClone(baseline),branch=next.rules.meetingManagement.incidentReports.$reportId;
 if(Object.keys(branch).some(k=>k!=='.write'))throw Error('Unexpected existing incident child rules: review before merging');
 const member="root.child('portalAccess/users').child(auth.uid)";
 const report="root.child('meetingManagement/incidentReports').child($reportId)";
 const own=`auth != null && ${member}.child('active').val() === true && ${member}.child('role').val() !== 'terminal' && ${member}.child('staffId').isString() && ${report}.exists() && ${report}.child('createdById').val() === ${member}.child('staffId').val() && ${report}.child('reporterId').val() === ${member}.child('staffId').val()`;
 for(const field of ownerFields){
  let value="(!newData.exists() || newData.isString())";
  if(['occurredDate','details'].includes(field))value="newData.isString() && newData.val().length > 0";
  if(field==='type')value=`newData.isString() && (newData.val() === ${report}.child('type').val() || (${report}.child('type').val() !== 'review_required' && (newData.val() === 'near_miss' || newData.val() === 'accident')))`;
  if(field==='category')value="(!newData.exists() || newData.hasChildren())";
  if(field==='overview')value='!newData.exists()';
  if(field==='updatedAt')value='newData.isNumber() && newData.val() <= now';
  if(field==='updatedBy')value=`newData.isString() && newData.val() === ${member}.child('name').val()`;
  branch[field]={'.write':`(${own}) && (${value})`};
 }
 return next;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Provide latest baseline and local output');
 fs.writeFileSync(output,JSON.stringify(buildCandidate(JSON.parse(fs.readFileSync(input,'utf8'))),null,2)+'\n');
}
