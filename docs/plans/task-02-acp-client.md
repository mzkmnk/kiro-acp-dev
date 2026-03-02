# タスク2: ACP Client 実装

## 概要

`kiro-cli acp` を子プロセスとして起動・管理し、JSON-RPC 2.0 over stdio で通信する ACP Client クラスを実装する。
Extension Host 側のコア通信レイヤー。

## 対象ファイル

- `src/acp/client.ts`（新規作成）

## 前提タスク

- タスク1（型定義）

## TODO

### kiro-cli 検出

- [ ] kiro-cli パス解決ロジック
  1. VSCode 設定 `kiro-acp.cliPath` が指定されていればそれを使用
  2. 未指定の場合、`which kiro-cli`（macOS/Linux）で PATH から検索
  3. 見つからない場合、`~/.local/bin/kiro-cli` をフォールバック確認
  4. いずれも見つからない場合、エラーメッセージ + インストール手順を表示

### プロセス管理

- [ ] `kiro-cli acp` の子プロセス spawn
  - `child_process.spawn(cliPath, ["acp"], { stdio: ["pipe", "pipe", "pipe"] })`
  - stdin/stdout を JSON-RPC 通信に使用、stderr はログ出力
- [ ] `start()` — プロセス起動 + `initialize` リクエスト送信・レスポンス待機
- [ ] `stop()` — SIGTERM 送信 → 一定時間後に SIGKILL で確実に終了
- [ ] プロセスクラッシュ時の自動再起動（最大3回、カウンタ管理）
- [ ] stderr の出力を VSCode OutputChannel にログ出力

### JSON-RPC 2.0 通信

- [ ] 送信: JSON をシリアライズして stdin に書き込み（NDJSON: 1行1メッセージ + `\n`）
- [ ] 受信: stdout からのデータをバッファリングし、改行区切りで完全なメッセージ単位にパース
- [ ] リクエスト ID: インクリメンタルな整数（`private nextId = 0`）
- [ ] 未解決リクエスト管理: `Map<number, { resolve, reject }>` でレスポンス受信時に Promise を resolve
- [ ] タイムアウト: 一定時間レスポンスがない場合に reject

### 受信メッセージの振り分け

- [ ] `id` あり + `result`/`error` あり → レスポンス → 対応する Promise を resolve/reject
- [ ] `id` あり + `method` あり → Agent → Client リクエスト → ハンドラにディスパッチ
- [ ] `id` なし + `method` あり → Notification → イベントハンドラに通知
  - `session/update` → `onUpdate` コールバック呼び出し

### 公開メソッド

- [ ] `start(): Promise<InitializeResult>` — プロセス起動 + initialize
- [ ] `stop(): Promise<void>` — プロセス終了
- [ ] `newSession(cwd: string): Promise<SessionNewResult>` — `session/new` 送信
- [ ] `prompt(sessionId: string, content: PromptContent[]): Promise<void>` — `session/prompt` 送信
- [ ] `cancel(sessionId: string): void` — `session/cancel` Notification 送信（レスポンスなし）
- [ ] `onUpdate(callback: (params: SessionUpdateParams) => void): Disposable` — session/update 購読
- [ ] `registerHandler(method: string, handler: Function): void` — Agent → Client リクエストのハンドラ登録基盤

### initialize リクエスト内容

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {
      "fs": { "readTextFile": true, "writeTextFile": true },
      "terminal": true
    },
    "clientInfo": {
      "name": "kiro-acp-dev",
      "title": "Kiro ACP Dev",
      "version": "0.1.0"
    }
  }
}
```

## 設計方針

- `vscode.EventEmitter` を使ってイベント通知を実装
- Agent → Client リクエストのハンドラ登録は、タスク7で実際のハンドラを追加する前提で基盤だけ作る
- エラー時は JSON-RPC 2.0 標準のエラーレスポンスを返す

## 参考リンク

- [Kiro CLI ACP ドキュメント](https://kiro.dev/docs/cli/acp/) — 起動方法（`kiro-cli acp`）、初期化例、ログ設定
- [ACP Protocol Overview](https://agentclientprotocol.com/protocol/overview) — JSON-RPC 2.0 メッセージフォーマット
- [ACP Transports](https://agentclientprotocol.com/protocol/transports) — stdio トランスポート仕様（NDJSON / Content-Length）
- [ACP Initialization](https://agentclientprotocol.com/protocol/initialization) — initialize ハンドシェイク
- [ACP TypeScript SDK - ClientSideConnection](https://agentclientprotocol.github.io/typescript-sdk/classes/ClientSideConnection.html) — 公式クライアント実装の参考
- [ACP TypeScript SDK 実装例](https://github.com/agentclientprotocol/typescript-sdk/tree/main/src/examples) — クライアント/エージェント実装例
- [Node.js child_process.spawn](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options) — 子プロセス管理
