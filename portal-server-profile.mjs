// Direct REST read: no SDK cache fallback. The existing ID token is used only
// for this HTTPS request. Never log tokens, raw URLs or underlying fetch errors.
import {portalDiagnostics,classify} from "./portal-auth-diagnostic.mjs";
export async function readServerProfile({ databaseURL, user, fetchImpl=fetch, timeoutMs=10000, path, onServerTime, diagnostic=portalDiagnostics.emit }) {
  const note=(reason,status)=>{try{diagnostic('RESUME_VERIFY',reason,status);}catch{}};note('START');
  const controller=new AbortController();
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},timeoutMs);});
  try {
    const request=async()=>{
    const token=await user.getIdToken();
    if(controller.signal.aborted) throw Error('timeout');
    const url=new URL(`${path||'portalAccess/users/'+encodeURIComponent(user.uid)}.json`,databaseURL.replace(/\/?$/,'/'));
    url.searchParams.set('auth',token);
    const response=await fetchImpl(url.toString(),{method:'GET',cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
    if(response.status===401 || response.status===403){note('PERMISSION_DENIED',response.status);throw Object.assign(Error('Access denied'),{code:'access-denied'});}
    if(!response.ok){note('UNCLASSIFIED',response.status>=500?'5xx':undefined);throw Error('unavailable');}
    const serverDate=Date.parse(response.headers?.get('date')||'');if(Number.isFinite(serverDate))onServerTime?.(serverDate);
    const data=await response.json();note('OK');return data;
    };
    return await Promise.race([request(),timeout]);
  } catch(error) {
    note(classify(error));
    const denied=error?.code==='access-denied' || ['auth/user-disabled','auth/user-token-expired','auth/invalid-user-token'].includes(error?.code);
    throw Object.assign(Error(denied?'利用許可を確認できません。':'サーバーと通信できません。再試行します。'),{code:denied?'access-denied':'connection-unavailable'});
  } finally { clearTimeout(timer); }
}
