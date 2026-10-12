import fs from 'node:fs';
const target=new URL('../assets/labor/',import.meta.url),root=new URL('../node_modules/',import.meta.url);
fs.mkdirSync(target,{recursive:true});
function copy(source,dest){const out=new URL(dest,target);fs.mkdirSync(new URL('./',out),{recursive:true});fs.copyFileSync(new URL(source,root),out);}
for(const name of ['pdf.mjs','pdf.worker.mjs'])copy('pdfjs-dist/build/'+name,name);
for(const dir of ['cmaps','standard_fonts','wasm'])for(const name of fs.readdirSync(new URL('pdfjs-dist/'+dir+'/',root)))copy('pdfjs-dist/'+dir+'/'+name,dir+'/'+name);
for(const name of ['tesseract.esm.min.js','worker.min.js'])copy('tesseract.js/dist/'+name,name);
for(const name of fs.readdirSync(new URL('tesseract.js/dist/',root)).filter(x=>x.endsWith('.LICENSE.txt')))copy('tesseract.js/dist/'+name,name);
for(const name of fs.readdirSync(new URL('tesseract.js-core/',root)).filter(x=>x.endsWith('.wasm.js')))copy('tesseract.js-core/'+name,'core/'+name);
copy('@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz','lang/jpn.traineddata.gz');
for(const pkg of ['pdfjs-dist','tesseract.js','tesseract.js-core'])copy(pkg+(pkg==='tesseract.js'?'/LICENSE.md':'/LICENSE'),pkg+'-LICENSE.txt');
console.log('Self-hosted PDF/OCR assets prepared');
