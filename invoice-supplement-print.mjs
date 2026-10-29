// Render the saved PDF, not the editable HTML, so paper and retained copy agree.
export async function prepareSavedPDFPrint(bytes,{checkActive=()=>{},title='インボイス補足書'}={}){
  checkActive();const pdfjs=await import('./assets/labor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('./assets/labor/pdf.worker.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,wasmUrl:new URL('./assets/labor/wasm/',import.meta.url).href,standardFontDataUrl:new URL('./assets/labor/standard_fonts/',import.meta.url).href});
  let pdf,frame;
  try{
    pdf=await task.promise;checkActive();if(pdf.numPages!==1)throw Error('印刷対象は1ページの補足書PDFに限ります。');
    const page=await pdf.getPage(1),viewport=page.getViewport({scale:3}),canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;checkActive();
    const image=document.createElement('img');image.alt='保存済みインボイス補足書';image.src=canvas.toDataURL('image/png');
    await image.decode();checkActive();
    frame=document.createElement('iframe');frame.title='保存済み補足書の印刷';frame.className='screen-only';frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
    document.body.append(frame);const doc=frame.contentDocument;doc.open();doc.write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:white}img{display:block;width:210mm;height:297mm;break-inside:avoid}</style></head><body></body></html>');doc.close();doc.title=title;doc.body.append(image);
    let disposed=false;const dispose=()=>{if(!disposed){disposed=true;frame.remove();}};
    frame.contentWindow.addEventListener('afterprint',dispose,{once:true});
    return {frame,dispose,print(){checkActive();if(disposed)throw Error('印刷画面を準備できませんでした。もう一度お試しください。');frame.contentWindow.focus();frame.contentWindow.print();}};
  }catch(error){frame?.remove();throw error;}finally{await task.destroy().catch(()=>{});}
}

