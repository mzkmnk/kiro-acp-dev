# タスク3: Webview View 基盤

対象ファイル: `src/webview/chat-view-provider.ts`, `webview/index.html`, `webview/main.ts`, `webview/style.css`

## TODO

- [ ] `ChatViewProvider` クラス（`vscode.WebviewViewProvider` 実装）
- [ ] `resolveWebviewView()` で HTML 生成・Webview オプション設定
- [ ] CSP（Content Security Policy）設定（nonce, cspSource）
- [ ] `webview/index.html` — メッセージ表示エリア + 入力欄 + 送信ボタン
- [ ] `webview/main.ts` — `acquireVsCodeApi()` + postMessage 送受信
- [ ] `webview/style.css` — VSCode テーマ CSS 変数連動の基本スタイル
- [ ] esbuild に webview エントリポイント追加（`webview/main.ts` → `dist/webview.js`）
- [ ] Webview → Extension Host メッセージ型定義（prompt, cancel, newSession）
- [ ] Extension Host → Webview メッセージ型定義（agentMessageChunk, toolCall, turnEnd, error, ready）
