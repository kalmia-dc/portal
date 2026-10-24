// Exact verified IDs; never infer a person's identity from a name or employment type.
globalThis.PortalStaffUsage = Object.freeze({
 canUseStaff(id,usage='business') {
  if(id==='test')return usage==='attendance';
  if(id==='hanowa')return usage==='attendance'||usage==='shift';
  return true;
 },
 canAssignStaff(id,previousIds=[]) {return this.canUseStaff(id)||previousIds.includes(id);}
});
