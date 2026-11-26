// Do not read notices (which contain inline image bytes) for unrelated tabs.
export function createNoticeLoader({subscribe,receive,failed,isActive}){
 let status='idle';
 return {
  get status(){return status;},
  start(){
   if(!isActive()||status==='loading'||status==='ready')return false;
   status='loading';
   try { subscribe(snapshot=>{if(!isActive())return;status='ready';receive(snapshot);},()=>{
    if(!isActive())return;status='error';failed();
   }); }catch {status='error';failed();}
   return true;
  }
 };
}
export function isInitialNoticeLink(search,canSee){
 const p=new URLSearchParams(search);
 return canSee&&p.get('caseKind')==='notices'&&Boolean(p.get('caseId'));
}