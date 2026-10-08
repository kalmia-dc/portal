// Only a current server response can unlock a suspended page. Cached SDK
// notifications may invalidate access, but can never resume it.
export function watchPortalSession({ subscribe, subscribeAuth, subscribeConnection, userId, initial, normalize, invalidate, suspend, verify, resume, verifying=()=>{}, retryLater=setTimeout, cancelRetry=clearTimeout }) {
  let stopped=false,suspended=false,connected,epoch=0,retry,attempt=0;
  const same=raw=>{const next=normalize(raw);return next && JSON.stringify(next)===JSON.stringify(initial);};
  const stop=reason=>{if(!stopped){stopped=true;epoch++;cancelRetry(retry);invalidate(reason);}};
  async function check(version) {
    if(stopped || version!==epoch || !connected) return;
    verifying();
    try {
      const raw=await verify();
      if(stopped || version!==epoch || !connected) return;
      if(!same(raw)) {stop('changed');return;}
      suspended=false;attempt=0;resume();
    } catch(error) {
      if(stopped || version!==epoch || !connected) return;
      if(error?.code==='access-denied') {stop('access-denied');return;}
      retry=retryLater(()=>{void check(version);},Math.min(1000*2**attempt++,15000));
    }
  }
  const offProfile=subscribe(raw=>{if(!same(raw))stop('changed');},()=>stop('read-failed'));
  const offAuth=subscribeAuth(user=>{if(user?.uid!==userId)stop('signed-out');});
  const offConnection=subscribeConnection(value=>{
    if(stopped || value===connected) return;
    connected=value;epoch++;cancelRetry(retry);
    if(!connected){suspended=true;suspend();}
    else if(suspended){attempt=0;void check(epoch);}
  });
  return ()=>{stopped=true;epoch++;cancelRetry(retry);offProfile();offAuth();offConnection();};
}
