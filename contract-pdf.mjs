import {PDFDocument,rgb} from './assets/invoice/pdf-lib-1.17.1.mjs';
import fontkit from './assets/invoice/fontkit-1.1.1.mjs';
import {termFields,validateTerms} from './onboarding-functions/contract-terms.mjs';
let fontPromise;
export async function createContractPDF(input,version,{fontBytes}={}) {
 const terms=validateTerms(input),doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 if(!fontBytes) {
  fontPromise ||= fetch(new URL('./assets/invoice/KalmiaInvoiceSerif-Regular.ttf',import.meta.url)).then(async r=>{if(!r.ok) throw Error('PDF用フォントを取得できません。');return new Uint8Array(await r.arrayBuffer());}).catch(e=>{fontPromise=null;throw e;});
  fontBytes=await fontPromise;
 }
 const font=await doc.embedFont(fontBytes,{subset:false}),supported=new Set(font.getCharacterSet());
 const check=text=>{for(const c of text) if(c!=='\n'&&!supported.has(c.codePointAt(0))) throw Error(`PDFで表示できない文字「${c}」があります。表記を確認してください。`);};
 const width=499,left=48;let page,y;
 function fresh(){page=doc.addPage([595.28,841.89]);y=790;}
 function draw(text,size=10.5){check(text);if(y<59)fresh();page.drawText(text,{x:left,y,size,font,color:rgb(0,0,0)});y-=17;}
 function wrapped(text,size=10.5){for(const line of text.split('\n')){let s='';for(const c of line){if(s&&font.widthOfTextAtSize(s+c,size)>width){draw(s,size);s='';}s+=c;}draw(s,size);}}
 fresh();draw('労働条件通知書 兼 雇用契約書',17);y-=8;wrapped('契約書の版：'+version,9);y-=10;
 for(const [key,label] of termFields){if(!terms[key])continue;if(y<110)fresh();draw(label,12);wrapped(terms[key]);y-=10;}
 if(y<120)fresh();wrapped('医院は上記条件を提示し、本人は全文を確認したうえでポータル上で同意します。同意者氏名・同意日時・対象となる契約書の版は、ポータルの同意記録に保存します。');
 const pages=doc.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:280,y:30,font,size:9}));
 doc.setTitle('労働条件通知書兼雇用契約書');doc.setLanguage('ja-JP');
 return doc.save();
}
