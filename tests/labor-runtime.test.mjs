import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('production adapter blocks disconnected writes, uses authenticated REST, and clears revoked HR access',async()=>{
  const listeners=new Map(),writes=[],events=[],reads=[];
  let cleared=0,authorized=0,port;
  const user={uid:'synthetic-owner'},actor={uid:user.uid,staffId:'synthetic-office'};
  const window={portalAuth:{user},dispatchEvent:e=>events.push(e.type)};
  const document={body:{replaceChildren(){cleared++;},append(){}},createElement:()=>({textContent:''})};
  const context=vm.createContext({window,document,Event:class{constructor(type){this.type=type;}},Date,Error});
  const config={options:{databaseURL:'https://example.invalid'}};
  const modules={
    'firebase-app.js':{initializeApp:()=>config},
    'firebase-database.js':{getDatabase:()=>({}),ref:(_,p)=>p,get:async()=>{},update:async(_,value)=>writes.push(value),runTransaction:async()=>({committed:true}),serverTimestamp:()=>({'.sv':'timestamp'}),onValue:(p,next,error)=>{listeners.set(p,{next,error});return()=>{};}},
    './portal-auth.js':{startPortalAuth:async()=>actor},
    './labor-store.mjs':{createLaborStore:p=>{port=p;return {authorize:async()=>{authorized++;}};}},
    './portal-default-staff.mjs':{defaultStaff:[]},
    './portal-server-profile.mjs':{readServerProfile:async args=>{reads.push(args);return {synthetic:true};}}
  };
  const source=new vm.SourceTextModule(fs.readFileSync(new URL('../labor-runtime.js',import.meta.url),'utf8'),{context});
  await source.link(spec=>{spec=spec.split('?')[0];const exports=modules[spec]||modules[spec.split('/').at(-1)];assert.ok(exports,spec);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});});
  await source.evaluate();await source.namespace.connectLabor();assert.equal(authorized,1);
  assert.throws(()=>port.update({a:1}),/通信/);assert.equal(writes.length,0);
  listeners.get('.info/connected').next({val:()=>true});await port.update({a:1});assert.equal(writes.length,1);
  await port.read('laborRecords');assert.equal(reads[0].user,user);assert.equal(reads[0].path,'laborRecords');
  listeners.get('.info/connected').next({val:()=>false});assert.throws(()=>port.update({a:2}),/通信/);assert.equal(writes.length,1);
  listeners.get('laborConfig/owners/'+user.uid).next({val:()=>false});assert.equal(cleared,1);assert.deepEqual(events,['laborAccessLost']);
  listeners.get('laborConfig/enabled').error();assert.equal(cleared,2);
});
