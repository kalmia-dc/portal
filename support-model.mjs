import {accountPersonName} from './portal-person-display.mjs?v=20261021-director';
export const STATUSES=['未確認','確認中','対応中','対応済み','保留'];
export function speakerInfo(e){
 const ai=e.type==='message'&&e.actorRole==='admin'&&e.authorType==='ai'&&e.source==='hirasol-assisted';
 return {ai,label:ai?'ヒラソル（AIアシスタント）':`${accountPersonName(e.actorName,e.actorUid)}（${e.actorRole==='admin'?'管理者':'スタッフ'}）`,note:ai?`管理者申告のAI返信・独立したAI本人認証ではありません。送信操作：${accountPersonName(e.actorName,e.actorUid)} ／ actor UID：${e.actorUid}`:e.authorType===undefined?'過去の発言：送信元区分は未記録':'人間による送信'};
}
export function projectThread(id,record){
 if(!record)return null;
 return {id,...record.meta,events:Object.entries(record.events||{}).map(([key,e])=>({...e,id:key})).sort((a,b)=>a.seq-b.seq)};
}
export function changeThread(current,p,actor,{senderSource='portal-ui'}={}){
 if(!p||typeof p.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(p.requestId))throw Error('送信IDが不正です。');
 if('authorType' in p||'source' in p||'displayName' in p)throw Error('本文から送信元を指定することはできません。');
 if(!['portal-ui','hirasol-assisted'].includes(senderSource))throw Error('送信経路が不正です。');
 const authorType=senderSource==='hirasol-assisted'?'ai':'human';
 if(authorType==='ai'&&(actor.role!=='admin'||p.kind!=='message'))throw Error('ヒラソル送信経路は管理者による明示的な返信専用です。');
 const signature=JSON.stringify(p);
 if(current?.events?.[p.requestId]){
  const old=current.events[p.requestId];
  if(old.actorUid!==actor.uid||old.signature!==signature||old.authorType!==authorType||old.source!==senderSource)throw Error('送信IDの内容または送信元が異なります。');
  return {replayed:true,value:current};
 }
 const creating=p.kind==='create';
 if(!['create','message','status'].includes(p.kind)||creating&&current||!creating&&!current)throw Error('相談の状態が変わりました。更新してください。');
 if(!creating&&current.meta.revision!==p.expectedRevision)throw Error('新しい発言・状態変更があります。「更新」で確認してから送信してください。');
 if(p.kind!=='status'&&(typeof p.body!=='string'||!p.body.trim()||p.body.length>2000))throw Error('本文を1〜2,000文字で入力してください。');
 if(creating&&(typeof (p.page??'')!=='string'||(p.page??'').length>200||/[?#@]/.test(p.page??'')))throw Error('URLのクエリ・ハッシュ・認証情報とパス内IDを削除してください。');
 if(creating&&(typeof (p.occurredAt??'')!=='string'||(p.occurredAt??'').length>40))throw Error('発生日時を確認してください。');
 if(p.kind==='status'&&(actor.role!=='admin'||!STATUSES.includes(p.status)||p.status===current.meta.status))throw Error('状態変更を確認してください。');
 if(p.kind==='message'&&p.replyTo!==current.meta.lastMessageId)throw Error('返信先が変わりました。更新してください。');
 const stamp={'.sv':'timestamp'};
 const meta=creating?{ownerUid:actor.uid,ownerName:actor.name,status:'未確認',revision:0,createdAt:stamp,page:(p.page??'').trim(),occurredAt:p.occurredAt??''}:structuredClone(current.meta);
 const event={seq:meta.revision+1,type:p.kind==='status'?'status':'message',actorUid:actor.uid,actorName:actor.name,actorRole:actor.role,authorType,source:senderSource,at:stamp,signature};
 if(p.kind==='status'){event.from=meta.status;event.to=p.status;meta.status=p.status;}
 else{event.body=p.body.trim();event.replyTo=creating?'':meta.lastMessageId;meta.lastMessageId=p.requestId;meta.unanswered=actor.role!=='admin';}
 meta.revision++;meta.updatedAt=stamp;meta.lastEventId=p.requestId;
 return {replayed:false,value:{meta,events:{...(current?.events??{}),[p.requestId]:event}}};
}
