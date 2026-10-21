import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {accountPersonName} from '../portal-person-display.mjs';
import {speakerInfo,changeThread} from '../support-model.mjs';
const director='bYJNghzzWBeZ8iDOA67CM4q316p2';
test('verified account alone maps to director; conflicting accounts and staff IDs stay distinct',()=>{
 assert.equal(accountPersonName('杉平',director),'院長');
 assert.equal(accountPersonName('杉平','other-uid'),'杉平');
 assert.equal(accountPersonName('杉平',director,'other-staff'),'杉平');
 assert.equal(accountPersonName('別名','', 'sugihira'),'院長');
});
test('human director and AI labels remain distinct; audit event is never rewritten',()=>{
 const e={type:'message',actorName:'杉平',actorUid:director,actorRole:'admin',authorType:'human',source:'portal-ui',body:'本文の杉平はそのまま'};
 const before=JSON.stringify(e);assert.equal(speakerInfo(e).label,'院長（管理者）');assert.equal(speakerInfo(e).ai,false);assert.equal(JSON.stringify(e),before);
 const ai=speakerInfo({...e,authorType:'ai',source:'hirasol-assisted'});
 assert.equal(ai.label,'ヒラソル（AIアシスタント）');assert.match(ai.note,/送信操作：院長/);assert(ai.note.includes(director));
 assert.equal(speakerInfo({...e,actorUid:'someone-else'}).label,'杉平（管理者）');
});
test('message creation still stores raw actor name and UID, not display name',()=>{
 const result=changeThread(null,{kind:'create',requestId:'fixture-director',body:'本文の杉平'}, {uid:director,name:'杉平',role:'admin'});
 assert.equal(result.value.meta.ownerName,'杉平');
 assert.equal(result.value.events['fixture-director'].actorName,'杉平');
 assert.equal(result.value.events['fixture-director'].actorUid,director);
 assert.equal(result.value.events['fixture-director'].body,'本文の杉平');
 const source=fs.readFileSync('support-model.mjs','utf8').replace(/\r\n/g,'\n');
 const previous=execFileSync('git',['show','HEAD:support-model.mjs'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
 assert.equal(source.slice(source.indexOf('export function changeThread')),previous.slice(previous.indexOf('export function changeThread')));
});
test('labor formal name input and storage remain raw while list and headings use display helper',()=>{
 const s=fs.readFileSync('labor-ui.js','utf8');
 assert(s.includes("field('basic_'+key).value=data.basic[key]"));
 assert(s.includes('personName(d.basic.name,d.staffId)'));
 assert(s.includes('personName(data.basic.name,data.staffId)'));
});
