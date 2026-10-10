export const ownerFields=['type','occurredDate','occurredTime','occurredAtText','entryDate','discovererName','verifierName','occurredPlace','workContent','categoryText','category','level','overview','scene','eventImpact','details','goodPoint','causeHuman','causeEnvironment','handoff','updatedAt','updatedBy'];
export function ownerPayload(payload){return Object.fromEntries(Object.entries(payload).filter(([key])=>ownerFields.includes(key)));}
export function canEditOwnIncident(report,profile){
 return Boolean(profile?.staffId && profile.portalRole !== 'terminal' && report?.createdById === profile.staffId && report?.reporterId === profile.staffId);
}
