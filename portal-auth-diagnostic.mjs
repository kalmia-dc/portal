// Local, bounded, allowlisted diagnostics. Never retain input errors or profiles.
const stages=new Set(['AUTH_INITIAL','PROFILE','STAFF_STATE','RESUME_VERIFY','MEMBER_LIST','SESSION']);
const reasons=new Set(['START','OK','AUTH_ABSENT','AUTH_CHANGED','PROFILE_CHANGED','PERMISSION_DENIED','NETWORK_UNAVAILABLE','ABORTED','TIMEOUT','UNCLASSIFIED','SUSPENDED','INVALIDATED','DISPOSED']);
export function classify(error){
 const c=typeof error?.code==='string'?error.code.toLowerCase():'';
 if(['permission_denied','permission-denied','access-denied'].includes(c))return 'PERMISSION_DENIED';
 if(error?.name==='AbortError')return 'ABORTED';
 if(error?.message==='timeout')return 'TIMEOUT';
 if(['connection-unavailable','network-request-failed','auth/network-request-failed'].includes(c)||error instanceof TypeError)return 'NETWORK_UNAVAILABLE';
 return 'UNCLASSIFIED';
}
export function createDiagnostics(clock=()=>new Date().toISOString()){
 const records=[];let sequence=0;
 const emit=(stage,reason,status)=>{
  if(!stages.has(stage)||!reasons.has(reason))return;
  const time=clock();
  records.push({sequence:++sequence,time:/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(time)?time:null,stage,reason,statusClass:[401,403,'5xx'].includes(status)?status:'none'});
  if(records.length>100)records.shift();
 };
 return {emit,snapshot:()=>records.map(r=>({...r}))};
}
export const portalDiagnostics=createDiagnostics();
export async function diagnosticRead(stage,read){
 portalDiagnostics.emit(stage,'START');
 try{const value=await read();portalDiagnostics.emit(stage,'OK');return value;}
 catch(error){portalDiagnostics.emit(stage,classify(error));throw error;}
}
