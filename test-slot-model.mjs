import {assertAdmin} from './portal-members-model.mjs';
import {isLifecycleStopped,lifecycleChange} from './portal-lifecycle-model.mjs';
export function inspectTestSlot({actor,staff,users={},cards={},state=null,config={}}){
 assertAdmin(actor);
 if(config.enabled!==true||config.owners?.[actor.uid]!==true)throw Error('労務管理者の許可を確認してください。');
 if(staff?.id!=='test'||!staff.name||state?.hrManaged||config.protectedStaff?.test)throw Error('test枠の状態を確認してください。雇用情報・保護対象は変更しません。');
 const accounts=Object.values(users).filter(x=>x?.staffId==='test');
 const linkedCards=Object.entries(cards).filter(([,x])=>x?.staffId==='test');
 return {staff:{id:'test',name:staff.name,role:staff.role},state,action:isLifecycleStopped(state)?'restore':'stop',accounts:accounts.length,cards:linkedCards.length};
}
export async function changeTestSlot({actor,expected,operationId,timestamp,read,transact}){
 const fresh=inspectTestSlot({actor,...await read()});
 if(fresh.accounts||fresh.cards)throw Error('testにログインまたはカードの紐付けがあります。影響確認が必要なため停止・復帰を行いません。');
 if(fresh.staff.name!==expected.staff.name||fresh.action!==expected.action||JSON.stringify(fresh.state)!==JSON.stringify(expected.state))throw Error('状態が変わりました。再読み込みして確認してください。');
 let failure;
 const result=await transact(current=>{try{return lifecycleChange({actor,staff:fresh.staff,users:{},current,expected:expected.state,action:expected.action,operationId,timestamp});}catch(e){failure=e;return;}});
 if(failure)throw failure;
 if(!result.committed)throw Error('保存されませんでした。再読み込みして確認してください。');
 const verified=inspectTestSlot({actor,...await read()});
 if(verified.state?.operationId!==operationId||verified.state.state!==(expected.action==='stop'?'stopped':'active'))throw Error('保存の読み戻しを確認できません。再実行せず再読み込みしてください。');
 return verified;
}
