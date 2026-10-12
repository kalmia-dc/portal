import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {defaultStaff} from '../portal-default-staff.mjs';import {staffNameKey} from '../portal-roster-model.mjs';
export function planLaborMigration(snapshot,ownerUid){
  const users=snapshot.portalAccess?.users||{},owner=users[ownerUid];if(!ownerUid||owner?.role!=='admin'||owner.active!==true||!owner.staffId)throw Error('確認済みの有効な労務担当UIDが必要です。');
  const roster=new Map(defaultStaff.map(s=>[s.id,s]));for(const s of Object.values(snapshot.extra_staff||{}))roster.set(s.id,s);
  const names=new Map(),issues=[];for(const s of roster.values()){const normalized=staffNameKey(s.name);if(names.has(normalized))issues.push({kind:'同名の名簿',ids:[names.get(normalized),s.id]});names.set(normalized,s.id);}
  for(const [uid,m]of Object.entries(users))if(!roster.has(m.staffId)&&m.role!=='terminal')issues.push({kind:'名簿にないアカウント',uid,staffId:m.staffId||''});
  const protectedStaff=Object.fromEntries(Object.entries(users).filter(([uid,m])=>uid===ownerUid||!['staff','trainingAdmin'].includes(m.role)).filter(([,m])=>m.staffId).map(([,m])=>[m.staffId,true]));
  const service=users[snapshot.serviceAccess?.notifications?.uid];if(service?.staffId)protectedStaff[service.staffId]=true;
  return {mode:'DRY_RUN_ONLY',issues,existingCount:roster.size,draftsToImport:[...roster.keys()].filter(id=>!snapshot.laborRecords?.[id]),configCandidate:{enabled:false,uploadsEnabled:false,owners:{[ownerUid]:true},protectedStaff,maxFileBytes:5242880,maxEncodedBytes:52428800},requiredChecks:['百々さんの実UID照合','適用中ルールと候補の差分','無料プラン・残容量と通信量','既存書類の保存根拠・起算日','バックアップと復旧','本番変更の個別承認']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const [,,input,ownerUid,output]=process.argv;if(!input||!output)throw Error('入力スナップショット、確認済みUID、.labor-local内出力先を指定してください。');const privateRoot=path.resolve('.labor-local')+path.sep,target=path.resolve(output);if(!target.startsWith(privateRoot))throw Error('出力はGit対象外の.labor-local内に限定します。');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(planLaborMigration(JSON.parse(fs.readFileSync(input,'utf8')),ownerUid),null,2));console.log('Dry-run plan saved locally. No database writes.');}
