# タスク3: Webview View 基盤

## 概要

VSCode サイドバーに表示するチャット UI の基盤を構築する。
WebviewViewProvider の実装、HTML/CSS/JS の作成、postMessage 通信の確立まで。

## 対象ファイル

- `src/webview/chat-view-provider.ts`（新規作成）
- `webview/index.html`（新規作成）
- `webview/main.ts`（新規作成）
- `webview/style.css`（新規作成）
- `esbuild.mjs`（webview エントリポイント追加）

## 前提タスク

- タスク1（型定義 — メッセージ型の参照）

## TODO

### ChatViewProvider（Extension Host 側）

- [x] `ChatViewProvider` クラス — `vscode.WebviewViewProvider` を実装
  - viewType: `"kiro-acp.chatView"`（package.json の views と一致）
- [x] `resolveWebviewView()` 実装
  - `webview.options` — `{ enableScripts: true, localResourceRoots: [extensionUri] }`
  - `webview.html` — `getHtmlForWebview()` で生成
- [x] `getHtmlForWebview()` — HTML テンプレート生成
  - nonce 生成（CSP 用）
  - `webview.asWebviewUri()` で CSS/JS の URI 変換
  - CSP ヘッダー設定:
    ```html
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none';
        style-src ${webview.cspSource};
        script-src 'nonce-${nonce}';
        font-src ${webview.cspSource};"
    />
    ```
- [x] `postMessage()` ラッパー — Extension Host → Webview へメッセージ送信

### Webview ↔ Extension Host メッセージ型

- [x] Webview → Extension Host:
  - `{ type: "prompt", text: string }` — ユーザーがメッセージ送信
  - `{ type: "cancel" }` — リクエストキャンセル
  - `{ type: "newSession" }` — 新規セッション作成
- [x] Extension Host → Webview:
  - `{ type: "agentMessageChunk", text: string }` — ストリーミングテキスト
  - `{ type: "toolCall", name: string, status: string }` — ツール呼び出し通知
  - `{ type: "toolCallUpdate", name: string, content: string }` — ツール進捗
  - `{ type: "turnEnd" }` — ターン完了
  - `{ type: "error", message: string }` — エラー
  - `{ type: "ready", agentInfo: { name: string, version: string } }` — 初期化完了

### チャット UI（Webview 側）

- [x] `webview/index.html` — 最小構成
  - メッセージ表示エリア（`#messages`）
  - 入力欄（`<textarea>`）+ 送信ボタン
  - CSS/JS の読み込み（nonce 付き `<script>`）
- [x] `webview/main.ts`
  - `acquireVsCodeApi()` で VSCode API 取得
  - 送信ボタン / Enter キーで `{ type: "prompt", text }` を postMessage
  - `window.addEventListener("message")` で Extension Host からのメッセージ受信
  - 受信した `agentMessageChunk` をメッセージ表示エリアに追記
  - `turnEnd` でメッセージ確定
- [x] `webview/style.css`
  - VSCode テーマ CSS 変数を使用（`--vscode-editor-background`, `--vscode-editor-foreground` 等）
  - メッセージバブル（ユーザー / エージェント）
  - 入力エリアのスタイル

### ビルド設定

- [x] `esbuild.mjs` に webview 用エントリポイント追加
  - `webview/main.ts` → `dist/webview.js`
  - platform: `"browser"`（Node.js API 不可）
  - external: なし（vscode モジュールは使わない）

## 設計方針

- Webview 側は `acquireVsCodeApi()` のみで通信し、直接 Node.js API にアクセスしない
- HTML は Extension Host 側で文字列テンプレートとして生成する（`webview/index.html` はテンプレートの参考）
- CSS は VSCode テーマ変数に依存し、ダーク/ライトテーマ両対応

## 参考リンク

- [Kiro CLI ACP ドキュメント](https://kiro.dev/docs/cli/acp/) — セッション更新タイプ（Webview に表示する内容の参考）
- [VSCode Webview View API](https://code.visualstudio.com/api/references/vscode-api#WebviewViewProvider) — WebviewViewProvider インターフェース
- [VSCode Webview ガイド](https://code.visualstudio.com/api/extension-guides/webview) — CSP、postMessage、リソース読み込み
- [VSCode Webview View サンプル](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-view-sample) — 公式サンプル実装
