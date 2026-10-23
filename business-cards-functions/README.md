# 名刺管理

既存ポータルの個人ログインを使う名刺管理です。実データ・画像・認証情報をこのリポジトリへ保存しないでください。

- データ: Realtime Database の `businessCardsV1`。クライアントからの直接アクセスは既存の拒否ルールを維持します。
- 画像: 同じプロジェクトの非公開バケット `kalmia-shift-business-cards`。公開URLやダウンロードトークンは発行しません。
- callable: `businessCards`。毎回、Firebase Auth と有効な個人プロフィールを確認します。受付共用端末・通知専用ユーザーは拒否します。
- 閲覧・登録・編集・CSV/画像ZIP出力は有効な個人ユーザー。ごみ箱・復元・完全削除は院長の `sugihira` かつ `admin` のみ。
- 保存は revision と operationId による競合検出・再送制御。履歴を保存します。
- 写真OCR: Google Cloud Vision。読み取った文字と電話・メール候補を表示し、利用者が確認して保存します。同じ写真の読み取り再送は同一操作IDを使います。
- 日次バックアップ: 日本時間03:10、30世代。画像はカード内で版を保持。完全削除された項目も既存バックアップには最長30世代残ります。バケットのGoogle Cloud側ソフト削除保持は7日です。
- 料金通知: 既存プロジェクト全体の月1,000円目安、800/1,000円でGoogleのメール通知とPub/Sub経由の画面表示。自動停止はしません。Googleの料金集計には遅延があります。

配備: `firebase deploy --only functions:business-cards --config firebase.cards.json --project kalmia-shift`。機能停止は `businessCardsV1/config/enabled=false`（元データは保持）。既存ポータル全体のルールをこの配備で更新しないでください。

検証: `node --test business-cards-functions/test/model.test.mjs tests/business-cards-utils.test.mjs`。ブラウザの模擬画面は `node tools/business-cards-preview.mjs`（ローカル限定）。本番確認の証拠は非公開の作業フォルダに保管します。
