export const MAX_FILE_BYTES=5*1024*1024;
export async function prepareFile(file,id) {
  if(!['application/pdf','image/jpeg','image/png'].includes(file.type))throw Error('PDF・JPEG・PNGを選択してください。');
  if(!file.size||file.size>MAX_FILE_BYTES)throw Error('1件5MiB以下の書類を選択してください。原本は変更しません。');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(file.type==='application/pdf'&&!new TextDecoder().decode(bytes.slice(0,5)).startsWith('%PDF-'))throw Error('PDFの形式を確認してください。');
  if(file.type==='image/png'&&!(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71))throw Error('PNGの形式を確認してください。');
  if(file.type==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216))throw Error('JPEGの形式を確認してください。');
  let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  return {id,name:file.name,size:bytes.length,mime:file.type,hash,base64:btoa(raw)};
}
export function extractCandidates(source) {
  // OCR inserts spaces inside Japanese labels. Normalize only known labels and
  // explicit date notation; keep names and original text untouched in the UI.
  for(const word of ['雇用開始日','契約終了日','契約期間終了','所定勤務日数','所定労働日数','所定勤務時間','所定労働時間','歯科衛生士','歯科医師','歯科助手','雇用形態','非常勤','常勤','スポット','基本給','入社日','雇入日','職種','時給','手当'])source=source.replace(new RegExp(word.split('').join('[ \\t]*'),'gu'),word);
  source=source.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+)[ \t]+手当/gu,'$1手当');
  source=source.replace(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/gu,'$1年$2月$3日');
  const result=[];const add=(field,label,re)=>{const m=source.match(re);if(m)result.push({field,label,value:m[1].trim(),evidence:m[0]});};
  add('name','氏名',/(?:氏名|労働者名)\s*[:：]?\s*([^\n\r]{2,40})/u);
  add('startDate','入社日',/(?:入社日|雇入日|雇用開始日)\s*[:：]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/u);
  add('contractEnd','契約終了日',/(?:契約終了日|契約期間終了)\s*[:：]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/u);
  add('base','基本給',/基本給\s*[:：]?\s*([\d,]+)\s*円/u);add('hourly','時給',/時給\s*[:：]?\s*([\d,]+)\s*円/u);
  add('role','職種',/職種\s*[:：]?\s*(歯科医師|歯科衛生士|歯科助手|受付)/u);
  add('type','雇用形態',/雇用形態\s*[:：]?\s*(常勤|非常勤|パート|スポット)/u);
  add('days','所定勤務日数',/(?:所定勤務日数|所定労働日数)\s*[:：]?\s*([^\n\r]{1,25})/u);add('hours','所定勤務時間',/(?:所定勤務時間|所定労働時間)\s*[:：]?\s*([^\n\r]{1,25})/u);
  for(const m of source.matchAll(/([^\s\n：:]{1,15}手当)\s*[:：]?\s*([\d,]+)\s*円/gu))result.push({field:'allowance',label:m[1],value:m[2].replaceAll(',',''),evidence:m[0]});
  return result.map(x=>({...x,value:['startDate','contractEnd'].includes(x.field)?x.value.replace(/年|月|\//g,'-').replace('日','').split('-').map((v,i)=>i?v.padStart(2,'0'):v).join('-'):['base','hourly'].includes(x.field)?x.value.replaceAll(',',''):x.value}));
}
export async function readDocument(file, progress=()=>{}, signal) {
  const {default:{createWorker}}=await import('./assets/labor/tesseract.esm.min.js');let worker,loadingTask;
  const abort=()=>{void worker?.terminate();void loadingTask?.destroy();};signal?.addEventListener('abort',abort,{once:true});
  const check=()=>{if(signal?.aborted)throw Error('読取を終了しました。');};
  async function recognize(image){check();worker??=await createWorker('jpn',1,{workerPath:new URL('./assets/labor/worker.min.js',import.meta.url).href,corePath:new URL('./assets/labor/core/',import.meta.url).href,langPath:new URL('./assets/labor/lang/',import.meta.url).href,cacheMethod:'none',logger:m=>progress(m.status)});check();return (await worker.recognize(image)).data.text;}
  try {
    if(file.type!=='application/pdf')return await recognize(file);
    const pdfjs=await import('./assets/labor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./assets/labor/pdf.worker.mjs',import.meta.url).href;
    check();const task=loadingTask=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:new URL('./assets/labor/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./assets/labor/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./assets/labor/wasm/',import.meta.url).href});let doc;
    try {doc=await task.promise;if(doc.numPages>30)throw Error('30ページを超える書類は手入力で確認してください。');let output='';
      for(let i=1;i<=doc.numPages;i++){progress(`${i}/${doc.numPages}ページを読み取り中`);const page=await doc.getPage(i);const content=await page.getTextContent();let pageText=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('');
        if(pageText.replace(/\s/g,'').length<20){const viewport=page.getViewport({scale:1.6}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;pageText=await recognize(canvas);canvas.width=canvas.height=0;}
        output+=pageText+'\n';page.cleanup();
      }return output;
    } finally{await task.destroy();}
  } catch(error){if(error?.name==='PasswordException')throw Error('パスワード付きPDFは読み取れません。手入力で確認してください。');if(error?.name==='InvalidPDFException')throw Error('PDFが破損しているか、対応していない形式です。原本を確認して手入力してください。');throw error;} finally{signal?.removeEventListener('abort',abort);await worker?.terminate();}
}
