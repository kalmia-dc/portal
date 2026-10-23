export function createReadStore({db,ref,set,isActive=()=>true,uid,currentUid=()=>uid}){
 return async(thread,event)=>{
 if(!isActive()||!uid||currentUid()!==uid)throw Error('利用許可を再確認してください。');
 if(![thread,event].every(v=>/^[a-zA-Z0-9-]{8,80}$/.test(v)))throw Error('既読対象が不正です。');
 // Immutable true per event: concurrent tabs never regress a later read.
 await set(ref(db,'supportChatReads/'+uid+'/'+thread+'/'+event),true);
 };
}
