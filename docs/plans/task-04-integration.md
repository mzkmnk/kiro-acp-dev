# タスク4: extension.ts 統合 + 基本チャット

## 概要

タスク1〜3で作成した ACP Client、WebviewViewProvider、型定義を `extension.ts` で統合し、
エンドツーエンドの基本チャットフローを動作させる。これが MVP（最小動作プロダクト）。

## 対象ファイル

- `src/extension.ts`（既存を大幅修正）

## 前提タスク

- タスク1（型定義）
- タスク2（ACP Client）
- タスク3（Webview View 基盤）

## TODO

### activate()

- [ ] ACP Client インスタンス生成
- [ ] `ChatViewProvider` インスタンス生成（ACP Client を注入）
- [ ] `vscode.window.registerWebviewViewProvider("kiro-acp.chatView", provider)` で登録
- [ ] コマンド登録
  - `kiro-acp.newSession` → ACP Client の `newSession()` 呼び出し
  - `kiro-acp.cancelRequest` → ACP Client の `cancel()` 呼び出し
- [ ] 全 Disposable を `context.subscriptions` に push

### deactivate()

- [ ] ACP Client の `stop()` 呼び出し（子プロセス kill）

### メッセージブリッジ（ChatViewProvider 内で実装）

- [ ] Webview → Extension Host:
  - `prompt` → ACP Client の `prompt()` 呼び出し
  - `cancel` → ACP Client の `cancel()` 呼び出し
  - `newSession` → ACP Client の `newSession()` 呼び出し
- [ ] ACP Client → Webview:
  - `session/update` の `AgentMessageChunk` → `{ type: "agentMessageChunk", text }` を postMessage
  - `session/update` の `TurnEnd` → `{ type: "turnEnd" }` を postMessage
  - `session/update` の `ToolCall` → `{ type: "toolCall", name, status }` を postMessage
  - エラー → `{ type: "error", message }` を postMessage
  - 初期化完了 → `{ type: "ready", agentInfo }` を postMessage

### 基本チャットフロー

以下の一連のフローが動作すること:

1. Extension activate → ACP Client が `kiro-cli acp` を起動 → `initialize` 完了
2. Webview 表示時に自動で `session/new` → セッション ID 取得
3. ユーザーが入力欄にメッセージ入力 → 送信
4. `session/prompt` が ACP Agent に送信される
5. `session/update` の `AgentMessageChunk` がストリーミングで Webview に表示される
6. `TurnEnd` でターン完了、入力欄が再度有効になる
7. キャンセルボタンで `session/cancel` が送信される

## 設計方針

- ChatViewProvider が ACP Client への参照を持ち、ブリッジの責務を担う
- セッション ID は ChatViewProvider 内で状態管理する
- ACP Client の起動は activate 時ではなく、最初の Webview 表示時（lazy）でもよい

## 参考リンク

- [Kiro CLI ACP ドキュメント](https://kiro.dev/docs/cli/acp/) — 初期化→セッション作成→プロンプトの一連のフロー例
- [ACP Prompt Turn](https://agentclientprotocol.com/protocol/prompt-turn) — session/prompt, session/cancel の仕様
- [VSCode Extension API - commands](https://code.visualstudio.com/api/references/vscode-api#commands) — コマンド登録
- [VSCode Extension API - window](https://code.visualstudio.com/api/references/vscode-api#window) — registerWebviewViewProvider
