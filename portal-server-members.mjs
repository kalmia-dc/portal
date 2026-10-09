// Admin-authorized read only; no SDK cache fallback and no token logging.
export async function readServerMembers({databaseURL,user,fetchImpl=fetch,timeoutMs=10000}){
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},timeoutMs)});
  try{
    if(!user)throw Error('signed-out');
    return await Promise.race([(async()=>{
      const token=await user.getIdToken();if(controller.signal.aborted)throw Error('timeout');
      const url=new URL('portalAccess/users.json',databaseURL.replace(/\/?$/,'/'));url.searchParams.set('auth',token);
      const response=await fetchImpl(url.toString(),{method:'GET',cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok)throw Error('unavailable');
      const data=await response.json();
      if(data!==null&&(typeof data!=='object'||Array.isArray(data)))throw Error('invalid-data');
      return data||{};
    })(),timeout]);
  }catch{throw Error('メンバーの最新の許可状態を確認できません。接続と管理者権限を確認してください。');}
  finally{clearTimeout(timer);}
}
