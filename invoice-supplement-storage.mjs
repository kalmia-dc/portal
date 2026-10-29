import {validateRecord,basename,encodeRecord,assertNoCollision,assertMatchesSavedJSON} from './invoice-supplement-core.mjs?v=20261029-4';
export function sameBytes(a,b){return a.length===b.length&&a.every((byte,i)=>byte===b[i]);}
export async function saveInvoicePair({directory,input,createPDF,verifyAccess,checkActive=()=>{},allowNew=true,progress=()=>{}}){
  const record=validateRecord(input),base=basename(record),jsonName=base+'.json',pdfName=base+'.pdf',jsonText=encodeRecord(record);
  let jsonCommitted=false;
  async function names(){checkActive();if(!directory)throw Error('作業開始時に保存フォルダを選択してください。');if(await directory.queryPermission({mode:'readwrite'})!=='granted')throw Error('保存フォルダへの読み書きが許可されていません。フォルダを選び直してください。');const result=[];for await(const [name,handle]of directory.entries())if(handle.kind==='file')result.push(name);checkActive();return result;}
  async function existingJSON(){const file=await(await directory.getFileHandle(jsonName)).getFile();if(file.size>65536)throw Error('保存済みJSONが大きすぎます。');assertMatchesSavedJSON(record,await file.text());}
  async function writeNew(name,value){
    await verifyAccess();const latest=await names();if(latest.some(n=>n.toLowerCase()===name.toLowerCase()))throw Error('保存先に同名ファイルが既にあります。上書きせず停止しました。');
    assertNoCollision(latest,record,{ownJSON:name===pdfName});
    const handle=await directory.getFileHandle(name,{create:true});let writer;
    try{checkActive();writer=await handle.createWritable();await writer.write(value);checkActive();await writer.close();writer=null;}catch(error){if(writer)await writer.abort().catch(()=>{});throw error;}
    const readback=await handle.getFile();
    if(typeof value==='string'){if(await readback.text()!==value)throw Error('JSON保存後の照合に失敗しました。');}
    else if(!sameBytes(new Uint8Array(await readback.arrayBuffer()),value))throw Error('PDF保存後の照合に失敗しました。');
    return handle;
  }
  try{
    await verifyAccess();const initial=await names(),hasJSON=initial.some(n=>n.toLowerCase()===jsonName.toLowerCase());
    assertNoCollision(initial,record,{ownJSON:hasJSON});
    if(hasJSON){await existingJSON();jsonCommitted=true;}
    else if(!allowNew)throw Error('読込元のJSONが選択フォルダにありません。元の保存フォルダを選択してください。');
    progress('PDFを作成しています…');const bytes=await createPDF(record);checkActive();
    if(!(bytes instanceof Uint8Array)||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('PDFを作成できませんでした。');
    const fresh=await names();assertNoCollision(fresh,record,{ownJSON:hasJSON});if(hasJSON)await existingJSON();
    if(!hasJSON){progress('JSONを保存しています…');await writeNew(jsonName,jsonText);jsonCommitted=true;}
    progress('PDFを保存しています…');await existingJSON();const handle=await writeNew(pdfName,bytes);
    return {record,jsonName,pdfName,bytes,pdfHandle:handle,jsonText};
  }catch(error){
    if(jsonCommitted){const wrapped=new Error('JSONは保存済みですが、PDF保存は完了していません。保存フォルダを確認してください。'+(error?.message||''));wrapped.partialSaved=true;throw wrapped;}
    throw error;
  }
}
