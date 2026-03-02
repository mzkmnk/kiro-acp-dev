# タスク4: extension.ts 統合 + 基本チャット

対象ファイル: `src/extension.ts`

## TODO

- [ ] `activate()` で ACP Client を初期化・起動
- [ ] `activate()` で ChatViewProvider を登録（`registerWebviewViewProvider`）
- [ ] `activate()` でコマンド登録（`kiro-acp.newSession`, `kiro-acp.cancelRequest`）
- [ ] `deactivate()` で ACP Client 終了
- [ ] Webview ↔ ACP Client のメッセージブリッジ（postMessage → ACP、session/update → postMessage）
- [ ] 基本チャットフロー動作確認（session/new → prompt → ストリーミング表示 → TurnEnd）
- [ ] キャンセル動作確認（session/cancel）
