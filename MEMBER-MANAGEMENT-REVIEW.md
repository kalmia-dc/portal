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
- 共通認証で自分の許可情報を継続購読。無効化・role等の変更・ログアウト・通信切断・購読失敗で表示と portalUser キャッシュを消し、Firebaseをサインアウトする。
- 再接続や次回アクセスでDBルールが無効ユーザーを拒否する。既に受信・保存・撮影した情報の回収はできない。更新前のコードを開いたままの旧タブでは表示が自動消去されないため、適用時に利用者へ再読込を案内する。DBアクセス拒否は旧タブにも適用される。

## 本番適用前に本人の実行時承認が必要

1. **RTDBルール変更**: `portalAccess/users` と `portalAccessRequests` にactiveな管理者のみの一覧readを追加。UID単位の自己readは保持。ユーザーwriteは本人申請に紐づくstaff新規作成と、staff/trainingAdminのactive切替だけに制限。管理者・端末・自己・物理削除・権限昇格・staffId変更をサーバー側で拒否する。
2. **公開**: この変更だけを最新公開mainに適用してGitHub Pagesへ公開する。ルールは先に適用・確認する。UIだけを公開しない。
3. **認証監視の影響**: 通信切断時も全ポータルページで画面を閉じて再ログインを要求する。従来のオフライン継続利用はできなくなる。

本番の現在のルールは未取得。ローカルルール全体の無条件上書きはしない。公開前に本人承認の範囲で本番ルールとの差分を確認し、この2ブランチだけを統合する。他データのルール、通知設定、Authプロバイダーやアカウントには変更しない。既存のブラウザSDKによる管理者/端末プロファイル作成・編集手順があれば、この制限により使えなくなるため別作業へ切り分ける（Admin SDK/コンソールはセキュリティルールを迂回するため運用上の保護が必要）。

## 検証

- Nodeの既存回帰テストと追加テストを合わせて39件成功。追加分は12件。Firebase Realtime Database emulator v4.11.2、ローカルポート9015、プロジェクトID demo-portal-members。
- 未認証、非管理者、inactive管理者、自己/管理者/端末保護、権限昇格拒否、一覧read制限、重複、申請不存在、登録不存在、取消、再操作、読込失敗、競合、物理削除、解除後の同一token拒否、勤怠データ保持、profile購読への解除通知。
- Chromeでローカル架空データのみ使用。一覧、非管理者、読込失敗、取消、解除、再許可、登録完了を確認。`tests/member-ui-server.cjs` はローカル専用のSDKモックで外部サービスに接続しない。
- `git diff --check`、JavaScript構文チェック。
- 本番Googleログイン、本番DB書込み、通知POST、公開は実行していない。

再実行例（既存の依存関係を再利用する場合）:

```powershell
java -jar C:\Users\sugih\.cache\firebase\emulators\firebase-database-emulator-v4.11.2.jar --host 127.0.0.1 --port 9015
$env:PORTAL_TEST_DEPS='C:\Users\sugih\カルミアDC Dropbox\カルミアDC チーム フォルダ\AI作業場'
node --experimental-vm-modules --test --test-timeout=30000 tests/*.test.mjs
node tests/member-ui-server.cjs
```

依存関係は既存 `@firebase/rules-unit-testing` 5.x / `firebase` 12.x を利用。製品コードのFirebase CDN SDKは既存の10.12.0を変更していない。

参考: [Firebase Security Rulesの条件・削除時の検証](https://firebase.google.com/docs/database/security/rules-conditions)。削除は `.validate` が実行されないため、`newData.exists()` を `.write` 自体で要求する。
