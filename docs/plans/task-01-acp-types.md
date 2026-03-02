# タスク1: ACP プロトコル型定義

対象ファイル: `src/acp/types.ts`

## TODO

- [ ] JSON-RPC 2.0 基本型（Request / Response / Notification / Error）
- [ ] `initialize` パラメータ / 結果型（clientCapabilities, agentCapabilities, clientInfo, agentInfo）
- [ ] `session/new` パラメータ / 結果型
- [ ] `session/load` パラメータ / 結果型
- [ ] `session/prompt` パラメータ / 結果型（content: text / image / resource_link）
- [ ] `session/cancel` パラメータ型（Notification）
- [ ] `session/update` 更新タイプ（AgentMessageChunk, ToolCall, ToolCallUpdate, TurnEnd）
- [ ] Agent → Client メソッド型（`fs/read_text_file`, `fs/write_text_file`）
- [ ] Agent → Client メソッド型（`terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/release`, `terminal/kill`）
- [ ] `session/request_permission` パラメータ / 結果型
- [ ] `session/set_mode`, `session/set_model` パラメータ型
- [ ] Kiro 独自拡張メソッド型（`_kiro.dev/commands/*`, `_kiro.dev/mcp/*`, `_kiro.dev/compaction/*`, `_kiro.dev/clear/*`）
