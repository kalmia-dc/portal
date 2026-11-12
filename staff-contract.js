import {termFields,initialTerms,presetText,validateTerms} from './onboarding-functions/contract-terms.mjs';
import {createContractPDF} from './contract-pdf.mjs';
export function showContract({saved,review,dialog,fields,actions,element,input,button,notice,request,readFile,closeDetail,loadCase,urls,signerName,presets=[]}) {
  dialog.dataset.restricted='true';
  document.getElementById('detailTitle').textContent='雇用契約書';
  notice('detailMessage',saved.stage==='released' ? '契約書の内容を確認してください。' : '準備中：本人への確認受付は開始していません。');
  const preparing=saved.stage!=='released';
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
  }
  let pending=false;
  async function change(action,payload) {
    if(pending) return;
    pending=true;dialog.dataset.pending='true';
    const buttons=[...actions.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try {
      await request(action,{item:'contract',revision:saved.revision,operation:crypto.randomUUID(),...await payload()});
      closeDetail();await loadCase();
    } catch(error) {notice('detailMessage',error.message,true);}
    finally {pending=false;dialog.dataset.pending='false';buttons.forEach(b=>b.disabled=false);}
  }
  if(review && preparing) {
    const version=input('契約書の版','text',saved.contract?.version||'');version.maxLength=100;
    fields.append(element('h3','個別の契約条件'));
    fields.append(element('p','職員ごとの条件を入力してください。給与基準は選択して適用できます。保存後に正式な内容を確認し、本人の受付を開始します。'));
    const initial=saved.terms||initialTerms(signerName),editors={};
    let generated=null,releaseButton,edited=false;
    const dirty=()=>{generated=null;edited=true;preview.replaceChildren();if(releaseButton)releaseButton.disabled=true;};
    version.addEventListener('input',dirty);
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
      const wrap=element('label',label),area=element('textarea');area.value=initial[key]||'';area.maxLength=max;area.rows=key==='salary'?7:4;area.style.width='100%';area.style.boxSizing='border-box';
      area.addEventListener('input',dirty);wrap.append(area);fields.append(wrap);editors[key]=area;
    }
    const data=()=>validateTerms(Object.fromEntries(Object.entries(editors).map(([key,area])=>[key,area.value])));
    const preview=element('p');fields.append(preview);
    const generate=async()=>{
      if(!version.value.trim())throw Error('契約書の版を入力してください。');
      if(!generated){
        const terms=data(),bytes=await createContractPDF(terms,version.value.trim());
        if(bytes.length>12*1024*1024)throw Error('PDFが12MBを超えました。内容を確認してください。');
        const file=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>resolve({type:'application/pdf',data:String(reader.result).split(',')[1]});reader.readAsDataURL(new Blob([bytes],{type:'application/pdf'}));});
        generated={terms,files:[file],contractVersion:version.value.trim()};
        const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));urls.push(url);
        const link=element('a','作成した契約書PDFを開く');link.href=url;link.target='_blank';link.rel='noopener';
        const download=element('a','PDFを保存');download.href=url;download.download='雇用契約書.pdf';preview.replaceChildren(link,document.createTextNode('　'),download);
      }
      return generated;
    };
    button(actions,'PDFプレビューを作成',async()=>{try{await generate();notice('detailMessage','入力欄の下にPDFの確認・保存リンクを表示しました。');}catch(e){notice('detailMessage',e.message,true);}});
    button(actions,'入力条件から準備状態で保存',()=>change('contract-prepare',generate),true);
    const upload=element('details'),summary=element('summary','作成済みPDFを登録する');upload.append(summary);fields.append(upload);
    const label=element('label','契約書PDF'),file=element('input');file.type='file';file.accept='application/pdf';label.append(file);upload.append(label);
    button(upload,'PDFを準備状態で保存',()=>change('contract-prepare',async()=>{
      const chosen=file.files[0];if(!chosen||chosen.size>12*1024*1024)throw Error('12MB以下のPDFを選択してください。');
      const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(chosen);});
      return {contractVersion:version.value,files:[{type:'application/pdf',data}]};
    }));
    if(saved.contract) {
      const confirm=input('契約条件・就業規則の適用と交付可能な正式版であることを確認しました','checkbox');
      releaseButton=button(actions,'本人の確認受付を開始',()=>change('contract-release',async()=>{if(edited)throw Error('変更した条件を先に保存してください。');return {confirm:confirm.checked};}));
    }
  }
  if(!review && !preparing && saved.state==='draft') {
    fields.append(element('p','同意者：'+signerName));
    const delivery=input('この契約書をポータルで受け取り、PDFを保存する方法に同意します。','checkbox');
    const agree=input('表示された契約書の全文と労働条件を確認し、本人として同意します。','checkbox');
    button(actions,'契約内容に同意する',()=>change('contract-agree',async()=>({agreed:[delivery.checked,agree.checked],sha256:saved.contract.sha256,contractVersion:saved.contract.version})),true);
  }
  if(review && saved.state==='submitted') button(actions,'本人の同意を確認済みにする',()=>change('contract-accept',async()=>({})),true);
  button(actions,'閉じる',closeDetail);
  dialog.showModal();
}
