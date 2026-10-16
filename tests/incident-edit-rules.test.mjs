import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(process.env.PORTAL_TEST_DEPS?path.join(process.env.PORTAL_TEST_DEPS,'package.json'):import.meta.url);
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {ref,set,update}=require('firebase/database');
test('legacy body is frozen; followup remains available to managers; migration uses v2',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-incident-v2',database:{host:'127.0.0.1',port:9027,rules:fs.readFileSync('database.rules.json','utf8')}});
 try {
  const users={owner:{active:true,role:'staff',staffId:'author'},other:{active:true,role:'staff',staffId:'other'},admin:{active:true,role:'admin',staffId:'manager'},leader:{active:true,role:'staff',staffId:'momo'},terminal:{active:true,role:'terminal',staffId:'terminal'},revoked:{active:false,role:'admin',staffId:'manager'}};
  await env.withSecurityRulesDisabled(c=>set(ref(c.database()),{portalAccess:{users}}));
  const target=uid=>ref(env.authenticatedContext(uid).database(),'meetingManagement/incidentReports/one');
  await assertFails(set(target('owner'),{createdById:'author',reporterId:'author',details:'架空'}));
  await env.withSecurityRulesDisabled(c=>set(ref(c.database(),'meetingManagement/incidentReports/one'),{createdById:'author',reporterId:'author',details:'架空'}));
  for(const uid of ['owner','other','terminal','revoked','admin','leader'])await assertFails(update(target(uid),{details:'変更'}));
  for(const uid of ['admin','leader'])await assertSucceeds(update(target(uid),{countermeasure:'許可された対策の変更'}));
  await assertFails(set(target('owner'),null));
 } finally {await env.cleanup()}
});
