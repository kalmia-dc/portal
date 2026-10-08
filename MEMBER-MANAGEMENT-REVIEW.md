# ログインメンバー管理 — 公開前レビュー

## 作業範囲

公開ベース `c129854a5cbddde35d7e7a9893afee271f274126` から作成した独立clone / `feature/portal-login-members`。既存の portal-main / portal-deploy は変更・同期していない。AI作業場の .agents とリポジトリの AGENTS.md を探索したが追加指示ファイルはなかった。portal-publish-workflow を参照し、今回の明示指示に従いローカル実装・テストに限定した。

## 現状と実装

- 既存 Google Firebase Auth を維持。RTDB `portalAccess/users/{UID}` の active / role を認可に利用。
- 管理者のみの `portal-members.html` とホームの管理者リンクを追加。
- 本人が既存登録ページまたはログイン画面から送った `portalAccessRequests/{UID}` を一覧表示。管理者が本人とメールを照合し、既存スタッフを選んで登録。新規は staff 権限のみ。メールだけを指定する事前登録や新規資格情報作成はない。
- 同一UIDの重複登録を拒否。新規UIDと既存 staffId の関連付けは管理者が確認する（既存方式に合わせ複数UIDと同一staffIdの関連付け自体は一意制約を追加していない）。
- 解除は `active=false`。再許可は `active=true`。staffId・name・role・email等の既存属性を維持し、updatedBy / updatedAt を保存。勤務・勤怠・スタッフ名簿・申請履歴には書き込まない。
- 管理者全員・端末・自分自身は変更対象外。最後の管理者判定の競合を避けるため、管理者の削除や降格を全面的に禁止した。管理者の追加・変更が必要なら別の本人承認付き作業とする。
- Firebase transactionで確認時のレコード全体と比較。同時操作・重複・古い画面からの操作を中止。失敗時は一覧を消して明示的な再読込を要求する。
- 共通認証で自分の許可情報を継続購読。無効化・role等の変更・ログアウト・権限読み取り失敗で表示と portalUser キャッシュを消し、Firebaseをサインアウトする。通信断は別扱いとし、Google認証とDOM・未保存入力を保持して操作とフォーカスをロックする。再接続時はFirebase REST APIへ自分のUIDの許可情報をGETし、サーバーの最新値がログイン時の有効な権限と一致したときだけ自動再開する。SDKキャッシュへのフォールバックなし、cache:no-store、リダイレクト禁止。既存ユーザーのIDトークンを通常の認証付きリクエストにだけ使用し、保存・ログ出力しない。
- RESTの401/403、無効な利用許可、role変更はアクセス終了。ネットワーク失敗・5xx・タイムアウト・不正な応答はロックしたまま1〜15秒の間隔で再試行。再切断やログアウト前の遅延応答では再開しない。再読込・Google再選択は不要。確認ダイアログで保留中の操作は通信断で取り消すが、通常フォームの未保存入力は保持する。既に送信した処理や各画面独自の自動保存処理まで巻き戻す機能ではない。
- 再接続や次回アクセスでDBルールが無効ユーザーを拒否する。既に受信・保存・撮影した情報の回収はできない。更新前のコードを開いたままの旧タブでは表示が自動消去されないため、適用時に利用者へ再読込を案内する。DBアクセス拒否は旧タブにも適用される。

## 本番適用前に本人の実行時承認が必要

1. **RTDBルール変更**: `portalAccess/users` と `portalAccessRequests` にactiveな管理者のみの一覧readを追加。UID単位の自己readは保持。ユーザーwriteは本人申請に紐づくstaff新規作成と、staff/trainingAdminのactive切替だけに制限。管理者・端末・自己・物理削除・権限昇格・staffId変更をサーバー側で拒否する。
2. **公開**: この変更だけを最新公開mainに適用してGitHub Pagesへ公開する。ルールは先に適用・確認する。UIだけを公開しない。
3. **認証監視の影響**: 通信断ではログアウトせず一時ロック。サーバーで許可を再確認して同じ画面を自動的に戻す。未保存入力・Google認証を保持する。サーバーが復旧しない場合は安全のためロックを継続する。

2026-10-08、既存認証済みの公式Firebase CLI `database:get /.settings/rules` により本番ルールだけを読み取り取得した。資格情報は表示・取得していない。取得ルールは公開ベース c129854 のルールと構造上完全一致。ローカル変更との差分は portalAccess/users と portalAccessRequests の2ブランチのみ。その他の勤怠・通知等ルールは一致。ルール取得ファイルは作業ルートの production-database.rules.json、比較結果は production-rules-comparison.json。実メンバーの一覧や本番データは読み取っていない。

公開前に再度差分を確認し、この2ブランチだけを統合する。他データのルール、通知設定、Authプロバイダーやアカウントには変更しない。既存のブラウザSDKによる管理者/端末プロファイル作成・編集手順があれば、この制限により使えなくなるため別作業へ切り分ける（Admin SDK/コンソールはセキュリティルールを迂回するため運用上の保護が必要）。

## 承認判断用の要点

1. **登録項目**: 既存の本人申請からUID・Googleメール・表示名を参照し、管理者が対応するスタッフを選択する。新たに入力するのはスタッフ選択のみ。権限はstaff固定。パスワードや資格情報は入力しない。
2. **管理できる人**: portalAccess/usersのactive=trueかつrole=adminの既存アカウント。staffIdの名前リストやURLパラメーターで管理権限を判断しない。trainingAdminにはメンバー管理権限なし。
3. **解除の効果**: active=falseを保存した後のDBアクセスをルールで拒否。開いた画面は許可購読により終了。認証アカウントそのものや過去データは削除しない。別タブにも同じ監視を適用するが旧コードのタブは再読込が必要。
4. **役割別影響**: staff/trainingAdminは解除・再許可対象。admin/terminalおよび未知のroleは対象外。通知担当の設計では専用UIDはportalAccess/usersに登録せず、serviceAccess/notifications/uidで予約される。このUIDはactiveの真偽によらず通常管理者によるスタッフ登録・更新・解除・登録申請作成をサーバー側で禁止する。UIはportalAccess/usersと登録申請だけを表示するので正規運用の通知専用UIDは一覧に現れない。不整合なデータを特権操作で作った場合でもクライアントからの更新は拒否する。Auth削除APIは実装していない。serviceAccessを読み書きするコードや、そのルールへの変更はない。
5. **本番差分と移行**: 本番と公開ベースは一致。変更は上記2ブランチのみ。既存データの一括移行は不要。既存レコードは解除/再許可時にupdatedBy/updatedAtを追加する。既存のstaffId等は保持。
6. **ロールバック**: UIと共通認証の変更コミットをrevertして再公開する。必要なら保存済み本番ルールを参照し、今回の2ブランチを元に戻す（同時期の別変更は保持）。解除済みのactive=falseや追加済み利用者レコードは勝手に戻さない。機能のロールバックと個人の再許可は別操作。旧ルールへ戻すと管理者/自己プロファイル等への従来の広いwriteも戻る点に注意。復旧の本番適用にも本人の実行時承認が必要。

## 検証

- Nodeの既存回帰テストと追加テストを合わせて47件成功（追加20件、スキップ0）。Firebase Realtime Database emulator v4.11.2、ローカルポート9015、プロジェクトID demo-portal-members / demo-members-notify-0 / demo-members-notify-1。
- 未認証、非管理者、inactive管理者、自己/管理者/端末保護、権限昇格拒否、一覧read制限、重複、申請不存在、登録不存在、取消、再操作、読込失敗、競合、物理削除、解除後の同一token拒否、勤怠データ保持、profile購読への解除通知。
- Chromeでローカル架空データのみ使用。一覧、非管理者、読込失敗、取消、解除、再許可、登録完了を確認。`tests/member-ui-server.cjs` はローカル専用のSDKモックで外部サービスに接続しない。
- Chromeで未保存のメモを入力し、切断→再接続→サーバー確認成功の後も同じ内容が残ることを確認。確認前は操作不能、許可解除後は画面終了。スクリーンショットは作業ルートの session-resume-verified.jpg。
- `git diff --check`、JavaScript構文チェック。
- 本番Googleログイン、本番DB書込み、通知POST、公開は実行していない。

再実行例（既存の依存関係を再利用する場合）:

```powershell
java -jar C:\Users\sugih\.cache\firebase\emulators\firebase-database-emulator-v4.11.2.jar --host 127.0.0.1 --port 9015
$env:PORTAL_TEST_DEPS='C:\Users\sugih\カルミアDC Dropbox\カルミアDC チーム フォルダ\AI作業場'
$env:NOTIFY_RULE_BUILDER='C:\Users\sugih\Documents\Codex\2026-10-05\task-2\notify-repair\build-rule-candidate.mjs'
node --experimental-vm-modules --test --test-timeout=30000 tests/*.test.mjs
node tests/member-ui-server.cjs
```

依存関係は既存 `@firebase/rules-unit-testing` 5.x / `firebase` 12.x を利用。製品コードのFirebase CDN SDKは既存の10.12.0を変更していない。

参考: [Firebase Security Rulesの条件・削除時の検証](https://firebase.google.com/docs/database/security/rules-conditions)。削除は `.validate` が実行されないため、`newData.exists()` を `.write` 自体で要求する。

再接続確認は[Firebase公式REST認証方式](https://firebase.google.com/docs/database/rest/auth)を使用。

## 通知復旧候補との統合（未適用）

通知担当の `C:/Users/sugih/Documents/Codex/2026-10-05/task-2/notify-repair/build-rule-candidate.mjs` を読み取り参照。通知用の集約4パスreadと日別記録write、serviceAccessのルールを保持したまま両方をエミュレーターへ適用して確認する。対象UIDは架空の notification-service のみ。

`tools/build-member-rule-candidate.mjs LATEST_PRODUCTION OUTPUT` はメンバー管理の2ブランチだけを統合する。公開ベース、今回の候補、通知担当の既知の予約UIDガードを受け付け、それ以外のメンバー権限変更を検出したら中止する。通知側の変更や他ブランチを上書きしない。`database.rules.json` 全体をそのまま本番へデプロイしてはいけない。両作業とも適用直前に最新本番ルールを公式CLIで再取得し、最終候補を差分レビュー・エミュレーターテストしてから本人の実行時承認を得る。

今回serviceAccess/notificationsの値・実UIDは取得・変更していない。予約UIDが本番に設定されることが除外条件の前提。設定が未完了なら、両作業の公開判断時に通知担当へ非秘密の「設定完了状態」を確認する。スタッフ用レコードの区分追加や一括データ移行は不要。
