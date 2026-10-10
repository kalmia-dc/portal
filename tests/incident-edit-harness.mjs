import fs from 'node:fs';
import vm from 'node:vm';
import {canEditOwnIncident,ownerPayload} from '../incident-owner-policy.mjs';
const html=fs.readFileSync('meeting-management.html','utf8');
export function harness(role='admin',leader=false){
 const fields=Object.fromEntries(Object.entries({reportNumber:'TEST-1',type:'near_miss',occurredDate:'2026-10-10',details:'未保存の架空入力'}).map(([key,value])=>[key,{dataset:{field:key},value}]));
 const button={disabled:false};const panel={hidden:false,dataset:{incidentEditPanel:'one'},querySelectorAll:()=>Object.values(fields),querySelector:()=>button};
 const report={id:'one',createdById:'author',reporterId:'author',type:'near_miss'};const messages=[];let writes=0;
 const context=vm.createContext({Map,Set,Object,Date,canEditOwnIncident,ownerPayload,authenticatedProfile:{portalRole:role,staffId:'author'},currentUser:{staffId:'author',name:'架空'},state:{incidentReports:[report]},canManageIncidentReport:()=>role==='admin'||leader,isDirector:()=>role==='admin',isLeader:()=>leader,incidentTypeKey:()=>report.type,canChangeIncidentType:()=>true,buildIncidentReportNumber:()=>'',formatIncidentOccurredAt:()=>'',parseCategoryCodes:()=>[],cssEscape:x=>x,showToast:x=>messages.push(x),db:{},PATHS:{incidentReports:'reports'},ref:(_,p)=>p,update:async()=>{writes++},document:{querySelectorAll:()=>[panel],querySelector:q=>q.includes('data-action')?button:fields[/data-field="([^"]+)"/.exec(q)?.[1]]||{value:''}}});
 const run=s=>vm.runInContext(s,context);
 run('const incidentEditDrafts=new Map(),incidentEditSaving=new Set();');
 run(html.slice(html.indexOf('function rememberIncidentEdits()'),html.indexOf('function renderIncidentReports()')));
 run(html.slice(html.indexOf('function canEditIncidentReport('),html.indexOf('function canChangeIncidentType(')));
 run(html.slice(html.indexOf('async function saveIncidentReportEdit('),html.indexOf('async function saveIncidentFollowup(')));
 return {run,context,fields,panel,button,messages,writes:()=>writes};
}
