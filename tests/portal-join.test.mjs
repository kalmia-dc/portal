import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationChange,approvalUpdates,approveApplication,joinNameKey} from '../portal-join-model.mjs';
const user={uid:'applicant',email:'applicant@example.test',emailVerified:true,providerData:[{providerId:'google.com'}]},actor={uid:'admin',portalRole:'admin'};
const current={uid:user.uid,email:user.email,name:'架空 花子',jobRole:'DR',revision:1,submittedAt:100,state:'pending'};
const selection={mode:'new',staffId:'staff_join_test',name:current.name,role:'DR',type:'part'};
test('own resubmission is idempotent; changes advance revision; no staff ID or access role in application',()=>{
 const draft=applicationChange({user,current:null,name:current.name,jobRole:'DR',timestamp:100});assert.deepEqual(draft,current);
 assert.equal(applicationChange({user,current,name:current.name,jobRole:'DR',timestamp:200}),current);
 assert.equal(applicationChange({user,current,name:'変更名',jobRole:'DH',timestamp:200}).revision,2);
 for(const bad of [{...user,emailVerified:false},{...user,providerData:[]}])assert.throws(()=>applicationChange({user:bad,current:null,name:'名前',jobRole:'DH'}));
 assert.throws(()=>applicationChange({user,current,name:'名前',jobRole:'admin'}));
 assert.throws(()=>applicationChange({user,current:{...current,state:'approved'},name:'名前',jobRole:'DH'}));
});
test('one approval payload contains roster, staff-only member and approved request; existing binding never writes roster',()=>{
 const args={actor,current,expected:current,selection,roster:[],member:null,timestamp:200};const changes=approvalUpdates(args);
 assert.equal(Object.keys(changes).length,4);assert.equal(changes['portalAccess/users/applicant'].role,'staff');assert.equal(changes['extra_staff/staff_join_test'].type,'part');
 const existing=approvalUpdates({...args,selection:{...selection,mode:'existing'},roster:[{id:selection.staffId,name:selection.name,role:'DR',type:'spot'}]});
 assert.equal(Object.keys(existing).length,2);assert(!Object.keys(existing).some(p=>p.startsWith('extra_staff')));
 assert.throws(()=>approvalUpdates({...args,roster:[{id:'other',name:'架空　花子'}]}),/同名/);
 assert.equal(joinNameKey('Ａ B'),joinNameKey('ab'));
});
test('changed applications, non-admins, own approval and mismatched roster are rejected',()=>{
 const args={actor,current,expected:current,selection,roster:[],member:null,timestamp:200};
 assert.throws(()=>approvalUpdates({...args,current:{...current,revision:2}}),/更新/);
 assert.throws(()=>approvalUpdates({...args,actor:{uid:'staff',portalRole:'staff'}}),/管理者/);
 assert.throws(()=>approvalUpdates({...args,actor:{uid:user.uid,portalRole:'admin'}}),/自身/);
 assert.throws(()=>approvalUpdates({...args,selection:{...selection,mode:'existing'},roster:[{id:selection.staffId,name:'別人',role:'DR'}]}),/名簿/);
});
test('read and atomic-save failure are not success; lost-ack retry recognizes approved record without another write',async()=>{
 let writes=0;const args={actor,expected:current,selection,timestamp:200,readFresh:async()=>({current,roster:[],member:null}),commit:async()=>{writes++;throw Error('offline')}};
 await assert.rejects(approveApplication({...args,readFresh:async()=>{throw Error('read failure')}}),/read failure/);assert.equal(writes,0);
 await assert.rejects(approveApplication(args),/offline/);assert.equal(writes,1);
 const approved={...current,state:'approved',approval:{staffId:selection.staffId}};
 assert.deepEqual(await approveApplication({...args,readFresh:async()=>({current:approved,member:{staffId:selection.staffId,email:current.email},roster:[]})}),{alreadyApproved:true,approval:approved.approval});assert.equal(writes,1);
});
