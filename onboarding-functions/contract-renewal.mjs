import {handleContract} from './contract.mjs';

const validId=value=>typeof value==='string' && /^[-_A-Za-z0-9]{1,120}$/.test(value);

export function createRenewalService(port, fail) {
  return async (actor,input)=>{
    const review=input.mode==='review';
    if(review&&!actor.reviewer) fail('permission-denied','労務担当の利用権限が必要です。');
    const staff=review?input.staff:actor.staffId;
    if(!validId(staff)) fail('invalid-argument','職員を選択してください。');
    const employee=await port.employee(staff,review?input.recipientUid:actor.uid,input.id);
    if(!employee || (!review && employee.uid!==actor.uid)) fail('permission-denied','この契約更新は利用できません。');
    if(input.action==='list'){
      const records=await port.renewals(staff);
      return {name:employee.name,canPrepare:employee.eligible,
        ...(review?{current:employee.current,presets:await port.presets()}:{}),
        items:records.filter(record=>review || (record.stage==='released' && record.signerUid===actor.uid))
          .map(({id,state,stage,updatedAt,version})=>({id,state,stage,updatedAt,version}))};
    }
    if(!validId(input.id)) fail('invalid-argument','契約書を選択してください。');
    const path={staff,period:'renewals',key:input.id,renewal:true};
    const record=await port.metadata(path);
    if(!record && input.action!=='contract-prepare') fail('not-found','契約書を確認できません。');
    if(!review && (record?.signerUid!==actor.uid||record?.stage!=='released')) fail('permission-denied','この契約書は閲覧できません。');
    const canApply=employee.eligible && record?.signerUid===employee.uid && record?.employmentStart===employee.current.startDate;
    if(review && input.action==='detail'){
      return {...await handleContract({port,actor,input,path,record,own:false,fail,recipient:employee}),canApply};
    }
    if(!employee.eligible && !['detail','contract-withdraw'].includes(input.action)) fail('failed-precondition','在籍状況と本人のポータルアカウントを確認してください。');
    if(['contract-agree','contract-accept'].includes(input.action)&&!canApply)fail('failed-precondition','提示時の職員アカウントまたは在籍情報が変更されています。');
    if(review && input.action==='contract-release'){
      const body=await port.body(path,record);
      if(!body.renewal || body.renewal.start<employee.current.startDate) fail('failed-precondition','更新開始日が入社日より前です。');
    }
    if(review && input.action==='contract-accept'){
      const applied=employee.applied;
      const body=await port.body(path,record);
      if(applied?.reference!==input.id || applied.due!==body.renewal?.start) {
        fail('failed-precondition','労務管理への更新反映を確認できません。');
      }
    }
    return handleContract({port,actor,input,path,record,own:!review,fail,recipient:employee});
  };
}
