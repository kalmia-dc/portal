import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getDatabase} from 'firebase-admin/database';
import {getStorage} from 'firebase-admin/storage';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {defineString} from 'firebase-functions/params';
import {createOnboardingService, OnboardingError, safeKey} from './service.mjs';
import {ROLES} from './catalog.mjs';
import {onboardingDatabaseAuth} from './database-identity.mjs';
import {changesOnboardingStatus,onboardingIsComplete} from './onboarding-access.mjs';

initializeApp({
  databaseURL:'https://kalmia-shift-default-rtdb.asia-southeast1.firebasedatabase.app',
  databaseAuthVariableOverride:onboardingDatabaseAuth,
});
const serviceAccount=defineString('ONBOARDING_SERVICE_ACCOUNT');
const options = {region:'asia-southeast1',maxInstances:2,minInstances:0,concurrency:8,memory:'512MiB',timeoutSeconds:60,
  cors:['https://kalmia-dc.github.io'],serviceAccount};

function active(life, now) {
  if(life?.state==='stopped') return false;
  if(life?.hrManaged!==true) return true;
  return (!life.currentCancelled && life.startAt<=now && now<life.endAt) ||
    (life.previousStartAt<=now && now<life.previousEndAt);
}

function employment(record) {
  const data = record?.data;
  const period = data?.periods?.[data.currentPeriod];
  if(!data || !['confirmed','retiring'].includes(data.status) || !safeKey(data.currentPeriod) ||
     !Object.hasOwn(ROLES,data.role) || !period || period.cancelled || !(period.startAt<=Date.now() && Date.now()<period.endAt)) return null;
  return {period:data.currentPeriod,role:data.role,name:data.basic?.fullName||data.basic?.name||''};
}

async function authenticate(request, read) {
  const uid = request.auth?.uid;
  if(!safeKey(uid) || request.auth.token.firebase?.sign_in_provider!=='google.com') {
    throw new OnboardingError('unauthenticated','登録済みのGoogleアカウントでログインしてください。');
  }
  const [user,member,notification,reviewer,enabled] = await Promise.all([
    getAuth().getUser(uid),read('portalAccess/users/'+uid),read('serviceAccess/notifications/uid'),
    read('laborConfig/owners/'+uid),read('laborConfig/enabled'),
  ]);
  if(user.disabled || !request.auth.token.email_verified || !Number.isInteger(request.auth.token.auth_time) ||
     (user.tokensValidAfterTime && request.auth.token.auth_time*1000<Date.parse(user.tokensValidAfterTime)) ||
     uid===notification || member?.active!==true || !safeKey(member.staffId) ||
     !['staff','trainingAdmin','admin'].includes(member.role)) {
    throw new OnboardingError('permission-denied','このアカウントは入社手続きを利用できません。');
  }
  const lifecycle=await read('staffLifecycle/'+member.staffId);
  if(!active(lifecycle,Date.now())) {
    if(request.data?.action==='status' && request.data.mode!=='review' && lifecycle?.hrManaged===true &&
       lifecycle.state==='active' && lifecycle.currentCancelled!==true && lifecycle.startAt>Date.now() &&
       (await read('onboardingAccess/'+uid))?.pending===true) {
      throw new OnboardingError('failed-precondition','受付開始待ちです。入社日以降に労務担当が手続きを開始すると提出できます。');
    }
    throw new OnboardingError('permission-denied','このアカウントは入社手続きを利用できません。');
  }
  return {uid,staffId:member.staffId,reviewer:reviewer===true && enabled===true};
}

function storage(config) {
  function bucketFor(path) {
    const name = path.restricted ? config.vaultBucket : config.documentsBucket;
    if(typeof name!=='string' || !/^[a-z0-9][a-z0-9.-]{2,61}$/.test(name) || name===config.documentsBucket && path.restricted) {
      throw new OnboardingError('failed-precondition','書類の保存先を確認してください。');
    }
    return getStorage().bucket(name);
  }
  const object = (path,generation) => bucketFor(path).file(
    `onboarding/${path.staff}/${path.period}/${path.key}.json`,
    generation ? {generation} : undefined,
  );
  return {
    async metadata(path) {
      try {
        const [objectMeta] = await object(path).getMetadata();
        const {generation,metadata} = objectMeta;
        return {...JSON.parse(metadata.record),generation};
      } catch(error) {
        if(error.code===404 && error.errors?.some(e=>e.reason==='notFound')) {
          // A missing bucket and a missing object both return 404.
          await bucketFor(path).getMetadata();
          return null;
        }
        throw error;
      }
    },
    async body(path,record) {
      if(!record) return {};
      const [data] = await object(path,record.generation).download();
      return JSON.parse(data.toString('utf8'));
    },
    async write(path,record,next,body) {
      if(path.restricted) {
        const [policy] = await bucketFor(path).getMetadata();
        if(!/^\d+$/.test(config.vaultProjectNumber||'') || String(policy.projectNumber)!==config.vaultProjectNumber ||
           config.vaultProjectNumber==='714175473480' ||
           policy.iamConfiguration?.publicAccessPrevention!=='enforced' ||
           policy.iamConfiguration?.uniformBucketLevelAccess?.enabled!==true ||
           policy.versioning?.enabled || Number(policy.softDeletePolicy?.retentionDurationSeconds||0)!==0 || policy.retentionPolicy) {
          throw new OnboardingError('failed-precondition','マイナンバーの保存と削除の設定を確認してください。');
        }
      }
      const data = body ?? await this.body(path,record);
      try {
        await object(path).save(JSON.stringify(data),{resumable:false,
          preconditionOpts:{ifGenerationMatch:record?.generation||0},
          metadata:{contentType:'application/json',cacheControl:'private,no-store',metadata:{record:JSON.stringify(next)}},
        });
      } catch(error) {
        if(error.code===412 || error.code===404) throw new OnboardingError('aborted','保存状態が変わりました。画面を更新してください。');
        throw error;
      }
    },
  };
}

export const staffOnboarding = onCall(options,async request=>{
  request.rawRequest.res?.setHeader('Cache-Control','private, no-store');
  try {
    const read = async path => (await getDatabase().ref(path).get()).val();
    const actor = await authenticate(request, read);
    const root = getDatabase().ref('onboardingV1');
    const config = (await root.child('config').get()).val();
    const audit = async ({staff,period},uid,event,revision,operation)=>{
      const entry=root.child(`vaultAudit/${staff}/${period}/${operation ? uid+'_'+operation+'_'+event : randomUUID()}`);
      const evidence={uid,event,revision,at:Date.now()};
      if(operation) await entry.transaction(old=>old||evidence);
      else await entry.set(evidence);
    };
    if(config?.vaultEnabled===true && Object.values(config.vaultReaders||{}).filter(v=>v===true).length!==2) {
      throw new OnboardingError('failed-precondition','画像の取扱担当者の設定を確認してください。');
    }
    const documents = storage(config||{});
    const service = createOnboardingService({
      ...documents,config:async()=>config,now:Date.now,
      candidate:async staff=>{
        const [record,uid] = await Promise.all([read('laborRecords/'+staff),read('laborAccountBindings/'+staff)]);
        const candidate=employment(record);
        return candidate && safeKey(uid) ? {...candidate,uid} : null;
      },
      enrollment:async (staff,period)=>(await root.child(`cases/${staff}/${period}`).get()).val(),
      assign:async (staff,period,data)=>root.child(`cases/${staff}/${period}`).transaction(old=>old||data),
      eligible:async ()=>{
        const [records,assignments,bindings] = await Promise.all([
          read('laborRecords'),read('onboardingV1/cases'),read('laborAccountBindings'),
        ]);
        const result=Object.entries(records||{}).flatMap(([staff,record])=>{
          const candidate=employment(record);
          return candidate && safeKey(bindings?.[staff]) ? [{staff,...candidate,opened:!!assignments?.[staff]?.[candidate.period]}] : [];
        });
        const listed=new Set(result.map(item=>item.staff+'/'+item.period));
        for(const [staff,periods] of Object.entries(assignments||{})) {
          for(const [period,saved] of Object.entries(periods)) {
            if(listed.has(staff+'/'+period) || !Object.hasOwn(ROLES,saved.role)) continue;
            const data=records?.[staff]?.data;
            result.push({staff,period,role:saved.role,name:data?.basic?.fullName||data?.basic?.name||staff,
              startDate:data?.periods?.[period]?.startDate||'',opened:true,archived:true});
          }
        }
        return result;
      },
      audit,
    });
    const input=request.data||{};
    const review=input.mode==='review';
    const mutating=changesOnboardingStatus(input.action);
    if((review && !actor.reviewer) || (!mutating && input.action!=='status')) return await service(actor,input);
    const staff=review?input.staff:actor.staffId;
    if(!safeKey(staff)) return await service(actor,input);
    const uid=review?await read('laborAccountBindings/'+staff):actor.uid;
    if(!safeKey(uid)) return await service(actor,input);
    const access=getDatabase().ref('onboardingAccess/'+uid);
    const current=(await access.get()).val();
    if(current?.staff!==staff || !safeKey(current.period) || (review && current.period!==input.period) ||
       (!mutating && (current.pending!==true || current.lockUntil>Date.now()))) return await service(actor,input);
    const enrollment=(await root.child(`cases/${staff}/${current.period}`).get()).val();
    if(!enrollment || !Object.hasOwn(ROLES,enrollment.role)) return await service(actor,input);
    const operation=randomUUID();
    const lockUntil=Date.now()+120000;
    const relock=review && (input.action==='return' || input.action==='require');
    const lock=await access.transaction(value=>{
      if(value?.staff!==staff || value.period!==current.period || value.lockUntil>Date.now()) return;
      return {...value,pending:value.pending||relock,operation,lockUntil};
    });
    if(!lock.committed) {
      if(!mutating) return await service(actor,input);
      throw new OnboardingError('aborted','別の操作を処理中です。少し待ってからやり直してください。');
    }
    let complete=false;
    try {
      return await service(actor,input);
    } finally {
      try {
        complete=await onboardingIsComplete({staff,period:current.period,role:enrollment.role,metadata:documents.metadata});
      } finally {
        await access.transaction(value=>value?.operation===operation
          ? {staff,period:current.period,pending:!complete} : undefined);
      }
    }
  } catch(error) {
    if(error instanceof OnboardingError) throw new HttpsError(error.code,error.message);
    console.error('staffOnboarding: backend request failed', {code:typeof error?.code==='number'?error.code:'internal'});
    throw new HttpsError('internal','手続きを処理できませんでした。時間をおいて再試行してください。');
  }
});
