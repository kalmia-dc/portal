import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('real auth entry clears cached identity and visible data on revoked permission',async()=>{
  const store=new Map(),listeners=new Map();let signouts=0,cleared=0;
  const raw={staffId:'tanaka',name:'田中',role:'staff',active:true};
  const user={uid:'u',email:'test@example.test',providerData:[{providerId:'google.com'}]};
  const elements=new Map();
  const el=()=>({append(){},replaceChildren(){},setAttribute(){},addEventListener(){},remove(){elements.delete('portal-auth-overlay')},set id(value){elements.set(value,this)}});
  const storage={setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const page={style:{}};
  const document={title:'test',head:el(),body:{children:[page],append(){},replaceChildren(){cleared++}},createElement:el,getElementById:id=>elements.get(id),querySelectorAll:()=>[]};
  const context=vm.createContext({document,sessionStorage:storage,localStorage:storage,window:{dispatchEvent(){}},CustomEvent:class{},location:{reload(){},assign(){}},console});
  const auth={getAuth:()=>({}),GoogleAuthProvider:class{},browserLocalPersistence:'local',getRedirectResult:async()=>null,
    onAuthStateChanged:(a,fn)=>{queueMicrotask(()=>fn(user));return()=>{}},setPersistence:async()=>{},signInWithPopup:async()=>{},signInWithRedirect:async()=>{},signOut:async()=>{signouts++}};
  const database={getDatabase:()=>({}),get:async()=>({val:()=>raw}),ref:(db,path)=>path,serverTimestamp:()=>123,update:async()=>{},onValue:(path,next,error)=>{listeners.set(path,{next,error});return()=>{}}};
  const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value)},{context});
  const authModule=synthetic(auth),dbModule=synthetic(database);
  const watcher=new vm.SourceTextModule(fs.readFileSync(new URL('../portal-session-watch.mjs',import.meta.url),'utf8'),{context});
  await watcher.link(()=>{});
  const entry=new vm.SourceTextModule(fs.readFileSync(new URL('../portal-auth.js',import.meta.url),'utf8'),{context});
  await entry.link(id=>id.endsWith('firebase-auth.js')?authModule:id.endsWith('firebase-database.js')?dbModule:watcher);
  await entry.evaluate();
  const profile=await entry.namespace.startPortalAuth({},{});
  assert.equal(profile.staffId,'tanaka');assert.ok(store.has('portalUser'));
  listeners.get('.info/connected').next({val:()=>false});
  assert.equal(signouts,0);assert.equal(page.inert,true);assert.equal(page.style.visibility,'hidden');
  listeners.get('.info/connected').next({val:()=>true});
  assert.equal(signouts,0);assert.equal(page.inert,true);
  listeners.get('portalAccess/users/u').next({val:()=>({...raw,active:false})});
  assert.equal(store.has('portalUser'),false);assert.equal(context.window.portalAuth,undefined);
  assert.equal(cleared,1);assert.equal(signouts,1);assert.ok(elements.has('portal-auth-overlay'));
});
