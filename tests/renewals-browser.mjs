import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {renewalFixture} from './renewals.test.mjs';
import {termFields} from '../onboarding-functions/contract-terms.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.ONBOARDING_PLAYWRIGHT||'playwright');
const {reviewer,staffActor,staff,state,service}=renewalFixture();
const browser=await chromium.launch({headless:true,executablePath:process.env.ONBOARDING_CHROME});
const origin='http://127.0.0.1:10675',errors=[];
const assets=new Set(['staff-renewals.html','staff-renewals.js','staff-onboarding.css','portal-common.css',
  'staff-contract.js','contract-pdf.mjs','labor-model.mjs','labor-contract-renewal.mjs','portal-page-lifecycle.mjs',
  'onboarding-functions/contract-terms.mjs','onboarding-functions/contract-renewal-terms.mjs',
  'assets/invoice/pdf-lib-1.17.1.mjs','assets/invoice/fontkit-1.1.1.mjs','assets/invoice/KalmiaInvoiceSerif-Regular.ttf']);
const js={contentType:'text/javascript; charset=utf-8'};
async function page(actor,width){
  const context=await browser.newContext({viewport:{width,height:850}});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(1);
    if(url.origin!==origin)return route.abort();
    if(path==='fixture'){
      try{
        const input=req.postDataJSON();
        if(input.action==='context' && actor.reviewer)return route.fulfill({json:{record:state.record,uid:state.uid}});
        if(input.action==='save' && actor.reviewer){
          assert.equal(input.revision,state.record.revision);
          state.record={data:input.data,revision:input.revision+1};
          return route.fulfill({json:state.record});
        }
        return route.fulfill({json:await service(actor,input)});
      }catch(error){return route.fulfill({status:400,json:{message:error.message}});}
    }
    if(path==='staff-onboarding-runtime.js')return route.fulfill({...js,body:`
      export function onboardingApi(){return async input=>{
        const response=await fetch('/fixture',{method:'POST',body:JSON.stringify(input)});
        const result=await response.json();if(!response.ok)throw Error(result.message);return result;
      }}
      export async function connectOnboarding(){return onboardingApi()}`});
    if(path==='labor-runtime.js')return route.fulfill({...js,body:`
      import {onboardingApi} from './staff-onboarding-runtime.js';
      export async function connectLabor(){
        const call=onboardingApi();
        return {renewalContext:()=>call({action:'context'}),now:()=>Date.parse('2026-11-14T12:00:00+09:00'),
          save:(data,revision)=>call({action:'save',data,revision})};
      }`});
    if(!assets.has(path))return route.fulfill({status:404,body:''});
    const type={html:'text/html; charset=utf-8',css:'text/css',ttf:'application/octet-stream'}[path.split('.').at(-1)]||js.contentType;
    return route.fulfill({contentType:type,body:await readFile(new URL('../'+path,import.meta.url))});
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(origin+'/staff-renewals.html'+(actor.reviewer?'?mode=review&staff='+staff:''));
  await page.locator('#case').waitFor();
  return page;
}
function click(page,name){return page.getByRole('button',{name,exact:true}).click();}
try{
  const admin=await page(reviewer,1080),employee=await page(staffActor,390);
  await employee.getByText('表示できる更新契約書はありません。',{exact:true}).waitFor();
  await click(admin,'新しい更新契約書を作成');
  for(const [label,value] of [['契約書の版','架空更新A'],['更新開始日','2026-11-01'],['契約終了日（期間の定めなしの場合は空欄）','2027-03-31'],['所定勤務日','毎週火曜'],['所定勤務時間','週8時間']]){
    await admin.getByLabel(label,{exact:true}).fill(value);
  }
  await admin.getByLabel('雇用形態',{exact:true}).selectOption('part');
  for(const [key,label] of termFields)if(key!=='notes')await admin.getByLabel({period:'更新基準・更新上限など',schedule:'勤務時間帯・休憩・変更の取扱い'}[key]||label,{exact:true}).fill('架空の検証用条件。');
  await click(admin,'PDFプレビューを作成');
  await admin.getByRole('link',{name:'作成した契約書PDFを開く'}).waitFor();
  await click(admin,'入力条件から準備状態で保存');
  await admin.locator('#renewals').getByText('準備中',{exact:true}).waitFor();
  await click(employee,'再読み込み');
  await employee.getByText('表示できる更新契約書はありません。',{exact:true}).waitFor();
  await click(admin,'開く');
  await admin.getByLabel('契約条件・就業規則の適用と交付可能な正式版であることを確認しました').check();
  await click(admin,'本人の確認受付を開始');
  await admin.getByText('本人の署名待ち',{exact:true}).waitFor();
  await click(employee,'再読み込み');
  await employee.getByText('本人の署名待ち',{exact:true}).waitFor();
  await click(employee,'開く');
  await employee.getByRole('link',{name:'契約書PDFを保存'}).waitFor();
  await employee.getByLabel('この契約書をポータルで受け取り、PDFを保存する方法に同意します。').check();
  await employee.getByLabel('表示された契約書の全文と労働条件を確認し、本人として同意します。').check();
  await click(employee,'本人として署名する');
  await employee.getByText('署名済み・労務担当の確認待ち',{exact:true}).waitFor();
  await click(admin,'再読み込み');
  await admin.getByText('署名済み・労務担当の確認待ち',{exact:true}).waitFor();
  await click(admin,'開く');
  await click(admin,'署名を確認して契約更新を確定');
  await admin.getByText('更新確定済み',{exact:true}).waitFor();
  await click(admin,'開く');
  await admin.getByRole('link',{name:'同意記録を保存'}).waitFor();
  assert.equal(state.record.data.type,'part');
  assert.equal(state.record.data.periods.employment.contractEnd,'2027-03-31');
  assert.equal(state.record.data.tasks['contract-renewal-review'],undefined);
  assert.equal(await employee.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Browser: prepare PDF, release, sign and finalize PASS');
}finally{await browser.close();}
