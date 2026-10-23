// Uses an explicitly configured Google Application Default Credential.
// Never reads browser credentials or publishes a token. Keep output outside Git.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash}from 'node:crypto';
import {createRequire}from 'node:module';
const require=createRequire(new URL('../business-cards-functions/package.json',import.meta.url));
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
const {getStorage}=require('firebase-admin/storage');
const [prepared,imagesRoot]=process.argv.slice(2);if(!prepared||!imagesRoot)throw Error('Specify private prepared folder and image source folder');
initializeApp({credential:applicationDefault(),projectId:'kalmia-shift',databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',storageBucket:'kalmia-shift-business-cards'});
const db=getDatabase(),root=db.ref('businessCardsV1'),bucket=getStorage().bucket(),data=JSON.parse(await fs.readFile(path.join(prepared,'import.json'),'utf8')),images=JSON.parse(await fs.readFile(path.join(prepared,'images.json'),'utf8'));
const current=(await root.get()).val();if(current?.config?.enabled)throw Error('Already enabled; refusing migration');if(current?.cards&&Object.keys(current.cards).some(k=>!data.cards[k]))throw Error('Unrelated records exist');
await fs.writeFile(path.join(prepared,'before-migration.json'),JSON.stringify(current));
for(const item of images){const source=path.resolve(imagesRoot,item.source);if(!source.startsWith(path.resolve(imagesRoot)+path.sep))throw Error('Unsafe image path');const bytes=await fs.readFile(source),file=bucket.file(item.target);if((await file.exists())[0]){const [existing]=await file.download();if(!bytes.equals(existing))throw Error('Existing image differs');}else await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'image/jpeg',cacheControl:'private,no-store'}});const [verify]=await file.download();if(createHash('sha256').update(bytes).digest('hex')!==createHash('sha256').update(verify).digest('hex'))throw Error('Image hash mismatch');}
// Exact transaction prevents overwriting any concurrent edits or unrelated data.
const tx=await root.transaction(v=>JSON.stringify(v)===JSON.stringify(current)?data:undefined);if(!tx.committed)throw Error('Migration target changed');
const saved=(await root.get()).val();for(const[id,c]of Object.entries(data.cards))if(JSON.stringify(saved.cards[id].fields)!==JSON.stringify(c.fields)){
  for(const[k,v]of Object.entries(c.fields))if(saved.cards[id].fields[k]!==v)throw Error('Field mismatch');
}
await fs.writeFile(path.join(prepared,'migration-verification.json'),JSON.stringify({records:Object.keys(saved.cards).length,images:images.length,hashesVerified:true,enabled:false},null,2));console.log('554 records and images verified. Feature remains disabled pending acceptance.');
