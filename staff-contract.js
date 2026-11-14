import {termFields,initialTerms,presetText,validateTerms} from './onboarding-functions/contract-terms.mjs';
import {createContractPDF} from './contract-pdf.mjs';
import {renewalTerms,validateRenewal} from './onboarding-functions/contract-renewal-terms.mjs';
export function showContract({saved,review,dialog,fields,actions,element,input,button,notice,request,closeDetail,loadCase,urls,signerName,presets=[],renewalDefaults,applyRenewal,active=()=>true}) {
  dialog.dataset.restricted='true';
  document.getElementById('detailTitle').textContent=renewalDefaults?'更新契約書':'雇用契約書';
  notice('detailMessage',saved.stage==='withdrawn'?'この契約書の提示を取り下げました。':saved.stage==='released' ? '契約書の内容を確認してください。' : '準備中：本人への確認受付は開始していません。');
  const preparing=saved.stage==='preparing';
  if(saved.renewal){
    const {start,end,days,hours}=saved.renewal;
    fields.append(element('p',`${start}から ${end||'期間の定めなし'}／${days}／${hours}`));
  }
  if(saved.contract) {
    fields.append(element('p','契約書の版：'+saved.contract.version));
    for(const file of saved.files||[]) {
      const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(file.data),c=>c.charCodeAt(0))],{type:'application/pdf'}));
      urls.push(url);
      const open=element('a','契約書PDFを開く');open.href=url;open.target='_blank';open.rel='noopener';
      const download=element('a','契約書PDFを保存');download.href=url;download.download='雇用契約書.pdf';
      const row=element('p');row.append(open,document.createTextNode('　'),download);fields.append(row);
    }
  }
  if(saved.consent) {
    fields.append(element('p','同意者：'+saved.consent.signerName));
    fields.append(element('p','同意日時：'+new Date(saved.consent.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})));
    fields.append(element('p','同意した契約書の版：'+saved.consent.version));
    const blob=URL.createObjectURL(new Blob([JSON.stringify({contract:saved.contract,consent:saved.consent},null,2)],{type:'application/json'}));
    urls.push(blob);
    const evidence=element('a','同意記録を保存');evidence.href=blob;evidence.download='雇用契約書_同意記録.json';fields.append(evidence);
    if(saved.review?.at) fields.append(element('p','更新確定日時：'+new Date(saved.review.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})));
  }
  let pending=false;
  async function change(action,payload) {
    if(pending) return;
    pending=true;dialog.dataset.pending='true';
    const buttons=[...actions.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try {
      const values=await payload();
      if(!active()) return;
      await request(action,{item:'contract',revision:saved.revision,operation:crypto.randomUUID(),...values});
      if(!active()) return;
      closeDetail();await loadCase();
    } catch(error) {if(active())notice('detailMessage',error.message,true);}
    finally {pending=false;dialog.dataset.pending='false';buttons.forEach(b=>b.disabled=false);}
  }
  if(review && preparing) {
    const version=input('契約書の版','text',saved.contract?.version||'');version.maxLength=100;
    fields.append(element('h3','個別の契約条件'));
    fields.append(element('p','職員ごとの条件を入力してください。給与基準は選択して適用できます。保存後に正式な内容を確認し、本人の受付を開始します。'));
    const initial=saved.terms||initialTerms(signerName),editors={};
    let generated=null,releaseButton,edited=false,editCount=0;
    const dirty=()=>{generated=null;edited=true;editCount++;preview.replaceChildren();if(releaseButton)releaseButton.disabled=true;};
    version.addEventListener('input',dirty);
    let renewal;
    if(renewalDefaults){
      const start=input('更新開始日','date',saved.renewal?.start||'');
      const end=input('契約終了日（期間の定めなしの場合は空欄）','date',saved.renewal?.end||'');
      const type=element('select');type.setAttribute('aria-label','雇用形態');
      for(const [value,label] of [['','選択してください'],['full','常勤'],['part','非常勤'],['spot','スポット']]) type.add(new Option(label,value));
      type.value=saved.renewal?.type||renewalDefaults.type||'';
      const label=element('label','雇用形態');label.append(type);fields.append(label);
      const days=input('所定勤務日','text',saved.renewal?.days||renewalDefaults.days||'');
      const hours=input('所定勤務時間','text',saved.renewal?.hours||renewalDefaults.hours||'');
      for(const control of [start,end,type,days,hours]) control.addEventListener('input',dirty);
      renewal=()=>validateRenewal({start:start.value,end:end.value,type:type.value,days:days.value,hours:hours.value});
    }
    if(presets.length) {
      const wrap=element('label','給与基準');const choice=element('select');choice.setAttribute('aria-label','給与基準');wrap.append(choice);fields.append(wrap);
      choice.add(new Option('給与基準を選択',''));
      const options=[];
      for(const preset of presets) for(const row of preset.rows||[]) {
        choice.add(new Option(preset.label+'／'+row.label,String(options.length)));options.push({preset,row});
      }
      button(fields,'選択した給与基準を適用',()=>{
        if(choice.value==='')return;
        const {preset,row}=options[Number(choice.value)],values=presetText(preset,row);
        for(const key of ['salary','raises'])editors[key].value=values[key];dirty();
        notice('detailMessage','給与基準を入力しました。個別の条件を確認してから保存してください。');
      });
    }
    for(const [key,label,max] of termFields) {
      const labels={period:'更新基準・更新上限など',schedule:'勤務時間帯・休憩・変更の取扱い'};
      const wrap=element('label',renewal&&labels[key]||label),area=element('textarea');area.value=initial[key]||'';area.maxLength=max;area.rows=key==='salary'?7:4;area.style.width='100%';area.style.boxSizing='border-box';
      area.addEventListener('input',dirty);wrap.append(area);fields.append(wrap);editors[key]=area;
    }
    const data=()=>validateTerms(Object.fromEntries(Object.entries(editors).map(([key,area])=>[key,area.value])));
    const preview=element('p');fields.append(preview);
    const generate=async()=>{
      if(!version.value.trim())throw Error('契約書の版を入力してください。');
      if(!generated){
        const terms=data(),conditions=renewal?.(),contractVersion=version.value.trim(),generation=editCount;
        const bytes=await createContractPDF(conditions?renewalTerms(terms,conditions):terms,contractVersion);
        if(!active())throw Error('画面を開き直してください。');
        if(bytes.length>12*1024*1024)throw Error('PDFが12MBを超えました。内容を確認してください。');
        const file=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>resolve({type:'application/pdf',data:String(reader.result).split(',')[1]});reader.readAsDataURL(new Blob([bytes],{type:'application/pdf'}));});
        if(!active()||generation!==editCount)throw Error('入力内容が変わりました。PDFを作成し直してください。');
        generated={terms,files:[file],contractVersion,...(conditions?{renewal:conditions}:{})};
        const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));urls.push(url);
        const link=element('a','作成した契約書PDFを開く');link.href=url;link.target='_blank';link.rel='noopener';
        const download=element('a','PDFを保存');download.href=url;download.download='雇用契約書.pdf';preview.replaceChildren(link,document.createTextNode('　'),download);
      }
      return generated;
    };
    button(actions,'PDFプレビューを作成',async()=>{try{await generate();notice('detailMessage','入力欄の下にPDFの確認・保存リンクを表示しました。');}catch(e){notice('detailMessage',e.message,true);}});
    button(actions,'入力条件から準備状態で保存',()=>change('contract-prepare',generate),true);
    if(!renewal){
    const upload=element('details'),summary=element('summary','作成済みPDFを登録する');upload.append(summary);fields.append(upload);
    const label=element('label','契約書PDF'),file=element('input');file.type='file';file.accept='application/pdf';label.append(file);upload.append(label);
    button(upload,'PDFを準備状態で保存',()=>change('contract-prepare',async()=>{
      const chosen=file.files[0];if(!chosen||chosen.size>12*1024*1024)throw Error('12MB以下のPDFを選択してください。');
      const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(chosen);});
      return {contractVersion:version.value,files:[{type:'application/pdf',data}]};
    }));
    }
    if(saved.contract) {
      const confirm=input('契約条件・就業規則の適用と交付可能な正式版であることを確認しました','checkbox');
      releaseButton=button(actions,'本人の確認受付を開始',()=>change('contract-release',async()=>{if(edited)throw Error('変更した条件を先に保存してください。');return {confirm:confirm.checked};}));
    }
  }
  if(!review && !preparing && saved.state==='draft') {
    fields.append(element('p','同意者：'+signerName));
    const delivery=input('この契約書をポータルで受け取り、PDFを保存する方法に同意します。','checkbox');
    const agree=input('表示された契約書の全文と労働条件を確認し、本人として同意します。','checkbox');
    button(actions,renewalDefaults?'本人として署名する':'契約内容に同意する',()=>change('contract-agree',async()=>{
      if(renewalDefaults&&(!delivery.checked||!agree.checked))throw Error('電子交付と契約内容を確認してください。');
      return {agreed:[delivery.checked,agree.checked],sha256:saved.contract.sha256,contractVersion:saved.contract.version};
    }),true);
  }
  if(review && renewalDefaults && saved.stage==='released' && saved.state==='draft'){
    button(actions,'提示を取り下げる',()=>{
      if(window.confirm('この契約書の提示を取り下げますか？')) return change('contract-withdraw',async()=>({confirm:true}));
    });
  }
  if(review && applyRenewal && saved.state==='submitted' && !saved.canApply) fields.append(element('p','提示時の職員アカウントまたは在籍情報が変更されています。'));
  if(review && saved.state==='submitted' && (!applyRenewal || saved.canApply)) button(actions,applyRenewal?'署名を確認して契約更新を確定':'本人の同意を確認済みにする',()=>change('contract-accept',async()=>{
    if(applyRenewal) await applyRenewal(saved);
    return {};
  }),true);
  button(actions,'閉じる',closeDetail);
  dialog.showModal();
}
