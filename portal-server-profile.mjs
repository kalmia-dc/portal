// Direct REST read: no SDK cache fallback. The existing ID token is used only
// for this HTTPS request. Never log tokens, raw URLs or underlying fetch errors.
export async function readServerProfile({ databaseURL, user, fetchImpl=fetch, timeoutMs=10000 }) {
  const controller=new AbortController();
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},timeoutMs);});
  try {
    const request=async()=>{
    const token=await user.getIdToken();
    if(controller.signal.aborted) throw Error('timeout');
    const url=new URL(`portalAccess/users/${encodeURIComponent(user.uid)}.json`,databaseURL.replace(/\/?$/,'/'));
    url.searchParams.set('auth',token);
    const response=await fetchImpl(url.toString(),{method:'GET',cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
    if(response.status===401 || response.status===403) throw Object.assign(Error('Access denied'),{code:'access-denied'});
    if(!response.ok) throw Error('unavailable');
    return await response.json();
    };
    return await Promise.race([request(),timeout]);
  } catch(error) {
    const denied=error?.code==='access-denied' || ['auth/user-disabled','auth/user-token-expired','auth/invalid-user-token'].includes(error?.code);
    throw Object.assign(Error(denied?'利用許可を確認できません。':'サーバーと通信できません。再試行します。'),{code:denied?'access-denied':'connection-unavailable'});
  } finally { clearTimeout(timer); }
}
