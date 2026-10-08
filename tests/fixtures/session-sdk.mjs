// Browser-only offline fixture: no real Firebase user, token, database or fetch.
const raw={staffId:'test',name:'テスト利用者',role:'staff',active:true};
const user={uid:'fixture',email:'fixture@example.test',providerData:[{providerId:'google.com'}],getIdToken:async()=>'fake-fixture-token'};
let connection,profile,resolveProbe;
export const getAuth=()=>({});export class GoogleAuthProvider{}
export const browserLocalPersistence='local';export const getRedirectResult=async()=>null;
export function onAuthStateChanged(a,next){queueMicrotask(()=>next(user));return()=>{};}
export const setPersistence=async()=>{};export const signOut=async()=>{};export const signInWithPopup=async()=>{};export const signInWithRedirect=async()=>{};
export const getDatabase=()=>({});export const get=async()=>({val:()=>raw});export const ref=(db,path)=>path;
export const serverTimestamp=()=>1;export const update=async()=>{};
export function onValue(path,next){if(path==='.info/connected'){connection=next;queueMicrotask(()=>next({val:()=>true}));}else{profile=next;queueMicrotask(()=>next({val:()=>raw}));}return()=>{};}
window.fetch=async()=>new Promise(resolve=>{resolveProbe=resolve;});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  if(event.data==='disconnect')connection({val:()=>false});
  if(event.data==='connect')connection({val:()=>true});
  if(event.data==='verify-ok')resolveProbe?.({status:200,ok:true,json:async()=>raw});
  if(event.data==='revoke')profile({val:()=>({...raw,active:false})});
});
