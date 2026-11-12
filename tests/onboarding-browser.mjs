import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fixture,people,png} from './onboarding-fixture.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ONBOARDING_PLAYWRIGHT||'playwright');
const {service}=fixture();
const mime={html:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript'};
const pages = new Set(['/staff-onboarding.html','/staff-onboarding.css','/staff-onboarding.js',
  '/portal-common.css','/onboarding-functions/catalog.mjs','/onboarding-functions/approved-documents.mjs','/staff-identity-form.html']);
const base='http://127.0.0.1:10674';
const headers={'Content-Security-Policy':"default-src 'self'; connect-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'"};
async function serve(route) {
  const req=route.request();
  if(!req.url().startsWith(base+'/')) return route.abort();
  const path=new URL(req.url()).pathname;
  if(path==='/_fixture' && req.method()==='POST'){
    try {
      const {actor,request}=req.postDataJSON();
      return route.fulfill({json:await service(people[actor],request)});
    }catch(error){return route.fulfill({status:400,json:{message:error.message}});}
  }
  if(path==='/staff-onboarding-runtime.js'){
    return route.fulfill({contentType:'text/javascript; charset=utf-8',body:`export async function connectOnboarding(){
      const actor=new URLSearchParams(location.search).get('fixture');
      return async request=>{
        const response=await fetch('/_fixture',{method:'POST',body:JSON.stringify({actor,request})});
        const result=await response.json();
        if(!response.ok)throw Error(result.message);
        return result;
      };
    }`});
  }
  if(!pages.has(path)) return route.fulfill({status:404});
  return route.fulfill({headers,contentType:mime[path.split('.').pop()]+'; charset=utf-8',
    body:await readFile(new URL('..'+path,import.meta.url))});
}
const errors=[];
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.ONBOARDING_CHROME,headless:true});
  const actorPage=async(actor,review=false,width=390)=>{
    const context=await browser.newContext({viewport:{width,height:860}});
    await context.route('**/*',serve);
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(5000);
    await page.goto(base+'/staff-onboarding.html?fixture='+actor+(review?'&mode=review':''));
    if(review) {
      const select=page.getByLabel('職員を選ぶ');
      await select.selectOption({label:'架空 医師（歯科医師）・受付開始済み'});
    }
    await page.locator('#case').waitFor();
    return page;
  };
  const item=(page,label)=>page.locator('.item').filter({has:page.getByText(label,{exact:true})});
  const state=(page,label,expected)=>item(page,label).getByText(expected,{exact:true}).waitFor();
  const open=(page,label)=>item(page,label).getByRole('button').click();
  const click=(page,name)=>page.locator('dialog').getByRole('button',{name,exact:true}).click();
  const attach=async(page,label,large=false)=>{
    const original=Buffer.from(png.data,'base64');
    const buffer=large?Buffer.concat([original,Buffer.alloc(3*1024*1024)]):original;
    await page.getByLabel(label,{exact:true}).setInputFiles({name:'fixture.png',mimeType:'image/png',buffer});
  };

  for(const [actor,license,registration] of [['assistant',false,false],['hygienist',true,false],['doctor',true,true]]) {
    const page=await actorPage(actor);
    assert.equal(await item(page,'職種の免許証').count(),Number(license));
    assert.equal(await item(page,'保険医登録票の写し').count(),Number(registration));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.context().close();
  }
  const employee=await actorPage('doctor');
  const reviewer=await actorPage('hr',true,1180);
  await open(employee,'採用時誓約書');
  await employee.getByText(/試用期間が設けられている場合/).waitFor();
  await employee.getByLabel('全文を確認し、本人として署名します').check();
  await click(employee,'提出する');
  await state(employee,'採用時誓約書','確認待ち');
  await open(employee,'機密保持誓約書');
  await employee.getByRole('heading',{name:'第5条　裁判管轄'}).waitFor();
  await click(employee,'閉じる');
  await open(employee,'服務規程チェック表');
  assert.equal(await employee.locator('dialog input[type=checkbox]').count(),44);
  await click(employee,'閉じる');
  if(process.env.ONBOARDING_PREVIEW) {
    await employee.screenshot({path:process.env.ONBOARDING_PREVIEW+'/staff-onboarding-mobile.png',fullPage:true});
    const print=await employee.context().newPage();
    await print.goto(base+'/staff-identity-form.html');
    await print.pdf({path:process.env.ONBOARDING_PREVIEW+'/staff-identity-form-local.pdf',preferCSSPageSize:true});
    await print.close();
  }
  const bank='給与口座振込依頼書';
  await open(employee,bank);
  for(const [label,value] of Object.entries({'金融機関名':'架空銀行','支店名':'架空支店','預金種別':'普通','口座番号':'0012345','口座名義（カナ）':'カクウ','振込開始月':'2026-11'})) {
    await employee.getByLabel(label,{exact:true}).fill(value);
  }
  await click(employee,'途中保存');
  await employee.locator('dialog').waitFor({state:'hidden'});
  await employee.reload();
  await open(employee,bank);
  assert.equal(await employee.getByLabel('口座番号',{exact:true}).inputValue(),'0012345');
  await employee.getByLabel('内容を確認し、同意します',{exact:true}).check();
  await click(employee,'提出する');
  await employee.getByText('必要な画像・書類を添付してください。',{exact:true}).waitFor();
  await attach(employee,'添付ファイル');
  await click(employee,'提出する');
  await state(employee,bank,'確認待ち');
  await reviewer.reload();
  await reviewer.getByLabel('職員を選ぶ').selectOption({label:'架空 医師（歯科医師）・受付開始済み'});
  await open(reviewer,bank);
  assert.equal(await reviewer.getByLabel('口座番号',{exact:true}).inputValue(),'0012345');
  await reviewer.getByLabel('差し戻し理由').fill('確認画像を見直してください。');
  await click(reviewer,'差し戻す');
  await state(reviewer,bank,'差し戻し');
  await employee.reload();
  await open(employee,bank);
  await employee.getByText('確認画像を見直してください。',{exact:true}).waitFor();
  await employee.getByLabel('内容を確認し、同意します',{exact:true}).check();
  await attach(employee,'添付ファイル');
  await click(employee,'提出する');
  await state(employee,bank,'確認待ち');

  const number='マイナンバーの確認画像';
  await open(employee,number);
  await attach(employee,'表面の画像',true);
  await attach(employee,'裏面の画像');
  await click(employee,'提出する');
  await state(employee,number,'確認待ち');
  await reviewer.reload();
  await reviewer.getByLabel('職員を選ぶ').selectOption({label:'架空 医師（歯科医師）・受付開始済み'});
  await state(reviewer,number,'確認待ち');
  assert.equal(await item(reviewer,number).getByRole('button').count(),0);
  const director=await actorPage('director',true);
  await open(director,number);
  await director.getByAltText('確認画像の裏面').waitFor();
  assert.ok(await director.getByAltText('確認画像の裏面').evaluate(img=>img.complete&&img.naturalWidth>0));
  await click(director,'確認済みにする');
  await state(director,number,'確認済み');
  await open(director,number);
  await director.getByLabel('必要な手続きが終わり、画像が不要になったことを確認しました').check();
  await click(director,'画像を削除する');
  await state(director,number,'確認済み・画像削除済み');
  assert.equal(await director.locator('.file-preview').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Chrome: 3職種・390px表示・給与口座の下書き/添付/差し戻し/再提出・番号画像の権限/削除に合格');
} finally {
  await browser?.close();
}
