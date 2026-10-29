import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveInvoicePair} from '../invoice-supplement-storage.mjs';
import {encodeRecord} from '../invoice-supplement-core.mjs';
const record={receiptNumber:'UNIT-1',transactionDate:'2026-10-29',issueDate:'2026-10-29',recipient:'検証用事業者',content:'歯科健診費',amount:8800,version:1};
const base='UNIT-1_20261029_v01',pdf=new TextEncoder().encode('%PDF-1.7\nfixture');
function fixture(seed=[],{failPDF=false,permission='granted',corruptReadback=false}={}){
 const files=new Map(seed),writes=[];
 const directory={queryPermission:async()=>permission,async *entries(){for(const name of files.keys())yield [name,{kind:'file'}];},async getFileHandle(name,{create=false}={}){
  if(!files.has(name)){if(!create)throw Error('missing');files.set(name,'');}
  return {getFile:async()=>new File([files.get(name)],name),createWritable:async()=>{let contents;return {write:async data=>{if(failPDF&&name.endsWith('.pdf'))throw Error('PDF write denied');contents=data;},close:async()=>{writes.push(name);files.set(name,corruptReadback?'corrupt':contents);},abort:async()=>{}};}};
 }};
 const run=options=>saveInvoicePair({directory,input:record,createPDF:async()=>pdf.slice(),verifyAccess:async()=>{},...options});
 return {files,writes,run};
}
test('saves and verifies JSON before PDF under one operation',async()=>{const f=fixture();const result=await f.run();assert.deepEqual(f.writes,[base+'.json',base+'.pdf']);assert.equal(f.files.get(base+'.json'),encodeRecord(record));assert.deepEqual(result.bytes,pdf);});
test('existing PDF/JSON pair or PDF-only cannot be overwritten',async()=>{for(const seed of [[[base+'.pdf',pdf]],[[base+'.json',encodeRecord(record)],[base+'.pdf',pdf]]]){const f=fixture(seed);await assert.rejects(f.run(),/既にあります/);assert.deepEqual(f.writes,[]);}});
test('resumes from matching JSON only without rewriting that JSON',async()=>{const f=fixture([[base+'.json',encodeRecord(record)]]);await f.run({allowNew:false});assert.deepEqual(f.writes,[base+'.pdf']);});
test('mismatching JSON and later versions stop before generation or writing',async()=>{for(const seed of [[[base+'.json',encodeRecord({...record,amount:9900})]],[['UNIT-1_20261101_v03.pdf',pdf]]]){const f=fixture(seed);let generated=false;await assert.rejects(f.run({createPDF:async()=>{generated=true;return pdf;}}));assert.equal(generated,false);assert.deepEqual(f.writes,[]);}});
test('font/generator failure leaves no new files',async()=>{const f=fixture();await assert.rejects(f.run({createPDF:async()=>{throw Error('missing glyph');}}),/missing glyph/);assert.equal(f.files.size,0);});
test('permission denial and access loss stop all writes',async()=>{const f=fixture([],{permission:'denied'});await assert.rejects(f.run(),/許可されていません/);assert.equal(f.files.size,0);const g=fixture();await assert.rejects(g.run({verifyAccess:async()=>{throw Error('access lost');}}),/access lost/);assert.equal(g.files.size,0);});
test('PDF write failure retains JSON and reports partial status',async()=>{const f=fixture([],{failPDF:true});await assert.rejects(f.run(),error=>error.partialSaved===true&&/JSONは保存済み/.test(error.message));assert.equal(f.files.get(base+'.json'),encodeRecord(record));assert.deepEqual(f.writes,[base+'.json']);});
test('readback corruption never reports success',async()=>{const f=fixture([],{corruptReadback:true});await assert.rejects(f.run(),/照合に失敗/);assert.deepEqual(f.writes,[base+'.json']);});
test('an externally loaded original missing from the folder cannot create an original',async()=>{const f=fixture();await assert.rejects(f.run({allowNew:false}),/読込元のJSON/);assert.equal(f.files.size,0);});
test('role loss after JSON stops PDF creation and reports partial status',async()=>{const f=fixture();await assert.rejects(f.run({verifyAccess:async()=>{if(f.files.has(base+'.json'))throw Error('access lost');}}),e=>e.partialSaved===true);assert.equal(f.files.has(base+'.pdf'),false);});
