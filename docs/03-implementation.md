# 実装計画

## フェーズ 1: 基盤構築

### 1.1 プロジェクトセットアップ

- `package.json`（Extension マニフェスト + pnpm 設定）
- `tsconfig.json`
- `esbuild.mjs`（ビルドスクリプト）
- `.vscode/launch.json`（デバッグ設定）
- 基本的な `src/extension.ts`（activate/deactivate スケルトン）

### 1.2 ACP Client 実装

- `src/acp/types.ts` - プロトコル型定義
- `src/acp/client.ts` - 子プロセス管理 + JSON-RPC 通信
  - `kiro-cli acp` の spawn
  - stdin/stdout パイプ
  - `initialize` メソッド
  - リクエスト/レスポンスの管理

### 1.3 Webview View 基盤

- `src/webview/chat-view-provider.ts` - WebviewViewProvider
- `webview/index.html` - 最小限のチャット UI
- `webview/main.ts` - postMessage 通信
- `webview/style.css` - 基本スタイル
- サイドバーへの登録・表示確認

## フェーズ 2: チャット機能

### 2.1 基本チャット

- `session/new` でセッション作成
- `session/prompt` でメッセージ送信
- `session/update` の `AgentMessageChunk` でストリーミング表示
- `TurnEnd` でターン完了検知
- `session/cancel` でキャンセル

### 2.2 UI 機能

- Markdown レンダリング（候補: `marked`）
- コードブロックのシンタックスハイライト（候補: `highlight.js`）
- 送信中のローディング表示
- エラーメッセージ表示
- VSCode テーマ連動（CSS 変数）

### 2.3 ツール呼び出し表示

- `ToolCall` の表示（ツール名、ステータス）
- `ToolCallUpdate` の進捗表示
- `session/request_permission` のユーザー承認 UI

## フェーズ 3: Agent → Client メソッド実装

### 3.1 ファイルシステム操作

- `fs/read_text_file` - VSCode `workspace.fs` API で読み取り
- `fs/write_text_file` - VSCode `workspace.fs` API で書き込み

### 3.2 ターミナル操作

- `terminal/create` - VSCode Terminal API でターミナル作成
- `terminal/output` - 出力取得
- `terminal/wait_for_exit` - 終了待機
- `terminal/release` / `terminal/kill`

## フェーズ 4: 拡張機能

### 4.1 セッション管理

- `session/load` による既存セッション復元
- セッション一覧表示
- `session/set_mode` / `session/set_model`

### 4.2 Kiro 独自拡張

- スラッシュコマンド（`_kiro.dev/commands/*`）
- MCP サーバーイベント
- コンテキスト圧縮

### 4.3 エラーハンドリング強化

- `kiro-cli` 未インストール時のガイダンス表示
- プロセスクラッシュ時の自動復旧（最大 3 回）
- 通信タイムアウト処理

## フェーズ 5: 品質・配布

### 5.1 配布準備

- アイコン SVG 作成
- README 充実
- CHANGELOG 作成
- VS Marketplace への公開準備（`vsce package`）

## 前提条件

- ユーザーが `kiro-cli` をインストール済みであること
- ユーザーが Kiro にログイン済みであること
- Node.js 18+ がインストール済みであること（開発時）
- VSCode 1.74+ であること
