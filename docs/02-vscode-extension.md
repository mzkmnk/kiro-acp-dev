# VSCode Extension 設計仕様

## 概要

VSCode Extension として実装する。TypeScript で記述し、Webview View API でサイドバーにチャットパネルを表示する。

## ディレクトリ構成

```
kiro-acp-dev/
├── .vscode/
│   └── launch.json             # デバッグ設定
├── src/
│   ├── extension.ts            # エントリポイント（activate/deactivate）
│   ├── acp/
│   │   ├── client.ts           # ACP Client（プロセス管理 + JSON-RPC通信）
│   │   └── types.ts            # ACP プロトコル型定義
│   └── webview/
│       └── chat-view-provider.ts  # WebviewViewProvider 実装
├── webview/
│   ├── index.html              # チャット UI テンプレート
│   ├── main.ts                 # Webview 側スクリプト
│   └── style.css               # スタイル
├── media/
│   └── kiro-icon.svg           # サイドバーアイコン
├── docs/
├── package.json                # Extension マニフェスト + pnpm 設定
├── tsconfig.json
├── esbuild.mjs                 # ビルドスクリプト
├── LICENSE
└── README.md
```

## package.json（Extension マニフェスト）

```json
{
  "name": "kiro-acp-dev",
  "displayName": "Kiro ACP",
  "description": "Kiro AI agent chat panel for VSCode via ACP",
  "version": "0.1.0",
  "publisher": "m4i",
  "license": "MIT",
  "engines": {
    "vscode": "^1.74.0"
  },
  "categories": ["AI", "Chat"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "kiro-acp",
          "title": "Kiro",
          "icon": "media/kiro-icon.svg"
        }
      ]
    },
    "views": {
      "kiro-acp": [
        {
          "type": "webview",
          "id": "kiro-acp.chatView",
          "name": "Chat"
        }
      ]
    },
    "commands": [
      {
        "command": "kiro-acp.newSession",
        "title": "Kiro: New Chat Session"
      },
      {
        "command": "kiro-acp.cancelRequest",
        "title": "Kiro: Cancel Current Request"
      }
    ],
    "configuration": {
      "title": "Kiro ACP",
      "properties": {
        "kiro-acp.cliPath": {
          "type": "string",
          "default": "",
          "description": "kiro-cli の絶対パス（空の場合は PATH から検索）"
        }
      }
    }
  }
}
```

> `activationEvents` は空配列で問題ない。`views` contribution が定義されているため、VSCode がサイドバー表示時に自動的に拡張機能を activate する。

## コンポーネント設計

### 1. extension.ts（エントリポイント）

責務:
- `activate()`: ACP Client の初期化、WebviewViewProvider の登録、コマンド登録
- `deactivate()`: ACP Client の終了（子プロセス kill）

### 2. acp/client.ts（ACP Client）

責務:
- `kiro-cli acp` の子プロセス spawn・管理
- JSON-RPC 2.0 メッセージの送受信
- リクエスト ID の管理、レスポンスの Promise 解決
- Agent → Client メソッド（`fs/read_text_file` 等）のハンドリング
- プロセスクラッシュ時の自動再起動

主要メソッド:
- `start()` - プロセス起動 + initialize
- `stop()` - プロセス終了
- `newSession(cwd)` - session/new
- `prompt(sessionId, content)` - session/prompt
- `cancel(sessionId)` - session/cancel
- `onUpdate(callback)` - session/update の購読

### 3. acp/types.ts（型定義）

ACP プロトコルの TypeScript 型定義:
- JSON-RPC リクエスト/レスポンス/通知
- initialize パラメータ/結果
- session/* パラメータ/結果
- session/update の各更新タイプ
- Kiro 独自拡張メソッド

### 4. webview/chat-view-provider.ts（WebviewViewProvider）

責務:
- `vscode.WebviewViewProvider` の実装
- Webview の HTML/CSS/JS 生成
- Webview ↔ Extension Host 間の `postMessage` ブリッジ
- ACP Client のイベントを Webview に転送

### 5. webview/main.ts（Webview 側スクリプト）

責務:
- チャット UI のレンダリング・更新
- ユーザー入力の処理
- `acquireVsCodeApi()` による Extension Host との通信
- ストリーミングレスポンスのリアルタイム表示
- Markdown レンダリング

## Webview ↔ Extension Host メッセージ定義

### Webview → Extension Host

```typescript
// ユーザーがメッセージ送信
{ type: 'prompt', text: string }

// リクエストキャンセル
{ type: 'cancel' }

// 新規セッション作成
{ type: 'newSession' }
```

### Extension Host → Webview

```typescript
// エージェントのストリーミングテキスト
{ type: 'agentMessageChunk', text: string }

// ツール呼び出し通知
{ type: 'toolCall', name: string, status: string }

// ツール呼び出し進捗
{ type: 'toolCallUpdate', name: string, content: string }

// ターン完了
{ type: 'turnEnd' }

// エラー
{ type: 'error', message: string }

// 初期化完了
{ type: 'ready', agentInfo: { name: string, version: string } }
```

## プロセス管理

### kiro-cli の検出

1. `kiro-acp.cliPath` 設定が指定されていればそれを使用
2. 未指定の場合、`which kiro-cli`（macOS/Linux）で PATH から検索
3. 見つからない場合、`~/.local/bin/kiro-cli` をフォールバックとして確認
4. いずれも見つからない場合、エラーメッセージとインストール手順を表示

### プロセスライフサイクル

1. Extension activate 時に `kiro-cli acp` を spawn
2. stdin/stdout パイプで JSON-RPC 通信
3. stderr はログ出力に使用
4. プロセス異常終了時: 最大 3 回まで自動再起動
5. Extension deactivate 時に SIGTERM → SIGKILL で確実に終了

### JSON-RPC over stdio の実装

- メッセージフォーマットは `kiro-cli acp` の実装に準拠する（NDJSON または Content-Length ヘッダー方式）
- stdout からの読み取りはバッファリングし、完全なメッセージ単位で処理
- リクエスト ID はインクリメンタルな整数
- 未解決のリクエストは Map で管理し、レスポンス受信時に Promise を resolve

## セキュリティ

### Webview CSP（Content Security Policy）

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
    style-src ${webview.cspSource};
    script-src 'nonce-${nonce}';
    font-src ${webview.cspSource};">
```

### ファイルシステム操作

- `fs/read_text_file` / `fs/write_text_file` はワークスペース内のファイルに限定
- ワークスペース外のファイル操作はユーザー確認ダイアログを表示

### ターミナル操作

- `terminal/create` は VSCode の統合ターミナル API を使用
- コマンド実行前にユーザー確認を求める
