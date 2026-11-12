import {createOnboardingService} from '../onboarding-functions/service.mjs';

export const staff = {
  doctor:{period:'p1',role:'DR',name:'架空 医師',uid:'doctor'},
  hygienist:{period:'p1',role:'DH',name:'架空 衛生士',uid:'hygienist'},
  assistant:{period:'p1',role:'DA',name:'架空 助手',uid:'assistant'},
};
export const people = {
  ...Object.fromEntries(Object.keys(staff).map(uid=>[uid,{uid,staffId:uid}])),
  director:{uid:'director',staffId:'director',reviewer:true},
  payroll:{uid:'payroll',staffId:'payroll',reviewer:true},
  hr:{uid:'hr',staffId:'hr',reviewer:true},
};
export const png = {type:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+W8h0AAAAASUVORK5CYII='};

export function fixture({preopened=true,startsAt}={}) {
  const config={enabled:true,vaultEnabled:true,vaultReaders:{director:true,payroll:true}};
  const enrolled=new Map(preopened?Object.entries(staff).map(([id,c])=>[id+'/'+c.period,{role:c.role}]):[]);
  const records=new Map();
  const logs=[];
  const id=path=>[path.staff,path.period,path.key].join('/');
  const service=createOnboardingService({
    config:async()=>config,now:()=>Date.now(),
    eligible:async()=>Object.entries(staff).map(([key,c])=>({staff:key,period:c.period,role:c.role,name:c.name,opened:enrolled.has(key+'/'+c.period)})),
    candidate:async key=>staff[key]?{...staff[key],startAt:startsAt}:null,
    enrollment:async (key,period)=>enrolled.get(key+'/'+period),
    assign:async (key,period,data)=>{if(!enrolled.has(key+'/'+period)) enrolled.set(key+'/'+period,data);},
    enablePrehireVault:async (key,period,by)=>{enrolled.get(key+'/'+period).prehireVault={by};},
    metadata:async path=>records.get(id(path))?.metadata||null,
    body:async (path,record)=>record?structuredClone(records.get(id(path)).body):{},
    write:async (path,record,metadata,body)=>{
      const old=records.get(id(path));
      if(old?.metadata?.revision!==record?.revision) throw Error('同時に更新されました。');
      records.set(id(path),{metadata:structuredClone(metadata),body:structuredClone(body??old?.body??{})});
    },
    audit:async (path,uid,event,revision)=>logs.push({uid,event,revision}),
  });
  return {service,records,logs,config};
}
