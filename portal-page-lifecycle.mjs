// Page-owned work ends permanently on access loss. Network suspension is handled
// separately by portal-auth: it must not destroy forms or revive a stopped page.
export function createPageLifecycle({target=globalThis.window, schedule=setTimeout, cancel=clearTimeout, repeat=setInterval, cancelRepeat=clearInterval}={}) {
  let active=target?.portalAccessLost!==true;
  const cleanups=new Set();
  const safely=fn=>{try{fn();}catch(error){console.error('Page cleanup failed',error);}};
  const add=cleanup=>{
    let pending=true;
    const once=()=>{if(!pending)return;pending=false;cleanups.delete(once);safely(cleanup);};
    if(active)cleanups.add(once);else once();
    return once;
  };
  const guard=fn=>function(...args){
    if(!active)return;
    const result=fn?.apply(this,args);
    // A revoked async handler may still finish its already-started read. Only
    // our explicit cancellation is quiet; real failures keep their semantics.
    return result?.catch ? result.catch(error=>{if(active||error?.code!=='portal/access-lost')throw error;}) : result;
  };
  const stop=()=>{if(!active)return;active=false;for(const cleanup of [...cleanups])cleanup();target?.removeEventListener?.('portalAccessLost',stop);};
  if(active)target?.addEventListener?.('portalAccessLost',stop,{once:true});
  return {
    get active(){return active;},add,guard,stop,
    assertActive(){if(!active){const error=new Error('Portal access ended');error.code='portal/access-lost';throw error;}},
    timeout(fn,ms){if(!active)return;let release;const id=schedule(guard(()=>{release?.();return fn();}),ms);release=add(()=>cancel(id));return id;},
    interval(fn,ms){if(!active)return;const id=repeat(guard(fn),ms);add(()=>cancelRepeat(id));return id;},
  };
}
