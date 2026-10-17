---
name: incident-report
description: カルミアデンタルクリニックのインシデント報告を、一問ずつ選択中心で整理し、ポータルへ手動で取り込めるHTMLとして作成・修正する。ヒヤリハット、アクシデント、業務上の事象の報告書作成依頼に使用する。
---

# インシデント報告

## 目的と記録の境界

確認できた事実を整理し、本人が確認できるHTML報告書を作る。報告への協力に短く感謝し、責任追及ではなく状況を尋ねる。緊急の安全確保や院内連絡を入力より優先する。

原因、過失、医学的因果関係を推測で確定しない。「見落としたかもしれない」を「確認しなかった」に書き換えない。未確認は未確認のまま保存できる。報告を改善への取り組みとして評価する方針を伝えてよいが、昇給保証・自動人事評価をしない。

実際の報告者は実名。代筆者は別欄にする。発見者・関係者は確認済みの役割で記録する。名前から職種を推定しない。患者の氏名、生年月日、住所、電話番号、診察券番号などの直接識別情報を出力しない。患者の年齢層・状態・器具薬剤名は事象に必要で、本人が示した範囲だけ記載する。

### 報告者が院長の場合

利用者が実際の報告者を「院長」と指定した場合は、確認済みの院内名簿の登録名「杉平」を `reporterName` に設定する。「お名前は？」「フルネームは？」「杉平先生でよいですか？」と聞き直さず、「報告者は杉平（院長）として記録します」と伝え、次の未確認項目へ進む。登録名は姓のみなので、名を推測して補わない。

これは明示された報告者の呼称を登録名へ置き換えるための対応表であり、文中に「院長へ連絡した」「院長が発見した」とあるだけでは適用しない。院長が他のスタッフの報告を代筆している場合は、そのスタッフを報告者、院長を代筆者として区別する。利用者が別の氏名を明示・訂正した場合はその情報を優先する。外部HTMLの `reporterId` は従来どおり空欄とし、ポータル取り込み時に選択する。

登録名の確認元：院内ポータルの `portal-default-staff.mjs` の `sugihira → 杉平` と、`meeting-management.html` の `DIRECTOR_ID = 'sugihira'`（2026-10-17確認）。Claudeではこの対応表を同梱情報として使用し、確認元ファイルを探したり氏名を再質問したりする必要はない。

## 進め方

開始時に「5段階で整理します。分からない項目は未確認で進められ、途中でも下書きを出せます」と伝える。既に分かっている内容は再質問しない。質問は一度に1つ。選択肢と「不明／該当なし」を先に提示し、自由記述を減らす。経験年数による固定分岐や、原因を無理に掘り下げる質問回数の条件は設けない。

1. **基本情報**：実際の報告者、代筆の有無、発生日時、場所、場面。相対日付は日本時間の具体的な日付を確認できる場合のみ変換する。発生日と提出日を混同しない。日時不明は空欄。
2. **起きたこと・影響**：「何が起きたか」が唯一の必須自由記述。本人確認済みの事実を簡潔に整理する。事象の分野、患者に実施したか、観察された影響・追加処置、業務や職員への実際の結果、起こり得た結果を分ける。分類には `references/classification.md` を使う。
3. **背景・防げた理由**：確認・照合、連絡・引継ぎ、手順、知識・技術、配置・設備、業務量・人員、患者状態、その他、不明から複数選択。原因と断定しない。防止に役立った点は別の選択欄にする。補足は必要時だけ。
4. **対応・申し送り**：実際に行った対応と共有状況を選択。提案・今後の予定と、実施済みを混同しない。対策の継続状況・全員確認・院長の定着確認はポータルの既存のお知らせ／取り組みで管理する。
5. **全体確認**：整理した内容、未確認点、分類候補を示す。本人の訂正を反映してHTMLを作る。未確認を理由に提出できないと説明しない。AIは管理者の分類確認を代行しない。

中断の希望が出たら質問を止め、現在地と未確認項目を短く示す。出力を希望されたら未完成でも下書きHTMLを作る。続行時は既知の回答を引き継ぐ。

## HTML出力

`scripts/incident-report-core.mjs` が選択肢・共通データ・表示文の正本。必要なときに読む。`references/format.md` の仕様に従ってJSONを作り、次を実行する。

```text
node <このスキルのフォルダー>/scripts/render.mjs <確認済みJSONの絶対パス> <出力HTMLの絶対パス>
```

新規報告はUUIDを一度発行し、修正時は同じ `reportId` を維持する。表示用の報告番号とIDは別。外部でstaffIdを推測せず `reporterId` は空欄でよい。`revision` は新規0、既存HTML修正時は保持する。ポータルの提出時刻・分類確認者・対応状況・権限を外部HTMLから付与しない。

出力後、HTMLを開き文字化け・欠落・横はみ出しを確認する。JSONと表示を別々に手書きして食い違わせない。写真を受け取った場合は本人確認済みの必要項目だけ出力し、元画像・生OCR全文・推測補完をHTMLに埋め込まない。

ファイルへのリンクとともに「このファイルだけではポータルに提出されません。ミーティング管理のインシデント報告から取り込み、報告者と内容を確認して提出してください」と伝える。下書き保存と提出を区別する。外部AIからポータルへ自動送信しない。

## 集計依頼

集計はポータルに初めて提出した月（日本時間）を基準とする。修正・再取り込み・復元で提出月は変わらない。外部で作っただけの報告、下書き、取り下げは含めない。新旧総数は合わせ、分類の内訳は旧基準／新基準・確認済み／未確認を分ける。日付不明は不明として別掲する。

この会話や手元のHTMLだけから院内全体の件数・傾向を推測しない。ポータルの集計画面を案内し、依頼された場合だけ、利用者が閲覧を許可された範囲の集計を確認する。


# Claudeプロジェクトでの実行

このファイルは必要な参照資料と共通コードを同梱した自己完結版です。上記のreferencesへの参照は以下の該当節を読みます。コード実行環境が利用できる場合は、以下のJavaScriptをincident-report-core.mjsとして保存し、確認済みJSONをnormalizeReportしてtoHTMLで出力してください。外部ライブラリ・通信は不要です。ファイルを生成できない環境では、生成・保存できたと装わず、その制約を伝えて確認済みJSONを提示してください。

# 分類の根拠と適用範囲

一次資料：国立病院機構「医療安全管理のための指針」2020年3月27日改訂、別添1「患者影響レベル」。
https://nho.hosp.go.jp/files/000192341.pdf#page=20

|値|確認する実際の結果|候補|
|---|---|---|
|0|誤った行為が患者に実施されなかった|ヒヤリ・ハット|
|1|行為は実施されたが影響がなかった|ヒヤリ・ハット|
|2|影響があった、または可能性があるが、追加の治療・処置を要しなかった|ヒヤリ・ハット|
|3a|本来不要な軽微な治療・処置を要した|ヒヤリ・ハット|
|3b|本来不要な軽微とはいえない治療・処置を要した|アクシデント／医療事故|
|4|生活に影響する重大な永続的障害を残す可能性がある|アクシデント／医療事故|
|5|行った医療・管理が死因となったと確認されている|アクシデント／医療事故|
|unknown|判断に必要な情報が不足、矛盾、または確認中|判定保留|
|na|患者に関係しない事象|患者尺度の対象外|

患者尺度を職員のけが・会計・予約・情報管理などへ流用しない。患者への影響と業務／職員への結果は併存できる。患者尺度の対象外も同じ入口で報告できる。

可能性だけの重大な結果を実際の影響レベルへ繰り上げない。潜在的結果は本人の説明と合理的に結びつくものだけ別欄に記載し、AIが最悪の結果を創作しない。死亡との因果関係や軽微性の判断をAIが診断しない。不明なら保留して院長・主任の確認へ回す。

この院内整理は法的責任、医療事故調査制度などの外部報告要否の判定ではない。旧A/B分類は新規報告に使わず、旧記録の分類・本文は改変しない。


# 共通HTML v2

`schemaVersion` は `kalmia.incident.v2`。`reportId` は8〜100文字の英数字・ハイフン・アンダースコア。新規UUID、改訂では不変。`revision` は0以上の整数。

文字列：reportNumber, reporterId, reporterName, ghostwriter, occurredDate（YYYY-MM-DDまたは空）, occurredTime（HH:mmまたは空）, place, work, phase, details, patientContext, materials, roles, timeline, supplement, handoff, sharing, impact。

配列：domains, factors, actual, potential, prevention, response。選択肢の文字列は共通モジュールのOPTIONSと完全一致させる。未確認は空配列または用意された不明の選択肢。impactは `unknown, na, 0, 1, 2, 3a, 3b, 4, 5` の文字列。

`render.mjs` は許可されたフィールドのみ採用する。表示を `pre#incident-visible`、データを `script#kalmia-incident-data[type="application/json"]` に入れる。利用者の文字列はHTMLエスケープ、JSON中の `<` は `\u003c` とする。スクリプトを実行するHTMLにしない。

ポータルは表示とデータが一致しなければ取り込みを拒否する。同じIDの既存報告は差分を見て更新し、履歴を残す。取り下げ済みの再取り込みは復元の手順を先に行う。旧形式は項目確認を経由し、新しい分類は未確認から始める。


## 共通生成モジュール（正本と同じコード）

```javascript
export const SCHEMA = 'kalmia.incident.v2';
export const SOURCE = 'https://nho.hosp.go.jp/files/000192341.pdf#page=20';
export const OPTIONS = {
  domains:['治療・処置','薬剤','検査','技工','機器・物品','予約・案内','会計','接遇','情報管理','職員のけが・曝露','その他','不明'],
  factors:['確認・照合','連絡・引き継ぎ','手順','知識・技術','配置・設備','業務量・人員','患者の状態','その他','不明'],
  actual:['影響なし・未然に防止','待ち時間・診療の遅れ','金銭上の影響','物品・設備の破損／使用停止','情報の誤送付・漏えい','職員のけが・曝露','その他','確認中'],
  potential:['患者への健康被害','職員のけが・曝露','診療の遅れ・中断','金銭上の損失','物品・設備の破損','情報の漏えい','その他','判断できない'],
  prevention:['確認・照合','他者の声かけ','患者からの指摘','機器の警告','手順・チェックリスト','被害拡大の防止','防げなかった','その他','不明'],
  response:['安全確保・中断','患者の状態確認','院長・担当者へ連絡','説明・謝罪','処置・対応','訂正・再手配','機器の使用停止','未対応','確認中','その他'],
  place:['診療室','受付','待合室','消毒・滅菌室','技工室','院外','その他','不明'],
  phase:['初診','再診','メンテナンス','診療準備','診療後','事務作業','その他','不明'],
};
export const IMPACT = {
  unknown:'確認中・判断できない', na:'患者に関係しない',
  '0':'患者に実施する前に気づいた', '1':'実施したが患者への影響はなかった',
  '2':'影響またはその可能性があるが、追加治療・処置は不要',
  '3a':'本来不要だった軽微な治療・処置が必要になった',
  '3b':'本来不要だった軽微とはいえない治療・処置が必要になった',
  '4':'生活に影響する重大な永続的障害の可能性がある',
  '5':'行った医療・管理が死因となったと確認されている',
};
const TEXT = ['reportNumber','reporterName','ghostwriter','occurredDate','occurredTime','place','work','phase','details','patientContext','materials','roles','timeline','supplement','handoff','sharing','impact'];
export function newReport(id=globalThis.crypto.randomUUID()) {
  return {schemaVersion:SCHEMA,reportId:id,revision:0,reporterId:'',reporterName:'',impact:'unknown',details:'',domains:[],factors:[],actual:[],potential:[],prevention:[],response:[]};
}
export function normalizeReport(value) {
  if(!value || value.schemaVersion!==SCHEMA) throw new Error('対応していない報告形式です');
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(value.reportId||'')) throw new Error('報告IDが不正です');
  const out={schemaVersion:SCHEMA,reportId:value.reportId,revision:Number.isSafeInteger(value.revision)&&value.revision>=0?value.revision:0};
  out.reporterId=String(value.reporterId||'');
  if(out.reporterId && !/^[A-Za-z0-9_-]{1,100}$/.test(out.reporterId))throw new Error('報告者IDが不正です');
  for(const key of TEXT)out[key]=String(value[key]||'').trim();
  if(!Object.hasOwn(IMPACT,out.impact))out.impact='unknown';
  for(const key of ['domains','factors','actual','potential','prevention','response']){
    const list=Array.isArray(value[key])?value[key]:[];
    if(list.some(v=>!OPTIONS[key].includes(v)))throw new Error('未対応の選択項目があります');
    out[key]=[...new Set(list)];
  }
  if(out.actual.includes('影響なし・未然に防止')&&out.actual.some(x=>!['影響なし・未然に防止','確認中'].includes(x)))throw new Error('「影響なし」と実際の影響を同時には選べません');
  if(out.occurredDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(out.occurredDate)||!Number.isFinite(Date.parse(out.occurredDate))||new Date(out.occurredDate).toISOString().slice(0,10)!==out.occurredDate))throw new Error('発生日の形式を確認してください');
  if(out.occurredTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(out.occurredTime))throw new Error('時刻の形式を確認してください');
  if(JSON.stringify(out).length>60000)throw new Error('報告が長すぎます。60,000文字以内に整理してください');
  return out;
}
export function validateSubmission(value){const r=normalizeReport(value);if(!r.reporterId||!r.reporterName||!r.details)throw new Error('報告者と「何が起きたか」を確認してください');return r;}
export function classification(r){
  if(r.impact==='na')return '患者尺度の対象外';
  if(['0','1','2','3a'].includes(r.impact))return 'ヒヤリ・ハット';
  if(['3b','4','5'].includes(r.impact))return '医療事故';
  return '判定保留';
}
export function monthKey(timestamp){return Number.isFinite(timestamp)&&timestamp>0?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(timestamp):'';}
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function reportText(value){const r=normalizeReport(value);const line=(label,v)=>`${label}：${Array.isArray(v)?v.join('、')||'未確認':v||'未確認'}`;return [
  'カルミアデンタルクリニック インシデント報告書',
  line('報告番号',r.reportNumber||r.reportId),line('報告者',r.reporterName),line('代筆者',r.ghostwriter),line('発生日時',[r.occurredDate,r.occurredTime].filter(Boolean).join(' ')),
  line('場所',r.place),line('作業',r.work),line('場面',r.phase),line('事象の分野',r.domains),line('何が起きたか',r.details),
  line('患者への実際の影響',IMPACT[r.impact]),line('分類候補',classification(r)+'（ポータルで要確認）'),line('業務・職員への実際の影響',r.actual),line('起こり得た被害',r.potential),
  line('背景・要因（未確定）',r.factors),line('防止につながった点',r.prevention),line('その場の対応',r.response),line('共有状況',r.sharing),
  line('患者の状況（個人特定情報を除く）',r.patientContext),line('器具・薬剤',r.materials),line('関係者の役割',r.roles),line('時系列',r.timeline),line('補足',r.supplement),line('申し送り',r.handoff),
  '患者影響分類：国立病院機構 2020年3月27日改訂・別添1。法的認定・外部報告要否の判定ではありません。',
  'このファイルの作成だけではポータルに提出されません。取り込み後に内容を確認して提出してください。'
].join('\n\n');}
export function toHTML(value){const r=normalizeReport(value);return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>インシデント報告書</title><style>body{font-family:system-ui,sans-serif;max-width:850px;margin:2rem auto;padding:1rem;color:#182f38}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}@media print{body{margin:0}pre{font-size:11pt}}</style><body><pre id="incident-visible">${escapeHtml(reportText(r))}</pre><script type="application/json" id="kalmia-incident-data">${JSON.stringify(r).replace(/</g,'\\u003c')}</script></body></html>`;}
export function parseHTML(html,Parser=globalThis.DOMParser){
  const doc=new Parser().parseFromString(html,'text/html');const node=doc.getElementById('kalmia-incident-data');if(!node)return null;
  const r=normalizeReport(JSON.parse(node.textContent));
  if(doc.getElementById('incident-visible')?.textContent.replace(/\r\n/g,'\n')!==reportText(r))throw new Error('表示内容と取り込みデータが一致しません。作成元で修正してください');
  // A file never grants ownership, administrative review or portal submission status.
  return r;
}
export function fromLegacy(old,id=globalThis.crypto.randomUUID()){
  const r=newReport(id);r.reporterName=old.reporterName||'';r.occurredDate=old.occurredDate||'';r.occurredTime=old.occurredTime||'';r.place=old.occurredPlace||'';r.work=old.workContent||'';r.details=old.details||'';r.handoff=old.handoff||'';
  r.supplement=[old.eventImpact&&`旧形式の影響欄（実際・潜在の区別は未確認）：${old.eventImpact}`,old.goodPoint&&`旧形式の防止理由：${old.goodPoint}`,old.causeHuman&&`旧形式の人・行動欄：${old.causeHuman}`,old.causeEnvironment&&`旧形式の環境・連携欄：${old.causeEnvironment}`].filter(Boolean).join('\n');return normalizeReport(r);
}

```
