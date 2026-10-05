// Read-only adapter for the atomic category + __manualTimes month record.
(function(root){
  function manualTime(month, sid, day) {
    const key=month?.[sid]?.[day], t=month?.__manualTimes?.[sid]?.[day];
    if(!t || !['early','late','fixed','admin','hanowa'].includes(key) || t.key!==key) return null;
    const valid=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v||'');
    if(!valid(t.start)||!valid(t.end)||t.breakMinutes===''||t.breakMinutes==null) return null;
    const minutes=v=>Number(v.slice(0,2))*60+Number(v.slice(3));
    const elapsed=minutes(t.end)-minutes(t.start), rest=Number(t.breakMinutes);
    if(elapsed<=0||!Number.isInteger(rest)||rest<0||rest>=elapsed) return null;
    return {start:t.start,end:t.end,breakMinutes:rest,workMinutes:elapsed-rest};
  }
  function resolve(month,sid,day,defaults) {
    const key=month?.[sid]?.[day]||'';
    return {...(defaults[key]||{label:key||'未設定',workMinutes:0}),...manualTime(month,sid,day)};
  }
  root.PortalShiftTime=Object.freeze({manualTime,resolve});
})(globalThis);
