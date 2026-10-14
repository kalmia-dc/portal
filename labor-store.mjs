import {draftEmployee,recordUpdate,lifecycleProjection,removeReviewedShifts,key,text,canonical} from './labor-model.mjs';
import {approvalUpdates} from './portal-join-model.mjs';
import {joinNameKey} from './portal-join-model.mjs';
import {lifecycleProtection} from './portal-lifecycle-model.mjs';
import {staffNameKey} from './portal-roster-model.mjs';
import {canImportStaff} from './labor-import-policy.mjs';
export function hydrate(record) {if(!record)return null;const data=record.data;for(const k of ['periods','salaries','insurance','tasks','documents'])data[k]??={};return record;}
export function createLaborStore(port, actor, defaults=[]) {
  const read=async path=>await port.read(path);
  async function authorize(){if(!actor?.uid||await read('laborConfig/owners/'+actor.uid)!==true||await read('laborConfig/enabled')!==true)throw Error('労務管理の利用許可を確認できません。');}
  async function list(){await authorize();return Object.fromEntries(Object.entries(await read('laborRecords')||{}).map(([id,r])=>[id,hydrate(r)]));}
  async function roster(){const entries=new Map(defaults.map(x=>[x.id,x]));for(const s of Object.values(await read('extra_staff')||{}))entries.set(s.id,s);return [...entries.values()];}
  async function save(data, expectedRevision, operationId, {reflect=false,file=null}={}) {
    reflect=reflect||data.status!=='draft';
    await authorize();key(data.staffId);key(operationId);
    const path='laborRecords/'+data.staffId,current=await read(path);
    if(current?.operationId===operationId)return hydrate(current);
    const timestamp=port.timestamp();
    const next=recordUpdate(current,data,actor,operationId,timestamp,expectedRevision);
    const updates={[path]:next,['laborHistory/'+data.staffId+'/'+operationId]:{previousOperationId:current?.operationId||'',after:data,by:actor.uid,at:timestamp}};
    if(reflect){
      const users=await read('portalAccess/users')||{},all=await roster();
      const reason=lifecycleProtection(actor,{id:data.staffId},users);if(reason)throw Error(reason);
      if(all.some(s=>s.id!==data.staffId&&staffNameKey(s.name)===staffNameKey(data.basic.name)))throw Error('同名の名簿があります。既存職員との対応を確認してください。');
      const oldLife=await read('staffLifecycle/'+data.staffId);
      updates['staffLifecycle/'+data.staffId]=lifecycleProjection(data,oldLife,operationId,actor,timestamp);
      const oldRoster=all.find(s=>s.id===data.staffId)||{};
      updates['extra_staff/'+data.staffId]={id:data.staffId,name:data.basic.name,role:data.role,type:data.type,...(oldRoster.satFixed?{satFixed:true}:{}),...(oldRoster.uketsuke?{uketsuke:true}:{})};
      updates['laborNameClaims/'+joinNameKey(data.basic.name)]=data.staffId;
    }
    if(file){
      if(await read('laborConfig/uploadsEnabled')!==true)throw Error('本番の無料枠確認前のため書類保存は無効です。');
      const [budget,maxBytes,maxEncoded]=await Promise.all(['laborFileBudget','laborConfig/maxFileBytes','laborConfig/maxEncodedBytes'].map(read));
      if(file.size>maxBytes)throw Error('1件の保存上限を超えています。原本は事務関連に残してください。');
      if(!budget||budget.used+file.base64.length>maxEncoded)throw Object.assign(Error('容量不足で未保存'),{code:'capacity'});
      updates['laborFiles/'+file.id]={staffId:data.staffId,base64:file.base64,mime:file.mime,hash:file.hash,size:file.size};
      updates.laborFileBudget={used:budget.used+file.base64.length,revision:budget.revision+1,lastDocument:file.id};
    }
    try {await port.update(updates);} catch(error) {
      // Lost acknowledgement is not a failed commit: confirm by the same operation ID.
      const saved=await read(path).catch(()=>null);if(saved?.operationId===operationId)return hydrate(saved);
      throw error;
    }
    const saved=await read(path);if(saved?.operationId!==operationId)throw Error('保存結果を確認できません。再読み込みしてください。');return hydrate(saved);
  }
  async function importStaff(){await authorize();const existing=await list();let count=0;for(const s of await roster()){if(!canImportStaff(s)||existing[s.id])continue;const data=draftEmployee({...s,imported:true});await save(data,0,'import-'+s.id);count++;}return count;}
  async function matchAccount(data, request) {
    await authorize();const stored=hydrate(await read('laborRecords/'+data.staffId));
    if(!stored||stored.data.status==='draft'||stored.data.status==='cancelled')throw Error('入社確定後に照合してください。');
    if(text(request.email).toLowerCase()!==text(stored.data.googleEmail).toLowerCase())throw Error('Googleメールが一致しません。');
    const current=await read('portalJoinRequests/'+request.uid),member=await read('portalAccess/users/'+request.uid),all=await roster();
    const users=await read('portalAccess/users')||{};
    if(Object.entries(users).some(([uid,m])=>uid!==request.uid&&m.staffId===data.staffId))throw Error('別のGoogleアカウントと紐付いています。対応の確認が必要です。');
    if(Object.entries(users).some(([uid,m])=>uid!==request.uid&&m.email?.toLowerCase()===request.email.toLowerCase()))throw Error('別のアカウントで登録済みのメールです。');
    const updates=approvalUpdates({actor,expected:request,current,selection:{mode:'existing',staffId:data.staffId,name:stored.data.basic.name,role:stored.data.role},roster:all,member,timestamp:port.timestamp()});
    if(updates){updates['laborAccountBindings/'+data.staffId]=request.uid;await port.update(updates);}
    const saved=await read('portalAccess/users/'+request.uid);if(saved?.staffId!==data.staffId)throw Error('アカウントの紐付けを確認できません。');
  }
  async function removeShifts(data,rows){
    await authorize();const fresh=hydrate(await read('laborRecords/'+data.staffId));
    if(canonical(fresh?.data.periods)!==canonical(data.periods))throw Error('在籍期間が更新されています。再確認してください。');
    const updates={},operationId=crypto.randomUUID(),months=[...new Set(rows.map(x=>x.month))];
    if(!rows.length)throw Error('解除するシフトがありません。');
    for(const month of months){const selected=rows.filter(x=>x.month===month),[locked,current]=await Promise.all([read('shift_locks/'+month.replaceAll('-','_')),read('shifts/'+month)]);removeReviewedShifts(current,selected,data.staffId,locked);
      for(const row of selected){updates[`shifts/${month}/${data.staffId}/${row.date}`]=null;updates[`shifts/${month}/__manualTimes/${data.staffId}/${row.date}`]=null;updates[`shifts/${month}/__laborPeriods/${data.staffId}/${row.date}`]=null;}
      updates[`shifts/${month}/__laborRemoval`]={staffId:data.staffId,revision:fresh.revision,operationId,dates:Object.fromEntries(selected.map(row=>[row.date,{value:row.value,manual:row.manual}]))};
    }
    updates[`laborShiftHistory/${data.staffId}/${operationId}`]={by:actor.uid,at:port.timestamp(),revision:fresh.revision,months:Object.fromEntries(months.map(month=>[month,{dates:updates[`shifts/${month}/__laborRemoval`].dates}]))};
    const verify=async()=>{for(const month of months){const saved=await read('shifts/'+month);if(saved?.__laborRemoval?.operationId!==operationId||rows.filter(r=>r.month===month).some(r=>saved?.[data.staffId]?.[r.date]!=null||saved?.__manualTimes?.[data.staffId]?.[r.date]!=null))return false;}return true;};
    try{await port.update(updates);}catch(e){if(await verify().catch(()=>false))return;throw e;}
    if(!await verify())throw Error('解除結果を確認できません。対象一覧を再確認してください。');
  }
  return {actor,authorize,list,roster,save,importStaff,matchAccount,removeShifts,
    requests:()=>read('portalJoinRequests'),shifts:()=>read('shifts'),history:sid=>read('laborHistory/'+key(sid)),shiftHistory:sid=>read('laborShiftHistory/'+key(sid)),file:async id=>{await authorize();return read('laborFiles/'+key(id));},
    templates:()=>read('laborTemplates'),saveTemplates:async value=>{await authorize();await port.update({laborTemplates:value});const saved=await read('laborTemplates');if(['onboard','offboard'].some(k=>JSON.stringify(saved?.[k])!==JSON.stringify(value[k])))throw Error('テンプレートの保存を再確認してください。');},now:port.now};
}
