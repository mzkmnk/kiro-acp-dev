# タスク9: 品質・配布準備

## 概要

拡張機能の配布に必要なドキュメント整備とパッケージング。

## 対象ファイル

- `README.md`（修正）
- `CHANGELOG.md`（新規作成）
- `package.json`（必要に応じて修正）

## 前提タスク

- タスク1〜8（主要機能が実装済みであること）

## TODO

- [ ] README 充実
  - 概要・機能説明
  - スクリーンショット / GIF
  - インストール手順（Marketplace or .vsix）
  - 使い方（kiro-cli のインストール、ログイン、拡張機能の起動）
  - 設定項目の説明（`kiro-acp.cliPath`）
  - 開発方法（clone → pnpm install → F5 でデバッグ起動）
- [ ] CHANGELOG 作成（Keep a Changelog 形式）
- [ ] `vsce package` で .vsix 生成確認
  - `@vscode/vsce` を devDependencies に追加
  - `.vscodeignore` の確認（不要ファイルが含まれないこと）
- [ ] VS Marketplace 公開準備
  - publisher ID の確認
  - アイコン（128x128 PNG）の用意
  - `package.json` の `repository`, `homepage`, `bugs` フィールド追加

## 参考リンク

- [vsce - VSCode Extension Manager](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) — パッケージング・公開手順
- [VS Marketplace](https://marketplace.visualstudio.com/) — 公開先
- [Keep a Changelog](https://keepachangelog.com/) — CHANGELOG フォーマット
