# タスク1: ACP プロトコル型定義

## 概要

ACP（Agent Client Protocol）の JSON-RPC 2.0 通信で使用するすべての TypeScript 型を定義する。
このファイルはタスク2以降のすべての実装の基盤となる。

## 対象ファイル

- `src/acp/types.ts`（新規作成）

## 前提タスク

なし

## TODO

- [ ] JSON-RPC 2.0 基本型
  - `JsonRpcRequest` — `{ jsonrpc: "2.0", id: number, method: string, params?: unknown }`
  - `JsonRpcResponse` — `{ jsonrpc: "2.0", id: number, result?: unknown, error?: JsonRpcError }`
  - `JsonRpcNotification` — `{ jsonrpc: "2.0", method: string, params?: unknown }`（id なし）
  - `JsonRpcError` — `{ code: number, message: string, data?: unknown }`
- [ ] `initialize` 型
  - `InitializeParams` — `{ protocolVersion: 1, clientCapabilities, clientInfo }`
  - `ClientCapabilities` — `{ fs: { readTextFile: boolean, writeTextFile: boolean }, terminal: boolean }`
  - `ClientInfo` — `{ name: "kiro-acp-dev", title: "Kiro ACP Dev", version: "0.1.0" }`
  - `InitializeResult` — `{ protocolVersion, agentCapabilities, agentInfo }`
  - `AgentCapabilities` — `{ loadSession: boolean, promptCapabilities: { image: boolean } }`
  - `AgentInfo` — `{ name: string, version: string }`
- [ ] `session/new` 型
  - `SessionNewParams` — `{ cwd: string, mcpServers: McpServerConfig[] }`
  - `SessionNewResult` — `{ sessionId: string }`
- [ ] `session/load` 型
  - `SessionLoadParams` — `{ sessionId: string }`
- [ ] `session/prompt` 型
  - `SessionPromptParams` — `{ sessionId: string, content: PromptContent[] }`
  - `PromptContent` — `TextContent | ImageContent | ResourceLinkContent`
  - `TextContent` — `{ type: "text", text: string }`
  - `ImageContent` — `{ type: "image", ... }`
  - `ResourceLinkContent` — `{ type: "resource_link", ... }`
- [ ] `session/cancel` 型（Notification、id なし）
  - `SessionCancelParams` — `{ sessionId: string }`
- [ ] `session/update` 型（Agent → Client Notification）
  - `SessionUpdateParams` — 以下の union 型
  - `AgentMessageChunk` — ストリーミングテキスト/コンテンツ
  - `ToolCall` — ツール呼び出し（name, parameters, status）
  - `ToolCallUpdate` — 実行中ツールの進捗
  - `TurnEnd` — ターン完了シグナル
- [ ] Agent → Client リクエスト型
  - `FsReadTextFileParams` — `{ path: string }`（絶対パス）
  - `FsWriteTextFileParams` — `{ path: string, content: string }`（絶対パス）
  - `SessionRequestPermissionParams` — ツール呼び出し承認要求
  - `TerminalCreateParams`, `TerminalOutputParams`, `TerminalWaitForExitParams`, `TerminalReleaseParams`, `TerminalKillParams`
- [ ] `session/set_mode`, `session/set_model` パラメータ型
- [ ] Kiro 独自拡張メソッド型（`_kiro.dev/` プレフィックス）
  - `_kiro.dev/commands/execute` (Request), `_kiro.dev/commands/options` (Request), `_kiro.dev/commands/available` (Notification)
  - `_kiro.dev/mcp/oauth_request` (Notification), `_kiro.dev/mcp/server_initialized` (Notification)
  - `_kiro.dev/compaction/status` (Notification), `_kiro.dev/clear/status` (Notification)
  - `_session/terminate` (Notification)

## 設計方針

- ACP 公式 TypeScript SDK（`@agentclientprotocol/sdk`）の型を参考にしつつ、必要な型のみ自前定義する
  - SDK を依存に入れて型だけ使うか、自前定義するかは実装時に判断
- Kiro 独自拡張はフェーズ4（タスク8）で使うが、型だけはここで定義しておく
- `session/update` の各更新タイプは discriminated union で定義する

## 参考リンク

- [Kiro CLI ACP ドキュメント](https://kiro.dev/docs/cli/acp/) — Kiro が実装する ACP メソッド一覧・初期化例・セッション更新タイプ
- [ACP Protocol Overview](https://agentclientprotocol.com/protocol/overview) — プロトコル全体像
- [ACP Initialization](https://agentclientprotocol.com/protocol/initialization) — initialize メソッド仕様
- [ACP Session Setup](https://agentclientprotocol.com/protocol/session-setup) — session/new, session/load
- [ACP Prompt Turn](https://agentclientprotocol.com/protocol/prompt-turn) — session/prompt, session/cancel
- [ACP Content](https://agentclientprotocol.com/protocol/content) — text / image / resource_link コンテンツ型
- [ACP Tool Calls](https://agentclientprotocol.com/protocol/tool-calls) — ToolCall, ToolCallUpdate
- [ACP File System](https://agentclientprotocol.com/protocol/file-system) — fs/read_text_file, fs/write_text_file
- [ACP Terminals](https://agentclientprotocol.com/protocol/terminals) — terminal/\* メソッド
- [ACP Session Modes](https://agentclientprotocol.com/protocol/session-modes) — session/set_mode, session/set_model
- [ACP Slash Commands](https://agentclientprotocol.com/protocol/slash-commands) — スラッシュコマンド仕様
- [ACP Extensibility](https://agentclientprotocol.com/protocol/extensibility) — カスタムメソッドの命名規則
- [ACP Schema](https://agentclientprotocol.com/protocol/schema) — JSON Schema 定義
- [ACP TypeScript SDK](https://agentclientprotocol.github.io/typescript-sdk) — 公式 TypeScript ライブラリリファレンス
- [@agentclientprotocol/sdk (npm)](https://www.npmjs.com/package/@agentclientprotocol/sdk) — SDK パッケージ（型定義の参考）
