# タスク5: UI 機能強化

## 概要

タスク4で動作する基本チャットの UI を強化する。
Markdown レンダリング、シンタックスハイライト、UX 改善。

## 対象ファイル

- `webview/main.ts`（修正）
- `webview/style.css`（修正）
- `package.json`（依存追加）

## 前提タスク

- タスク4（基本チャットが動作していること）

## TODO

### Markdown レンダリング

- [ ] `marked` パッケージを devDependencies に追加
- [ ] エージェントのメッセージを `marked.parse()` で HTML に変換して表示
- [ ] CSP に `style-src 'unsafe-inline'` を追加するか、marked の出力に対応する CSS を用意

### シンタックスハイライト

- [ ] `highlight.js` パッケージを devDependencies に追加
- [ ] `marked` の renderer をカスタマイズし、コードブロックに `hljs.highlight()` を適用
- [ ] highlight.js の CSS テーマを VSCode テーマに合わせて選択（ダーク/ライト）

### UX 改善

- [ ] 送信中のローディング表示（スピナー or 「考え中...」表示）
- [ ] エラーメッセージの視覚的な表示（赤背景 or アイコン付き）
- [ ] 自動スクロール — 新メッセージ追加時にメッセージエリアの最下部にスクロール
- [ ] 送信中は入力欄を無効化、TurnEnd で再有効化
- [ ] 空メッセージの送信防止

## 設計方針

- `marked` と `highlight.js` は esbuild でバンドルされるため、Webview 側で直接 import する
- Webview の CSP を壊さないよう注意（inline style が必要な場合は nonce or hash で対応）

## 参考リンク

- [marked (npm)](https://www.npmjs.com/package/marked) — Markdown パーサー
- [highlight.js](https://highlightjs.org/) — シンタックスハイライト
- [VSCode Webview ガイド - テーマ](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content) — CSS 変数によるテーマ連動
