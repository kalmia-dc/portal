# シフト個別取消・DR登録 レビュー

2026-10-09。新規チェックアウト `portal-work`、取得した main は `a9c7701538f8cae5bca090ebf7121c02bb7d6eb1`。
既存 portal-main / portal-deploy、本番DB、公開サイトは変更していない。
リポジトリに AGENTS.md / .agents / package.json は存在しなかった。既存 tests の Node 実行方式に合わせた。

## 現状と修正

- 既存の DEFAULT_STAFF と extra_staff に DR があり、管理者のセル編集自体は可能だった。type=spot が職種を問わず HANOWA/休診になる問題を修正し、スポットDRを通常・遅出等で登録可能にした。職種別スタッフ選択と日付の入口も追加。
- 個別削除はなく、月全体クリアのみだった。氏名・職種・日付・勤務区分・手動時刻を明示する画面内確認を追加。「変更しない」では書き込まない。
- 1件の勤務区分と手動時刻を月内 `__cancelledShifts/{staffId}/{date}` に退避し、通常の勤務セルと `__manualTimes` の対象日だけを除く。退避内容は key / time（存在時）/ cancelledAt。既存の `shifts/YYYY-MM` トランザクションを使用。
- 「取消済」セルから再読込後も復元可能。新しい勤務を同じセルに登録した場合はそのセルの復元情報を消す。競合した勤務は上書きしない。
- 保存・削除・復元は管理者限定。確定状態を再取得し、トランザクション内でもローカルの確定・権限状態と同じセルの元データを照合。通信中はボタンと入力を無効化し、サーバー確認前に成功表示しない。
- DRバッジ、休診日に残った既存データの編集入口、狭い画面で登録欄を先に表示する配置を追加。月全体クリアは個別操作と区別するラベルに変更（既存処理は変更なし）。

## 影響範囲

実装ファイルは `shift.html` と `shift-entry.js`。テストは `tests/shift-entry.test.mjs`、`tests/shift-manual-time.test.mjs`、`tests/shift-entry-ui-server.cjs`。

既存の役割判定、メンバー管理、勤怠の打刻・プロフィール・休暇申請、通知停止、Worker、人員充足計算、HANOWA募集判定式は変更していない。DRの勤務は既存仕様通りDR+DHに加算され、DH+DAには加算しない。DR登録による正当な人員変化はあるが、HANOWA勤務を自動作成する処理は新設していない。

既存の database.rules.json は shifts に対する active admin の書込権限があるため、この実装にDB権限変更は不要。実環境のルール読取・変更・実データ書込は行っていない。

## テスト結果

- 最終の `node --experimental-vm-modules --test tests/*.test.mjs`: **48成功、0失敗、0スキップ**。最初は依存不足で2ファイルが起動できなかったが、下記の既存依存をコピーして解消した。
- 最終実装で変更関連8ファイル（shift-entry / shift-manual-time / shift-role-balance / notification-stop / portal-auth-session / portal-members / portal-reconnect / attendance-flexible-profile）を再実行し、21成功、0失敗。
- 最後の確認パネルのテスト追加後も `tests/shift-entry.test.mjs` 成功。
- `git diff --check` 成功。インラインJSは既存テストの vm.SourceTextModule / vm.Script で構文確認。
- 対象確認の取消、時刻付き削除・復元、再読込、他の人・日付の保持、切断前の操作拒否、サーバー権限拒否、確定ロック、スタッフ権限、同時更新、応答待ちの連打・モーダル閉じ防止、新規登録による古い復元情報の破棄、職種別集計を確認。

### DBルールテストの追加検証

親タスクからの追加指示により、既存 AI作業場/package-lock.json とインストール済み各package.jsonのバージョンを照合し、必要な89パッケージを今回の `../rule-test-deps` にコピーした。主要バージョンは @firebase/rules-unit-testing 5.0.2、firebase 12.18.0。既存キャッシュの firebase-database-emulator-v4.11.2.jar も同領域へコピー。ダウンロード、外部資格情報、新規権限は使用していない。

`java -jar firebase-database-emulator-v4.11.2.jar --host 127.0.0.1 --port 9015` でローカルエミュレータを起動。
PORTAL_TEST_DEPS は `../rule-test-deps` の絶対パス、NOTIFY_RULE_BUILDER は既存の `2026-10-05/task-2/notify-repair/build-rule-candidate.mjs` を指定。後者は純粋なルール候補生成関数のimportのみで、Worker起動・通知送信・本番書込は行わない。
未実行だった portal-members-rules / portal-members-notify の全7件を成功させ、その後全テスト48件も成功。最終ログは `../final-test-results.txt`。

Git作者設定は同じ origin の正規 portal-deploy/.git/config にある既存設定を今回のリポジトリにのみ適用。グローバル設定・既存作業領域は変更していない。

## ブラウザ確認

`node tests/shift-entry-ui-server.cjs` → `http://127.0.0.1:8772/shift.html`。
SDKを除去し、外部通信をCSPで遮断する専用サーバー。架空医師A・架空衛生士Bのみを表示し、書込先はローカルブラウザのテスト専用localStorage。実Firebase・通知サービスへの接続なし。

Chromeで確認取消→1件削除→取消済→再読込→復元、DR新規勤務保存、`?offline` と `?denied` のエラー表示を確認。復元した7hと新規9hでDR合計16h、DHの8.5hは維持。390×844とデスクトップで対象確認の表示を確認。

スクリーンショットはチェックアウトの1階層上の `shift-confirm.jpg`、`shift-mobile-confirm.jpg`、`shift-cancelled.jpg`、`shift-edit.jpg`、`shift-offline.jpg`、`shift-denied.jpg`。最終確認画面の確実な証跡は shift-confirm.jpg と shift-mobile-confirm.jpg。

## 公開前に把握する制約

- 本番公開・push・DB権限変更は未実施。確認後に実装2ファイルを同時に反映する必要がある。
- 確定ロックと勤務は別DBパスで、現行ルールにはロックによるサーバー書込禁止がない。UIの再確認と監視は行うが、別管理者が同時に確定した瞬間まで厳密に原子的には保証できない。厳密な禁止が必要なら別途ルール設計・承認が必要。
- 書込開始後に通信が切れた場合は再接続まで保留。画面を閉じた場合は結果確認のため再読込が必要。タイムアウトを成功・失敗と決めつけず、重複操作を防止する。
- 復元はそのセルに他の勤務を登録するまでの直前取消分。月全体クリアや自動生成による上書きに対する無期限の履歴保管ではない。
- 個別取消は承認済み休暇申請や固定勤務ルールを消さない。後から自動生成を行うと、それらの既存ルールに従い勤務・休暇が再生成される場合がある。
- 従来の全月保存・自動生成・月全体クリアにはこのセル単位の競合保護はない。並行操作の全般的な改修は今回の対象外。

### 確定操作との競合条件

管理者Aが未確定を読み取る → 管理者Bが shift_locks を確定に変更 → Bの変更がAの監視コールバックに届く前にAの勤務トランザクションが完了、という順序で、確定後に対象セルの変更が通る可能性がある。shiftsとshift_locksが別パスなので、勤務トランザクションの競合再試行はロック単独の変更では起きない。

これは従来のapplyModalにも存在した制約。削除・復元という新しい操作にも適用されるため操作の種類は増えるが、同種の1回の保存について既存より防護を弱めてはいない。今回の処理では元セル比較・最新ロック取得・ローカル監視状態の再確認を行い、旧来の月全体クリアより対象も限定する。

権限変更なしの軽減策として上記確認と連打防止を実装済み。さらに保存後のロック再取得で同時確定を警告することは可能だが、成立した書込の禁止はできず、自動巻き戻しは別更新を壊す危険があるため採用しない。厳密な保証にはサーバー側検証、またはロックと勤務を同一トランザクション範囲へ移し全書込経路を対応させる別設計が必要。今回その変更は行っていない。
