# タスク7: Agent → Client メソッド実装

## 概要

ACP Agent（kiro-cli）からのリクエストに応答するハンドラを実装する。
ファイル読み書きとターミナル操作。

## 対象ファイル

- `src/acp/handlers/fs.ts`（新規作成）
- `src/acp/handlers/terminal.ts`（新規作成）
- `src/acp/client.ts`（ハンドラ登録追加）

## 前提タスク

- タスク2（ACP Client のハンドラディスパッチ基盤）
- タスク4（Extension 統合）

## TODO

### ファイルシステム操作

- [ ] `fs/read_text_file` ハンドラ
  - パラメータ: `{ path: string }`（絶対パス）
  - VSCode `workspace.fs.readFile()` で読み取り → UTF-8 デコードして返す
  - ワークスペース外のパスの場合、ユーザー確認ダイアログを表示
- [ ] `fs/write_text_file` ハンドラ
  - パラメータ: `{ path: string, content: string }`（絶対パス）
  - VSCode `workspace.fs.writeFile()` で書き込み
  - ワークスペース外のパスの場合、ユーザー確認ダイアログを表示

### ターミナル操作

- [ ] `terminal/create` ハンドラ
  - VSCode `window.createTerminal()` でターミナル作成
  - ターミナル ID を返す（内部 Map で管理）
  - コマンド実行前にユーザー確認を求める
- [ ] `terminal/output` ハンドラ
  - 指定ターミナルの出力を取得
  - VSCode Terminal API の制約: 直接出力取得は難しいため、`onDidWriteTerminalData`（proposed API）or シェル統合を検討
- [ ] `terminal/wait_for_exit` ハンドラ
  - `onDidCloseTerminal` イベントで終了を検知
  - 終了コードを返す
- [ ] `terminal/release` ハンドラ
  - 内部 Map からターミナル参照を削除
- [ ] `terminal/kill` ハンドラ
  - `terminal.dispose()` でプロセス強制終了

### ハンドラ登録

- [ ] `client.registerHandler("fs/read_text_file", fsReadHandler)` 等を extension.ts or client.ts で登録

## 設計方針

- ターミナル管理は `Map<string, vscode.Terminal>` で ID → Terminal インスタンスのマッピング
- ファイルパスは絶対パスが前提（ACP 仕様）。行番号は 1-based
- セキュリティ: ワークスペース外のファイル操作は必ずユーザー確認を挟む

## 参考リンク

- [Kiro CLI ACP ドキュメント](https://kiro.dev/docs/cli/acp/) — Agent → Client メソッド概要
- [ACP File System](https://agentclientprotocol.com/protocol/file-system) — fs/read_text_file, fs/write_text_file 仕様
- [ACP Terminals](https://agentclientprotocol.com/protocol/terminals) — terminal/* メソッド仕様
- [VSCode workspace.fs API](https://code.visualstudio.com/api/references/vscode-api#FileSystem) — ファイル読み書き
- [VSCode Terminal API](https://code.visualstudio.com/api/references/vscode-api#Terminal) — ターミナル操作
