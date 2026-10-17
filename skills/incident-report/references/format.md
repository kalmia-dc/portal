# 共通HTML v2

`schemaVersion` は `kalmia.incident.v2`。`reportId` は8〜100文字の英数字・ハイフン・アンダースコア。新規UUID、改訂では不変。`revision` は0以上の整数。

文字列：reportNumber, reporterId, reporterName, ghostwriter, occurredDate（YYYY-MM-DDまたは空）, occurredTime（HH:mmまたは空）, place, work, phase, details, patientContext, materials, roles, timeline, supplement, handoff, sharing, impact。

配列：domains, factors, actual, potential, prevention, response。選択肢の文字列は共通モジュールのOPTIONSと完全一致させる。未確認は空配列または用意された不明の選択肢。impactは `unknown, na, 0, 1, 2, 3a, 3b, 4, 5` の文字列。

`render.mjs` は許可されたフィールドのみ採用する。表示を `main#incident-visible`、データを `script#kalmia-incident-data[type="application/json"]` に入れる。基本情報は表、本文・影響・対応は見出しと枠のある欄で表示し、A4印刷用の余白・改ページ設定を持つ。文章全体をpre要素に並べるだけの出力に戻さない。必ず同梱の `toHTML` を使い、表示領域のtextContentとreportTextの完全一致を維持する。利用者の文字列はHTMLエスケープ、JSON中の `<` は `\u003c` とする。スクリプトを実行するHTMLにしない。旧pre形式の取り込み互換性は維持する。

ポータルは表示とデータが一致しなければ取り込みを拒否する。同じIDの既存報告は差分を見て更新し、履歴を残す。取り下げ済みの再取り込みは復元の手順を先に行う。旧形式は項目確認を経由し、新しい分類は未確認から始める。
