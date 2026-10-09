import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
export async function makeHarness(){
  const nodes=new Map(),alerts=[];
  const node=()=>{const classes=new Set();return {children:[],style:{setProperty(){}},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},appendChild(n){this.children.push(n)},addEventListener(){},setAttribute(){},querySelectorAll(){return this.children},value:'',checked:false,textContent:'',set innerHTML(v){this.children=[];this._html=v},get innerHTML(){return this._html||''}}};
  const field=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
  const state={store:{shifts:{'2026-10':{}},shift_locks:{},portalAccess:{users:{}}},writes:[],denied:false,readDenied:false,rejectAfterProposal:false,beforeTransaction:null,hold:null};
  const read=p=>p.split('/').reduce((v,k)=>v?.[k],state.store)??null;
  const write=(p,v)=>{const a=p.split('/'),key=a.pop();let parent=state.store;for(const part of a)parent=parent[part]??={};parent[key]=v;};
  const fb={shiftConnected:true,db:{},ref:(_,p)=>p,
    readMembersFromServer:async()=>{if(state.readDenied)throw Error('SERVER_READ_FAILED');return structuredClone(state.store.portalAccess.users)},
    get:async p=>{if(state.lockReadDenied)throw Error('LOCK_READ_FAILED');return {val:()=>structuredClone(read(p))}},
    runTransaction:async(p,fn,options)=>{
      state.started?.();if(state.hold)await state.hold;
      if(state.denied)throw Error('PERMISSION_DENIED');if(state.beforeTransaction)state.beforeTransaction();
      const next=fn(structuredClone(read(p)));
      if(next===undefined)return {committed:false};
      if(state.rejectAfterProposal)throw Error('CONNECTION_LOST_BEFORE_COMMIT');
      write(p,structuredClone(next));state.writes.push({path:p,options});
      return {committed:true,snapshot:{val:()=>structuredClone(next)}};
    }};
  const c=vm.createContext({console,structuredClone,crypto:webcrypto,Date,Math,Set,Object,Array,String,Number,JSON,Error,URLSearchParams,
    alert:x=>alerts.push(x),confirm:()=>true,setTimeout(){},fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('portal-holidays.json'))}),
    window:{_fb:fb,addEventListener(){}},document:{getElementById:field,querySelectorAll:()=>[],createElement:node,body:node()},localStorage:{getItem:()=>null},location:{search:'',hash:''}});
  const run=s=>vm.runInContext(s,c);
  for(const file of ['clinic-leave.js','shift-role-balance.js','shift-entry.js','shift-staff-month.js','shift-member-access.js','shift-staff-order.js'])run(fs.readFileSync(file,'utf8'));
  const html=fs.readFileSync('shift.html','utf8');run([...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].find(([,a,s])=>!a&&s.includes('const SHIFT'))[2]);await run('window.__holidayDataReady');
  run(`currentYear=2026;currentMonth=9;currentUser={role:'admin'};render=()=>{};
    STAFF=[{id:'a',name:'架空医師A',role:'DR',type:'spot'},{id:'b',name:'架空衛生士B',role:'DH',type:'full'}];receiveShiftMembers({});staffOrderLoaded=true;`);
  const reload=()=>{c.loaded=structuredClone(state.store.shifts);run("allShiftData=loaded;loadShiftForMonth(2026,9);staffOrderRecord=loaded.__displayOrder??null");};
  field('monthStaff').value='a';field('entryStaff').value='a';field('entryDate').value='2026-11-20';
  return {run,field,nodes,state,fb,alerts,reload,read,write};
}
