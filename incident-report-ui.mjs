import {OPTIONS,IMPACT,SOURCE,newReport,normalizeReport,classification,reportText,toHTML,parseHTML,fromLegacy,escapeHtml as esc,monthKey} from './incident-report-core.mjs';
import {createIncidentStore,decodeRecord} from './incident-report-store.mjs?v=import-preserve-20261019';

export function reporterGroup(report, fallbackName=''){
  const name=String(report.reporterName||fallbackName||'未記録').trim();
  const id=String(report.reporterId||'').trim();
  if(id==='sugihira'||(!id&&['院長','杉平'].includes(name)))return {key:'sugihira',name:'院長'};
  if(id==='tamiya'||(!id&&name==='田宮'))return {key:'tamiya',name:'田宮'};
  return {key:id||`legacy-name:${name}`,name};
}

export function matchImportedReporter(value,roster,user,manager){
  const name=String(value.reporterName||'').trim();
  const eligible=roster.filter(p=>p.availability!=='stopped'&&(manager||p.id===user.staffId));
  const matches=eligible.filter(p=>p.id==='sugihira'?['院長','杉平'].includes(name):[p.name,p.label].includes(name));
  return {...value,reporterId:matches.length===1?matches[0].id:'',reporterName:matches.length===1&&matches[0].id==='sugihira'?'院長':name};
}
export function preservedChoices(value,choices){
  const entries=Object.entries(choices);
  return value&&!Object.hasOwn(choices,value)?[[value,`${value}（取り込み値・要確認）`],...entries]:entries;
}

export function mountIncidentReports(root,ctx){
  const {user,manager,terminal,roster}=ctx;
  const store=createIncidentStore({...ctx,isActive:()=>active});
  const oldChildren=[...root.children];oldChildren.forEach(el=>el.hidden=true);
  const app=document.createElement('div');app.className='incident-v2';root.append(app);
  app.innerHTML=`<h2>インシデント報告</h2><p>報告は改善につながる取り組みとして評価します。緊急の安全確保・連絡を優先してください。</p><p class="muted">患者名・生年月日・住所・電話番号を入力しないでください。関係者は役割で記録します。</p><div role="status" id="iv-status" aria-live="polite"></div><div id="iv-controls"></div><div id="iv-editor"></div><div id="iv-import"></div><div id="iv-private"></div><section><label>集計する提出月 <input type="month" id="iv-month"></label> <button type="button" data-iv="all">全期間</button> <label>検索 <input type="search" id="iv-search"></label><p>ポータルに初めて提出した月（日本時間）で集計。未取り込み・下書き・取り下げ・重複は含みません。</p><div id="iv-summary"></div></section><div id="iv-list"></div><div id="iv-history"></div>`;
  const q=s=>app.querySelector(s);
  let feed={},drafts={},privateRecords={},draft=null,previous=null,legacy=null,step=0,draftRevision=0,editing=false,timer=null,busy=false,month='',search='',dirty=false,foreignDraftSaved=false;
  let draftQueue=Promise.resolve(),active=true,editVersion=0,imported=false;
  const ownerListeners=new Map();
  const disposers=[];
  const status=(message,error=false)=>{if(!active)return;q('#iv-status').textContent=message;q('#iv-status').className=error?'iv-error':'iv-status';};
  const safe=fn=>Promise.resolve().then(fn).catch(e=>status(e.message||'操作を完了できませんでした',true));
  const person=id=>roster.find(x=>x.id===id);
  const label=(text,input)=>`<label class="iv-field">${esc(text)}${input}</label>`;
  const input=(key,title,type='text')=>label(title,`<input data-field="${key}" type="${type}" value="${esc(draft[key]||'')}">`);
  const area=(key,title,required=false)=>label(title,`<textarea data-field="${key}" ${required?'required':''} rows="3">${esc(draft[key]||'')}</textarea>`);
  const select=(key,title,choices)=>label(title,`<select data-field="${key}">${(key==='impact'?['unknown','na','0','1','2','3a','3b','4','5'].map(k=>[k,choices[k]]):key==='reporterId'?Object.entries(choices):preservedChoices(draft[key],choices)).map(([v,n])=>`<option value="${esc(v)}" ${draft[key]===v?'selected':''}>${esc(n)}</option>`).join('')}</select>`);
  const checks=(key,title)=>`<fieldset><legend>${esc(title)}</legend><div class="iv-options">${OPTIONS[key].map(v=>`<label><input type="checkbox" data-multi="${key}" value="${esc(v)}" ${(draft[key]||[]).includes(v)?'checked':''}>${esc(v)}</label>`).join('')}</div></fieldset>`;
  function readEditor(){if(!draft)return;for(const el of q('#iv-editor').querySelectorAll('[data-field]'))draft[el.dataset.field]=el.value;for(const key of Object.keys(OPTIONS)){const boxes=[...q('#iv-editor').querySelectorAll(`[data-multi="${key}"]`)];if(boxes.length)draft[key]=boxes.filter(e=>e.checked).map(e=>e.value);}if(draft.reporterId){const p=person(draft.reporterId);if(p)draft.reporterName=p.id==='sugihira'?'院長':p.name;}dirty=true;}
  function cancelTimer(){if(timer){clearTimeout(timer);timer=null;}}
  function editor(){
    if(!editing||!draft){q('#iv-editor').innerHTML='';return;}
    const titles=['基本情報','起きたこと・影響','背景・防げた理由','対応・申し送り','全体確認'];
    let content='';
    if(step===0){const choices=Object.fromEntries(roster.filter(p=>p.availability!=='stopped'&&(manager||p.id===user.staffId)).map(p=>[p.id,p.id==='sugihira'?'院長':p.label||p.name]));content=select('reporterId','報告者',{'':'選択してください',...choices})+(!draft.reporterId&&draft.reporterName?`<p class="iv-error">取り込み元の報告者：${esc(draft.reporterName)}。名簿と一意に一致しないため、報告者を確認して選択してください。</p>`:'')+input('ghostwriter','代筆者（代筆時のみ）')+input('occurredDate','発生日（不明なら空欄）','date')+input('occurredTime','発生時刻（不明なら空欄）','time')+select('place','場所',Object.fromEntries(['',...OPTIONS.place].map(x=>[x,x||'選択してください'])))+input('work','作業内容（必要な場合）')+select('phase','場面',Object.fromEntries(['',...OPTIONS.phase].map(x=>[x,x||'未確認'])));}
    if(step===1)content=checks('domains','事象の分野（複数可）')+area('details','何が起きたか（必須）',true)+select('impact','患者への実際の影響',IMPACT)+`<p>分類候補：${esc(classification(draft))}。院長・主任の確認前は仮分類です。<a href="${SOURCE}" target="_blank" rel="noopener">分類基準</a></p>`+checks('actual','業務・職員への実際の影響')+checks('potential','起こり得た被害（実際の結果とは別）')+`<details><summary>必要な医療情報を補足（個人特定情報を除く）</summary>${area('patientContext','患者の年齢層・状態など、事例に必要な情報')}${input('materials','器具・薬剤名')}</details>`;
    if(step===2)content=checks('factors','背景・要因（原因と確定したものではありません）')+checks('prevention','被害の防止・拡大防止につながった点')+`<details><summary>必要な場合だけ補足</summary>${input('roles','関係者の人数・役割')}${area('timeline','発見・対応の時系列')}${area('supplement','その他の補足')}</details>`;
    if(step===3)content=checks('response','その場で行った対応')+select('sharing','共有状況',{'':'未確認','共有済み':'共有済み','未共有':'未共有','確認中':'確認中'})+area('handoff','ミーティングへの申し送り（必要な場合）')+'<p>今後の対策の提案は、実施済みの対応と区別して記載してください。対策・進捗は既存のお知らせ／取り組みで管理します。</p>';
    if(step===4)content=`<pre>${esc(reportText(draft))}</pre><p>患者の個人特定情報や、未確認事項を断定した文章がないか確認してください。</p>${previous&&previous.owner!==draft.reporterId?'<label>報告者の訂正理由<input id="iv-reassign-reason" required></label>':''}${manager&&draft.impact!=='unknown'?(draft.reporterId==='sugihira'?'<p>院長の報告のため、提出時に分類を自動で確認済みにします。</p>':'<label><input type="checkbox" id="iv-confirm">院長・主任として分類を確認済みにする</label>'):''}<button type="button" data-iv="submit">${previous?'変更を保存':'内容を確認して提出'}</button>`;
    q('#iv-editor').innerHTML=`<section class="iv-panel"><h3>${previous?'報告の修正':'報告の作成'}：${step+1}/5 ${titles[step]}</h3>${content}<div class="iv-actions">${step?'<button type="button" data-iv="back">戻る</button>':''}${step<4?'<button type="button" data-iv="next">次へ</button>':''}${!previous&&!legacy?'<button type="button" data-iv="save-draft">下書き保存</button>':''}<button type="button" data-iv="export">HTMLを書き出す</button><button type="button" data-iv="close">閉じる</button></div><p id="iv-save-state">${previous?'提出済み報告の変更は最後の保存操作で確定します。':foreignDraftSaved?'代理下書きを保存しました。以後は報告者本人のみ開けます。':'下書きは本人だけが開けます。本人の下書きは自動保存します。'}</p></section>`;
  }
  function setEditor(value,record=null,old=null){cancelTimer();draft={...value};previous=record;legacy=old;step=0;editing=true;draftRevision=0;dirty=false;foreignDraftSaved=false;imported=false;editor();q('#iv-editor').scrollIntoView({block:'start',behavior:'smooth'});}
  async function saveDraft(){
    if(previous||legacy||!draft||foreignDraftSaved)return;
    readEditor();const snapshot=normalizeReport(draft);if(!snapshot.reporterId)throw new Error('下書きの報告者を選んでください');
    const expectedId=draft.reportId,version=editVersion,initialRevision=draftRevision;status('下書きを保存中…');
    const operation=draftQueue.then(async()=>{const sameDraft=draft?.reportId===expectedId&&draft.reporterId===snapshot.reporterId;const saved=await store.saveDraft(snapshot,sameDraft?draftRevision:initialRevision,imported);if(sameDraft){draftRevision=saved.revision;if(version===editVersion)dirty=false;}status(version===editVersion?'下書き保存済み':'変更あり：次の自動保存を待っています');if(snapshot.reporterId!==user.staffId&&sameDraft){foreignDraftSaved=true;editing=false;draft=null;editor();status('報告者本人の下書きへ保存しました。以後は本人のみ開けます。');}});
    draftQueue=operation.catch(()=>{});return operation;
  }
  function download(value){const blob=new Blob([toHTML(value)],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`incident-report_${value.reportId}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function privateList(){q('#iv-private').innerHTML=terminal?'':`<details><summary>本人の下書き ${Object.keys(drafts).length}件／取り下げ済み</summary>${Object.entries(drafts).map(([id,d])=>{let r;try{r=JSON.parse(d.payload);}catch{return '';}return `<p>${esc(r.details?.slice(0,50)||'未記入')} <button data-iv="resume" data-id="${esc(id)}">再開</button> <button data-iv="delete-draft" data-id="${esc(id)}">下書きを削除</button></p>`;}).join('')}${Object.entries(privateRecords).filter(([,r])=>r.state==='withdrawn').map(([id,r])=>`<article class="iv-panel"><strong>取り下げ済み</strong><pre>${esc(reportText(decodeRecord(r)))}</pre><p>理由：${esc(r.reason)}</p><button data-iv="history" data-id="${esc(id)}">履歴</button>${manager?` <button data-iv="restore" data-id="${esc(id)}">理由を付けて復元</button>`:''}</article>`).join('')}</details>`;}
  function legacyDate(r){return Number(r.createdAt||r.importedAt||0);}
  function allItems(){const ids=new Set(Object.values(feed).map(r=>r.legacyKey).filter(Boolean));return [...Object.entries(feed).map(([id,record])=>({id,record,value:decodeRecord(record),when:record.submittedAt})),...ctx.legacy().filter(r=>!ids.has(r.id)).map(old=>({id:old.id,old,when:legacyDate(old)}))];}
  function render(){
    const all=allItems();const unknown=all.filter(x=>!monthKey(x.when)).length;
    const items=all.filter(x=>(!month||monthKey(x.when)===month)&&(!search||JSON.stringify(x.value||x.old).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>b.when-a.when);
    const totals=new Map();let oldCount=0,newCount=0,pending=0;const buckets={};
    for(const item of items){const r=item.value||item.old;const {key,name}=reporterGroup(r,item.old?.createdBy);const current=totals.get(key)||{name,n:0};current.n++;totals.set(key,current);
      const basis=item.record?.basis==='nho2020'?'新基準':'旧基準';basis==='新基準'?newCount++:oldCount++;
      const type=basis==='新基準'?classification(r):({'near_miss':'ヒヤリ・ハット','accident':'アクシデント'}[item.record?.legacyType||item.old?.type]||'判定保留');
      const review=item.record?.review==='confirmed'?'確定':'未確認';const label=`${basis}：${type}${basis==='新基準'?'／'+review:''}`;buckets[label]=(buckets[label]||0)+1;if(item.record?.review!=='confirmed')pending++;
    }
    q('#iv-summary').innerHTML=`<div class="iv-panel"><strong>合計 ${items.length}件（旧基準 ${oldCount}件・新基準 ${newCount}件）</strong>${manager?`<p>確認待ち ${pending}件</p>`:''}<p>初回提出日が不明：全期間で${unknown}件${month?'（この月の集計には含めていません）':''}</p><ul>${Object.entries(buckets).map(([k,n])=>`<li>${esc(k)} ${n}件</li>`).join('')}</ul><table><caption>報告者別の提出件数</caption><thead><tr><th>報告者</th><th>件数</th></tr></thead><tbody>${[...totals.values()].map(v=>`<tr><td>${esc(v.name)}</td><td>${v.n}</td></tr>`).join('')}</tbody></table></div>`;
    q('#iv-list').innerHTML=items.map(item=>{
      if(item.old){const r=item.old;return `<article class="iv-panel" data-case-kind="incidents" data-case-id="${esc(r.id)}"><h3>${esc(r.reportNumber||r.id)} <small>旧基準</small></h3><p>報告者：${esc(r.reporterName||r.createdBy||'未記録')}／旧分類：${esc(r.type||'未記録')}／旧A・B：${esc(r.level||'未記録')}</p><dl>${Object.entries({発生日:r.occurredDate,発見者:r.discovererName,確認者:r.verifierName,場所:r.occurredPlace,作業:r.workContent,場面:r.scene,内容:r.details,影響:r.eventImpact,防止理由:r.goodPoint,人と行動:r.causeHuman,環境と連携:r.causeEnvironment,申し送り:r.handoff,対策:r.countermeasure}).map(([k,v])=>v?`<dt>${k}</dt><dd>${esc(v)}</dd>`:'').join('')}</dl>${ctx.legacyWorkflow(r)}${!terminal&&(manager||r.reporterId===user.staffId||r.createdById===user.staffId)?`<button data-iv="edit-legacy" data-id="${esc(r.id)}">履歴を残して編集</button>`:''}${manager?` <button data-iv="withdraw-legacy" data-id="${esc(r.id)}">理由を付けて取り下げ</button>`:''}</article>`;}
      const {record:r,value:v,id}=item;return `<article class="iv-panel" data-case-kind="incidents" data-case-id="${esc(id)}"><h3>${esc(v.reportNumber||id)}</h3>${r.importedBy?`<p>取込者：${esc(person(r.importedBy)?.name||r.importedBy)}</p>`:''}<p>${r.basis==='legacy'?'旧基準を保持／新項目は未確認':'新基準'}・${esc(classification(v))}・${r.review==='confirmed'?`確認済み（${esc(person(r.reviewer)?.name||r.reviewer)}）`:'確認待ち'}</p><details><summary>${esc(v.details.slice(0,100))}</summary><pre>${esc(reportText(v))}</pre></details>${ctx.workflow(r,id,v)}${!r.linkedTaskId&&!r.linkedNoticeId?`<p>対策状況：${esc(({pending:'未検討',decided:'対策決定',in_progress:'取り組み中',followup_pending:'院長確認待ち',confirmed:'定着完了'})[r.counterStatus]||'未検討')}</p><p>${esc(r.countermeasure)}</p>${manager?`<button data-iv="followup" data-id="${esc(id)}">対策・対応状況</button>`:''}`:''}<div class="iv-actions"><button data-iv="export-record" data-id="${esc(id)}">HTML</button>${!terminal&&(manager||r.owner===user.staffId)?`<button data-iv="edit" data-id="${esc(id)}">編集</button><button data-iv="history" data-id="${esc(id)}">履歴</button>`:''}${manager?`<button data-iv="confirm" data-id="${esc(id)}">分類を確認</button><button data-iv="withdraw" data-id="${esc(id)}">取り下げ</button>${!r.linkedTaskId&&!r.linkedNoticeId?`<button data-iv="route-task" data-id="${esc(id)}">取り組みへ</button><button data-iv="route-notice" data-id="${esc(id)}">お知らせへ</button>`:''}`:''}</div></article>`;
    }).join('')||'<p>対象の報告はありません。</p>';
    privateList();
  }
  async function history(id){const records=await store.history(id)||{};q('#iv-history').innerHTML=`<section class="iv-panel"><h3>限定公開の修正履歴</h3><button data-iv="close-history">閉じる</button>${Object.values(records).sort((a,b)=>b.revision-a.revision).map(r=>`<details><summary>版${r.revision}／${esc(new Date(r.updatedAt).toLocaleString('ja-JP'))}／${esc(person(r.actor)?.name||r.actor)}／${esc(r.action)}</summary><p>理由：${esc(r.reason)}</p>${r.linkedOriginals?`<details><summary>取り下げ前の連携先本文</summary><pre>${esc(r.linkedOriginals)}</pre></details>`:''}<pre>${esc(reportText(decodeRecord(r)))}</pre>${r.legacy?`<details><summary>保全した旧報告</summary><pre>${esc(JSON.stringify(JSON.parse(r.legacy),null,2))}</pre></details>`:''}</details>`).join('')}</section>`;q('#iv-history').scrollIntoView({block:'start'});}
  async function withdraw(id,old=null){
    const reason=prompt('取り下げ理由を入力してください');if(!reason?.trim())return;
    let rec=old?null:await store.record(id);let value=old?fromLegacy(old,'legacy_'+old.id):decodeRecord(rec);
    if(old){value.reporterId=old.reporterId||old.createdById||'';value.reporterName=old.reporterName||old.createdBy||'';if(!value.reporterId)throw new Error('先に報告者を確認して編集してください');}
    const extras={}, linkedOriginals=[];const original=old||(rec.legacy?JSON.parse(rec.legacy):null);
    for(const [kind,key,field] of [['tasks','linkedTaskId','detail'],['notices','linkedNoticeId','body']]){
      const targetId=rec?.[key]||old?.[key];if(!targetId)continue;
      const item=ctx.destinations(kind).find(v=>v.id===targetId);if(!item)throw new Error('連携先を読み込めません。取り下げは行っていません');
      if(original){linkedOriginals.push({kind,id:targetId,field,body:item[field]||''});const safeText=prompt('旧形式の連携先です。一般スタッフへ共有を続ける対策文だけを確認・編集してください。元の全文は限定保管します。',item[field]||'');if(safeText===null)return;extras[`meetingManagement/${kind}/${targetId}/${field}`]=safeText;}
      extras[`meetingManagement/${kind}/${targetId}/sourceIncidentWithdrawn`]=true;
    }
    await store.commit(value,{previous:rec,legacy:old,action:'withdraw',reason,linkedOriginals:JSON.stringify(linkedOriginals),extraUpdates:extras});status('取り下げました。元の本文と履歴は限定公開です。');
  }
  async function run(action,id){
    if(action==='all'){month='';q('#iv-month').value='';render();return;}
    if(action==='new'){if(dirty&&!confirm('現在の未保存内容を閉じて新しく作成しますか？'))return;setEditor({...newReport(),reporterId:user.staffId,reporterName:user.name});return;}
    if(action==='next'||action==='back'){readEditor();normalizeReport(draft);step+=action==='next'?1:-1;editor();return;}
    if(action==='close'){if(dirty&&!confirm('未保存の内容を閉じますか？'))return;cancelTimer();editing=false;draft=null;previous=null;dirty=false;editor();return;}
    if(action==='save-draft'){cancelTimer();await saveDraft();return;}
    if(action==='resume'){const d=drafts[id];setEditor(normalizeReport(JSON.parse(d.payload)));draftRevision=d.revision;return;}
    if(action==='delete-draft'){if(confirm('本人のこの下書きを削除しますか？'))await store.deleteDraft(id);return;}
    if(action==='export'){readEditor();download(draft);return;}
    if(action==='export-record'){download(decodeRecord(feed[id]));return;}
    if(action==='edit'){const r=await store.record(id);setEditor(decodeRecord(r),r);return;}
    if(action==='edit-legacy'){const old=ctx.legacy().find(r=>r.id===id);const v=fromLegacy(old,'legacy_'+id);v.reporterId=old.reporterId||old.createdById||'';v.reporterName=old.reporterName||old.createdBy||'';setEditor(v,null,old);return;}
    if(action==='submit'){
      readEditor();cancelTimer();await draftQueue;
      const reason=q('#iv-reassign-reason')?.value||'';const confirmed=q('#iv-confirm')?.checked||false;
      await store.commit(draft,{previous,action:legacy?'migrate':imported?'import':previous?'edit':'submit',reason,confirmed,legacy,imported});editing=false;draft=null;previous=null;legacy=null;dirty=false;editor();status('保存しました。初回提出月に集計されます。');return;
    }
    if(action==='followup'){
     const r=await store.record(id);const text=prompt('対策内容（実施済みと今後の予定を区別してください）',r.countermeasure||'');if(text===null)return;
     const states={1:'pending',2:'decided',3:'in_progress',4:'followup_pending',5:'confirmed'};
     const choice=prompt('対応状況：1 未検討／2 対策決定／3 取り組み中／4 院長確認待ち／5 定着完了（院長のみ）',String(Object.keys(states).find(k=>states[k]===r.counterStatus)||1));if(choice===null)return;if(!states[choice])throw new Error('1〜5を選んでください');
     if(choice==='5'&&user.staffId!=='sugihira')throw new Error('定着完了の確認は院長のみです');
     await store.commit(decodeRecord(r),{previous:r,action:'followup',counterStatus:states[choice],countermeasure:text});return;
   }
   if(action==='history'){await history(id);return;}
    if(action==='close-history'){q('#iv-history').innerHTML='';return;}
    if(action==='confirm'){const r=await store.record(id);const v=decodeRecord(r);if(v.impact==='unknown')throw new Error('患者への影響が未確認です。編集で確認してください');if(confirm(`分類候補「${classification(v)}」と影響の根拠を確認しましたか？`))await store.commit(v,{previous:r,action:'review',confirmed:true});return;}
    if(action==='withdraw'){await withdraw(id);return;}
    if(action==='withdraw-legacy'){await withdraw(id,ctx.legacy().find(r=>r.id===id));return;}
    if(action==='restore'){const reason=prompt('復元理由を入力してください');if(!reason?.trim())return;const r=await store.record(id);const extra={};for(const [kind,key] of [['tasks','linkedTaskId'],['notices','linkedNoticeId']])if(r[key])extra[`meetingManagement/${kind}/${r[key]}/sourceIncidentWithdrawn`]=false;await store.commit(decodeRecord(r),{previous:r,action:'restore',reason,extraUpdates:extra});return;}
    if(action==='route-task'||action==='route-notice'){ctx.route(id,action==='route-task'?'tasks':'notices');return;}
    if(action==='import'){await importFiles();}
  }
  async function importFiles(){const files=[...q('#iv-files').files];if(!files.length)throw new Error('HTMLまたは写真を選択してください');if(files.length>4)throw new Error('一度に4ファイルまで選択してください');const candidates=[];const images=[];
    for(const file of files){if(file.size>15*1024*1024)throw new Error('1ファイル15MB以内にしてください');if(file.type.startsWith('image/'))images.push(file);else{const html=await file.text();const parsed=parseHTML(html);if(parsed)candidates.push(parsed);else{const olds=ctx.parseLegacy(html);if(!olds.length)throw new Error('旧HTMLの報告項目を読み取れません');candidates.push(...olds.map(x=>fromLegacy(x)));}}}
    if(images.length){status('写真の文字を読み取り中…');const values=await ctx.ocr(images,{set textContent(v){status(v);}});candidates.push(...values.map(x=>fromLegacy(x)));}
    if(candidates.length!==1)throw new Error('内容を一件ずつ確認するため、報告書1件分のファイルを選んでください');
    const value=candidates[0];let rec=null;const existing=feed[value.reportId]||privateRecords[value.reportId];if(existing){if(existing.state==='withdrawn')throw new Error('この報告は取り下げ済みです。院長・主任が理由を付けて復元してから取り込んでください');if(!manager&&existing.owner!==user.staffId)throw new Error('他の報告者の報告は更新できません');rec=await store.record(value.reportId);const before=decodeRecord(rec);q('#iv-import').insertAdjacentHTML('beforeend',`<details open><summary>同じIDの報告：変更前と取り込み内容</summary><h4>現在</h4><pre>${esc(reportText(before))}</pre><h4>取り込み</h4><pre>${esc(reportText(value))}</pre></details>`);value.revision=rec.revision;value.reporterId=rec.owner;if(!confirm('同じ報告IDが見つかりました。差分を確認して編集画面へ進みますか？'))return;}
    else {const possible=allItems().filter(i=>(i.value?.details||i.old?.details||'').trim()===value.details.trim());if(possible.length&&!confirm('内容が一致する報告があります。別の報告として確認を続けますか？'))return;value.revision=0;Object.assign(value,matchImportedReporter(value,roster,user,manager));}
    setEditor(value,rec);imported=true;status('取り込み内容と報告者を確認してください。まだ提出されていません。');q('#iv-files').value='';
  }
  app.addEventListener('input',e=>{if(e.target.id==='iv-search'){search=e.target.value;render();return;}if(e.target.closest('#iv-editor')){editVersion++;if(e.target.dataset.field==='reporterId'&&!previous&&!legacy&&!imported&&draft.reporterId!==e.target.value){draft.reportId=newReport().reportId;draftRevision=0;}readEditor();cancelTimer();if(!previous&&!legacy&&draft?.reporterId===user.staffId)timer=setTimeout(()=>safe(saveDraft),1400);}});
  app.addEventListener('change',e=>{if(e.target.id==='iv-month'){month=e.target.value;render();}else if(e.target.dataset.field==='impact'){readEditor();editor();}});
  app.addEventListener('click',e=>{const b=e.target.closest('[data-iv]');if(!b||busy)return;e.preventDefault();safe(async()=>{busy=true;b.disabled=true;try{await run(b.dataset.iv,b.dataset.id);}finally{busy=false;if(b.isConnected)b.disabled=false;}});});
  if(!terminal){q('#iv-controls').innerHTML='<button class="btn primary" data-iv="new">報告を作成</button>';q('#iv-import').innerHTML='<section class="iv-panel iv-import-panel" aria-labelledby="iv-import-title"><h3 id="iv-import-title">HTML・写真から報告を取り込む</h3><p>Codex・ClaudeのHTML、従来HTML、写真に対応しています。</p><p>ファイルを選び、内容を読み取って確認してください。最後に「内容を確認して提出」を押すと一覧に反映されます。写真は保存しません。</p><label class="iv-field">取り込むファイル<input type="file" id="iv-files" accept=".html,.htm,image/*" multiple></label><button data-iv="import">内容を読み取って確認</button></section>';}
  const fail=e=>status('読み込みまたは保存に失敗しました。権限・接続を確認して再読み込みしてください。'+(e?.code||''),true);
  disposers.push(store.watch(store.paths.feed,value=>{feed=value;ctx.onReports(Object.entries(feed).map(([id,r])=>({id,...r,value:decodeRecord(r)})));render();},fail));
  if(!terminal){disposers.push(store.watch(`${store.paths.drafts}/${user.staffId}`,value=>{drafts=value;privateList();},fail));
    if(manager)disposers.push(store.watch(store.paths.records,value=>{privateRecords=value;privateList();},fail));
    else disposers.push(store.watch(`${store.paths.owners}/${user.staffId}`,value=>{for(const [id,stop] of ownerListeners)if(!value[id]){stop();ownerListeners.delete(id);delete privateRecords[id];}for(const id of Object.keys(value))if(!ownerListeners.has(id))ownerListeners.set(id,store.watch(`${store.paths.records}/${id}`,r=>{if(active){privateRecords[id]=r;privateList();}},()=>{delete privateRecords[id];privateList();}));privateList();},fail));
  }
  const beforeUnload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  render();
  return {render,store,async link(id,kind,targetId,item){const r=await store.record(id);if(r.state!=='submitted'||r.linkedTaskId||r.linkedNoticeId)throw new Error('元報告の状態が変わりました。最新内容を確認してください');await store.commit(decodeRecord(r),{previous:r,action:'route',[kind==='tasks'?'linkedTaskId':'linkedNoticeId']:targetId,confirmed:false,extraUpdates:{[`meetingManagement/${kind}/${targetId}`]:item}});},dispose(){active=false;cancelTimer();disposers.forEach(fn=>fn());ownerListeners.forEach(fn=>fn());window.removeEventListener('beforeunload',beforeUnload);app.remove();}};
}
