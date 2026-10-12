// Re-evaluate on a monotonic timer and after a sleeping tab resumes. The supplied
// clock is based on a Firebase server offset; rules remain authoritative.
export function watchLaborBoundary({readState,emit,clock,listenResume,schedule=setTimeout,cancel=clearTimeout}){
  let timer,closed=false;
  function check(){if(closed)return;cancel(timer);emit();const s=readState(),now=clock(),end=s?.hrManaged?Math.min(...[s.startAt,s.endAt,s.previousStartAt,s.previousEndAt].filter(t=>t>now)):Infinity;timer=schedule(check,Math.max(1,Math.min(30000,end-now+1)));}
  const off=listenResume(check);check();return ()=>{closed=true;cancel(timer);off();};
}
