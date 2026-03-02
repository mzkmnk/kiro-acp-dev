# タスク2: ACP Client 実装

対象ファイル: `src/acp/client.ts`

## TODO

- [ ] kiro-cli 検出ロジック（設定値 → PATH → `~/.local/bin/kiro-cli` フォールバック）
- [ ] `kiro-cli acp` の子プロセス spawn（stdin/stdout/stderr パイプ）
- [ ] JSON-RPC 2.0 over stdio の送信（NDJSON）
- [ ] stdout からのメッセージ受信・バッファリング・パース
- [ ] リクエスト ID のインクリメンタル管理 + レスポンス Promise 解決（Map）
- [ ] `start()` — プロセス起動 + `initialize` 送信
- [ ] `stop()` — SIGTERM → SIGKILL で確実に終了
- [ ] `newSession(cwd)` — `session/new`
- [ ] `prompt(sessionId, content)` — `session/prompt`
- [ ] `cancel(sessionId)` — `session/cancel`（Notification）
- [ ] `onUpdate(callback)` — `session/update` のイベント購読
- [ ] Agent → Client メソッドのディスパッチ基盤（受信したリクエストをハンドラに振り分け）
- [ ] プロセスクラッシュ時の自動再起動（最大3回）
- [ ] stderr のログ出力
