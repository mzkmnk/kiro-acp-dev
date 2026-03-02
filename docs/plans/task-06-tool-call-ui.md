# タスク6: ツール呼び出し表示 + 権限承認 UI

## 概要

ACP Agent がツールを呼び出した際の UI 表示と、ユーザー承認フローを実装する。

## 対象ファイル

- `webview/main.ts`（修正）
- `webview/style.css`（修正）
- `src/webview/chat-view-provider.ts`（修正）
- `src/acp/client.ts`（`session/request_permission` ハンドラ追加）

## 前提タスク

- タスク4（基本チャット動作）
- タスク5（UI 基盤強化）

## TODO

### ToolCall 表示

- [ ] `session/update` の `ToolCall` 受信時に、ツール名とステータスを表示
  - ステータス: pending → running → completed / failed
  - 折りたたみ可能な UI（ツール名クリックで詳細展開）
- [ ] `ToolCallUpdate` 受信時に、対応するツール表示の進捗を更新

### 権限承認 UI

- [ ] `session/request_permission` を ACP Client で受信
  - Agent → Client リクエスト（id あり、レスポンスが必要）
- [ ] Webview に承認ダイアログを表示
  - ツール名、パラメータの概要を表示
  - 「許可」「拒否」ボタン
- [ ] ユーザーの選択結果を JSON-RPC レスポンスとして Agent に返す

### メッセージフロー

```
Agent → Client: session/request_permission (Request, id=N)
  Client → Webview: { type: "requestPermission", id, toolName, params }
  Webview → Client: { type: "permissionResponse", id, allowed: boolean }
Client → Agent: JSON-RPC Response (id=N, result: { allowed })
```

## 設計方針

- ToolCall の表示はチャットメッセージの中にインラインで表示する
- 権限承認は Webview 内のモーダル or インラインダイアログで実装（VSCode のネイティブダイアログではなく）

## 参考リンク

- [Kiro CLI ACP ドキュメント](https://kiro.dev/docs/cli/acp/) — session/update の ToolCall / ToolCallUpdate タイプ
- [ACP Tool Calls](https://agentclientprotocol.com/protocol/tool-calls) — ツール呼び出しプロトコル仕様
