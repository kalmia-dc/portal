import {PDFDocument,rgb} from './assets/invoice/pdf-lib-1.17.1.mjs';
import fontkit from './assets/invoice/fontkit-1.1.1.mjs';
import {ISSUER,validateRecord,taxAmount,basename} from './invoice-supplement-core.mjs?v=20261029-4';

let fontBytesPromise;
export function preloadInvoiceFont(){
  if(!fontBytesPromise)fontBytesPromise=fetch(new URL('./assets/invoice/KalmiaInvoiceSerif-Regular.ttf',import.meta.url)).then(async response=>{if(!response.ok)throw Error('PDF用の日本語フォントを読み込めません。通信状況を確認してください。');return new Uint8Array(await response.arrayBuffer());}).catch(error=>{fontBytesPromise=null;throw error;});
  return fontBytesPromise;
}
export async function createInvoicePDF(input,{fontBytes,now=new Date()}={}){
  const r=validateRecord(input),doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const font=await doc.embedFont(fontBytes||await preloadInvoiceFont(),{subset:false});
  const supported=new Set(font.getCharacterSet()),page=doc.addPage([595.28,841.89]);
  const left=62,right=533,width=right-left,black=rgb(0,0,0);
  const checkText=text=>{for(const char of text)if(!supported.has(char.codePointAt(0)))throw Error(`PDF用フォントに「${char}」がありません。文字を確認してください。保存は開始していません。`);};
  const text=(value,x,top,size=10,align='left')=>{checkText(value);const tw=font.widthOfTextAtSize(value,size);if(align==='right')x-=tw;if(align==='center')x-=tw/2;page.drawText(value,{x,y:841.89-top,size,font,color:black});};
  const line=(top,x1=left,x2=right,thickness=.5)=>page.drawLine({start:{x:x1,y:841.89-top},end:{x:x2,y:841.89-top},thickness,color:black});
  const date=s=>s.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1年$2月$3日');
  const yen=n=>new Intl.NumberFormat('ja-JP').format(n)+' 円';
  text('領収証添付用',left,56,8);text(`第${r.version}版`,right,56,8,'right');line(66);
  text('インボイス補足書',297.64,108,21,'center');text('適格請求書の記載事項補足',297.64,132,9,'center');
  text('補足書発行日：'+date(r.issueDate),right,165,9,'right');text('領収書番号：'+r.receiptNumber,right,184,10,'right');
  // Wrap by measured glyph width, including long Japanese business names.
  const recipientLines=[];let current='';
  for(const char of r.recipient+' 御中'){checkText(char);if(current&&font.widthOfTextAtSize(current+char,13)>width){recipientLines.push(current);current=char;}else current+=char;}if(current)recipientLines.push(current);
  recipientLines.forEach((value,i)=>text(value,left,220+i*21,13));
  const offset=(recipientLines.length-1)*21;
  line(232+offset);text('下記の領収証に係る登録番号・適用税率・消費税額等をお知らせします。',left,264+offset,9);
  text('取引年月日',left,299+offset,10);text(date(r.transactionDate),left+85,299+offset,10);line(309+offset);
  text('取引内容',left,329+offset,10);text(r.content,left+85,329+offset,10);line(339+offset);
  const top=368+offset,bottom=444+offset,columns=[left,left+104,left+287,right];
  line(top);line(top+29);line(bottom);
  for(const x of columns)page.drawLine({start:{x,y:841.89-top},end:{x,y:841.89-bottom},thickness:.5,color:black});
  ['適用税率','課税対象額（税込）','内消費税額'].forEach((v,i)=>text(v,(columns[i]+columns[i+1])/2,top+19,9,'center'));
  ['10％',yen(r.amount),yen(taxAmount(r.amount))].forEach((v,i)=>text(v,(columns[i]+columns[i+1])/2,top+58,13,'center'));
  text('消費税額：10％課税対象額（税込）×10／110（1円未満切捨て）',left,bottom+17,7.3);
  const issuerTop=bottom+53,ix=left+42;
  const [first,second]=ISSUER.name.split('　');text(first,ix,issuerTop,11.5);text(second,ix,issuerTop+20,11.5);
  text('発行者：'+ISSUER.owner,ix,issuerTop+46,10);text('登録番号：'+ISSUER.registration,ix,issuerTop+65,10);
  text('〒131-0031 東京都墨田区墨田2-36-11',ix,issuerTop+88,9.5);text('パシオス棟201',ix,issuerTop+106,9.5);text('TEL：'+ISSUER.telephone,ix,issuerTop+126,10);
  const notes=issuerTop+160;
  if(notes+35>800)throw Error('帳票が1ページに収まりません。交付先事業者名を確認してください。保存は開始していません。');
  line(notes);text('本書は、上記領収書番号の領収証と併せて保管してください。',left,notes+18,8);
  text('本書単独では領収証として使用できません。金銭の受領を改めて証するものではありません。',left,notes+34,8);
  doc.setTitle(basename(r));doc.setAuthor(ISSUER.owner);doc.setSubject('領収証添付用インボイス補足書');doc.setLanguage('ja-JP');doc.setCreationDate(now);doc.setModificationDate(now);
  return doc.save();
}
