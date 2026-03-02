# タスク8: セッション管理 + Kiro 独自拡張

## 概要

既存セッションの復元、モード/モデル切替、Kiro 独自の拡張メソッド対応、エラーハンドリング強化。

## 対象ファイル

- `src/acp/client.ts`（修正）
- `src/webview/chat-view-provider.ts`（修正）
- `webview/main.ts`（修正）
- `webview/style.css`（修正）

## 前提タスク

- タスク4（基本チャット動作）

## TODO

### セッション管理

- [ ] `session/load` — 既存セッション ID で復元
  - セッションは `~/.kiro/sessions/cli/` に永続化されている
  - `<session-id>.json`（メタデータ）+ `<session-id>.jsonl`（イベントログ）
- [ ] セッション一覧表示 UI
  - `~/.kiro/sessions/cli/` のファイルを読み取ってセッション一覧を表示
  - or ACP にセッション一覧取得メソッドがあればそれを使用
- [ ] `session/set_mode` — エージェントモード切替
- [ ] `session/set_model` — セッションのモデル変更

### Kiro 独自拡張（`_kiro.dev/` プレフィックス）

すべてオプショナル。未対応でも動作に影響なし。

- [ ] スラッシュコマンド
  - `_kiro.dev/commands/available` (Notification) — セッション作成後に利用可能コマンド一覧を受信 → UI に反映
  - `_kiro.dev/commands/options` (Request) — 入力中のコマンドに対する補完候補を取得
  - `_kiro.dev/commands/execute` (Request) — スラッシュコマンドを実行（例: `/agent swap`, `/context add`）
  - UI: 入力欄で `/` を入力したらコマンド候補をサジェスト
- [ ] MCP サーバーイベント
  - `_kiro.dev/mcp/oauth_request` (Notification) — OAuth 認証 URL を受信 → ブラウザで開く
  - `_kiro.dev/mcp/server_initialized` (Notification) — MCP サーバー初期化完了を受信 → ステータス表示
- [ ] セッション管理通知
  - `_kiro.dev/compaction/status` (Notification) — コンテキスト圧縮の進捗表示
  - `_kiro.dev/clear/status` (Notification) — セッション履歴クリア状態の表示
  - `_session/terminate` (Notification) — サブエージェントセッション終了

### エラーハンドリング強化

- [ ] kiro-cli 未インストール時のガイダンス表示
  - インストール手順のリンク付きエラーメッセージ
  - Webview にも「kiro-cli が見つかりません」を表示
- [ ] 通信タイムアウト処理
  - initialize / session/new / session/prompt に対するタイムアウト設定
  - タイムアウト時は Promise を reject + ユーザーにエラー表示

## 設計方針

- Kiro 独自拡張は段階的に実装可能。まずは Notification の受信・表示から始め、Request 系は後回しでもよい
- スラッシュコマンドの UI はシンプルなドロップダウンで十分

## 参考リンク

- [Kiro CLI ACP ドキュメント](https://kiro.dev/docs/cli/acp/) — Kiro 独自拡張メソッド一覧、セッションストレージ
- [ACP Session Modes](https://agentclientprotocol.com/protocol/session-modes) — session/set_mode, session/set_model
- [ACP Slash Commands](https://agentclientprotocol.com/protocol/slash-commands) — スラッシュコマンド仕様
- [ACP Extensibility](https://agentclientprotocol.com/protocol/extensibility) — カスタムメソッドの命名規則
- [Kiro CLI スラッシュコマンドリファレンス](https://kiro.dev/docs/cli/reference/slash-commands) — 利用可能なコマンド一覧
- [Kiro CLI MCP 統合](https://kiro.dev/docs/cli/mcp) — MCP サーバー連携
