/** Shared calculation and atomic patch builder. No network or browser state. */
export const SHARED_ITEMS = Object.freeze({'初診':'人','再初診':'人','一日平均来院数':'人','自費率':'%'});
export const DEFINITION = 'insurance-points-x10-v1';
export function canManage(profile) {
  return profile?.portalRole === 'admin' && ['sugihira','momo'].includes(profile?.staffId);
}
export function canonicalItem(value) {
  const item=String(value||'').trim();
  const aliases={'1日平均来院数':'一日平均来院数','１日平均来院数':'一日平均来院数','1日平均来院者数':'一日平均来院数','自費売上高':'自費売上','保険売上高':'保険売上','物販売上':'物販合計','物販売上高':'物販合計','月間述べ患者数':'月間延べ患者数'};
  return Object.hasOwn(aliases,item)?aliases[item]:item;
}
export function numberValue(value) {
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(String(value).replace(/,/g,''));
  return Number.isFinite(n)?n:null;
}
export function insuranceSales(points) {const n=numberValue(points);return n===null?null:n*10;}
export function selfPayRate(points,selfPay) {
  const insurance=insuranceSales(points),self=numberValue(selfPay);
  return insurance===null||self===null||insurance+self<=0?null:Number((self/(insurance+self)*100).toFixed(2));
}
const numericText=n=>n===null?'':String(n);
const keyFor=(month,item)=>'unified-'+month+'-'+encodeURIComponent(item).replace(/\./g,'%2E');
function existing(rows,month,item,unit) {
  const matches=Object.entries(rows).filter(([,r])=>r?.month===month&&canonicalItem(r.item)===item);
  if(unit&&matches.some(([,r])=>r.unit&&r.unit!==unit))throw Error(month+' '+item+' の単位が異なります。既存値を確認してください。');
  if(matches.length>1)throw Error(month+' '+item+' が重複しています。既存値を確認してから保存してください。');
  return matches[0]||[keyFor(month,item),null];
}
export function buildMonthlyPatch({metrics={},goals={},changes=[],profile,now=Date.now(),historyId,importMeta=null}) {
  if(!canManage(profile))throw Error('管理者権限が必要です。');
  if(!historyId||/[.#$\[\]\/]/.test(historyId))throw Error('履歴IDが不正です。');
  const staged=new Map(), deletes=new Set(), changedMonths=new Set();
  const key=(m,i)=>m+'|'+i;
  for(const raw of changes) {
    const item=canonicalItem(raw.item),month=String(raw.month||'');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!item||item.length>120)throw Error('対象月・項目を確認してください。');
    if(['保険売上','自費率'].includes(item))throw Error(item+' は保険点数・自費売上から計算します。');
    const k=key(month,item);
    if(staged.has(k))throw Error('同じ月・項目が入力候補に重複しています。');
    const n=numberValue(raw.value);
    if(!raw.deleted&&String(raw.value??'').trim()!==''&&(n===null||n<0))throw Error(item+' は0以上の数値で入力してください。');
    if(item==='保険点数'&&n!==null&&!Number.isInteger(n))throw Error('保険点数は整数で入力してください。');
    const unit=Object.hasOwn(SHARED_ITEMS,item)?SHARED_ITEMS[item]:item==='保険点数'?'点':item==='自費売上'?'円':String(raw.unit||'');
    staged.set(k,{month,item,category:String(raw.category||'その他'),unit,value:numericText(n),source:String(raw.source||''),note:String(raw.note||'')});
    if(raw.deleted)deletes.add(k);
    changedMonths.add(month);
  }
  const read=(month,item)=>{
    const k=key(month,item);
    if(deletes.has(k))return null;
    if(staged.has(k))return numberValue(staged.get(k).value);
    return numberValue(existing(metrics,month,item)[1]?.value);
  };
  for(const month of changedMonths) {
    const pointsTouched=staged.has(key(month,'保険点数')),selfTouched=staged.has(key(month,'自費売上'));
    if(!pointsTouched&&!selfTouched)continue;
    const points=read(month,'保険点数'),self=read(month,'自費売上');
    // A new self-pay edit must never silently reuse a historical amount-based insurance sale.
    if(selfTouched&&!deletes.has(key(month,'自費売上'))&&read(month,'自費売上')!==null&&points===null)
      throw Error(month+' の保険点数も入力してください。過去の保険売上からは逆算しません。');
    if(pointsTouched||points!==null)staged.set(key(month,'保険売上'),{month,item:'保険売上',category:'売上',unit:'円',value:numericText(insuranceSales(points)),source:'保険点数 × 10円',definition:DEFINITION});
    staged.set(key(month,'自費率'),{month,item:'自費率',category:'診療指標',unit:'%',value:numericText(selfPayRate(points,self)),source:'保険点数・自費売上から自動計算',definition:DEFINITION});
  }
  const patch={},before={},after={};
  const record=(path,old,next)=>{patch[path]=next;before[path]=old;after[path]=next;};
  for(const [k,data] of staged) {
    const [id,old]=existing(metrics,data.month,data.item);
    const next=deletes.has(k)?null:{...(old||{}),...data,updatedAt:now,updatedBy:profile.name,updatedByStaffId:profile.staffId,...(!old?{createdAt:now,createdBy:profile.name}:{})};
    record('privateMetrics/'+id,old,next);
    if(Object.hasOwn(SHARED_ITEMS,data.item)) {
      const [gid,previous]=existing(goals,data.month,data.item,SHARED_ITEMS[data.item]);
      // Only the allowed aggregate value crosses the boundary. Private source/note and revenue never do.
      const shared={...(previous||{}),month:data.month,item:data.item,unit:SHARED_ITEMS[data.item],actualValue:next?.value??'',actualSource:'unified-monthly-input',actualDefinition:data.definition||'monthly-input-v1',updatedAt:now,updatedBy:profile.name,...(!previous?{direction:'up',department:'全体',currentValue:'',history:[],owner:profile.name,ownerStaffId:profile.staffId,note:'',createdAt:now,createdBy:profile.name}:{})};
      record('monthlyGoals/'+gid,previous,shared);
    }
  }
  if(!staged.size)throw Error('保存する入力がありません。');
  // Audit stays in an existing admin-only path. Original history fields are never discarded.
  patch['privateMetricImportHistory/'+historyId]={source:'unified-monthly-input',definition:DEFINITION,importedAt:now,importedBy:profile.name,importedRows:changes.length,months:[...changedMonths],...(importMeta||{}),before:JSON.stringify(before),after:JSON.stringify(after)};
  return patch;
}

