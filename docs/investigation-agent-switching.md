# エージェント切り替え機能 調査結果

## 調査日

2026-03-03

## 概要

ACP プロセスを実際に起動し、エージェント切り替えの仕組みを調査した。
結論として、**プロセス再起動なしにセッション中でエージェント切り替えが可能**であることが判明した。

## 調査内容

### 1. kiro-cli のエージェント関連機能

```
$ kiro-cli agent list

Workspace: ~/dev/kiro-acp-dev/.kiro/agents
Global:    ~/.kiro/agents

* kiro_default    (Built-in)    Default agent
  kiro_help       (Built-in)    Help agent that answers questions about Kiro CLI features using documentation
  kiro_planner    (Built-in)    Specialized planning agent that helps break down ideas into implementation plans
```

- `kiro-cli acp --agent <AGENT>` でプロセス起動時にエージェントを指定可能
- `--agent` フラグの説明: "Name of the agent to use when starting the first session"
- ワークスペース (`.kiro/agents/`) とグローバル (`~/.kiro/agents/`) にカスタムエージェントを配置可能

### 2. ACP プロトコルでのエージェント公開方法

エージェントは ACP の **mode** として公開される。`session/new` レスポンスの `modes` フィールドに含まれる:

```json
{
  "result": {
    "sessionId": "...",
    "modes": {
      "currentModeId": "kiro_default",
      "availableModes": [
        {
          "id": "kiro_default",
          "name": "kiro_default",
          "description": "The default agent for Kiro CLI"
        },
        {
          "id": "kiro_planner",
          "name": "kiro_planner",
          "description": "Specialized planning agent that helps break down ideas into implementation plans"
        }
      ]
    }
  }
}
```

> **注意**: `kiro_help` は `availableModes` に含まれない。`kiro-cli agent list` では表示されるが、ACP セッション内では利用不可。

### 3. session/set_mode によるセッション中の切り替え

`session/set_mode` メソッドで、同一セッション内でエージェントを切り替えられることを確認:

```json
// リクエスト
{"jsonrpc":"2.0","id":20,"method":"session/set_mode","params":{"sessionId":"...","modeId":"kiro_planner"}}

// レスポンス（成功）
{"jsonrpc":"2.0","result":{},"id":20}
```

- プロセス再起動不要
- 切り替え後、MCP サーバーが再初期化される（`_kiro.dev/mcp/server_initialized` 通知が再送される）
- `_kiro.dev/commands/available` も再送される
- `current_mode_update` の session/update 通知は送信されない

### 4. /agent スラッシュコマンド

`_kiro.dev/commands/available` 通知に `/agent` コマンドが含まれる:

```json
{
  "name": "/agent",
  "description": "Select or list available agents",
  "meta": {
    "optionsMethod": "_kiro.dev/commands/agent/options",
    "inputType": "selection",
    "hint": "↑↓ to choose agent"
  }
}
```

ただし `_kiro.dev/commands/agent/options` メソッドを呼ぶと **Method not found** エラーが返る。
このメソッドは kiro-cli 側の内部 UI 用であり、ACP クライアントからは利用できない。

### 5. 既存コードの対応状況

| レイヤー | 状態 | 詳細 |
|---|---|---|
| `AcpClient.setMode()` | ✅ 実装済み | `session/set_mode` を送信する |
| `ChatViewProvider.applyConfigOption()` | ✅ 実装済み | `configId === 'mode'` で `setMode()` を呼ぶ |
| `buildConfigOptionsFromResult()` | ✅ 実装済み | `modes` → `ConfigOption` (category='mode') に変換 |
| `ChatState.configOptions` | ✅ mode データ保持済み | webview 側の state に mode が入っている |
| **UI 表示** | ❌ 未対応 | `category === 'model'` のみフィルタしており mode が表示されない |

該当箇所 (`chat-view.tsx` 303行目付近):

```tsx
{configOptions
  .filter((opt) => opt.category === 'model')  // ← 'mode' が除外されている
  .map((opt) => (<ModelSelector ... />))}
```

## 結論

### 必要な変更

**UI のみ**。`chat-view.tsx` に `category === 'mode'` の configOption を表示するセレクターを追加すればエージェント切り替えが動作する。

### 不要だった想定

- ~~`agent-discovery.ts` 新規作成（`kiro-cli agent list` のパース）~~
- ~~`AcpClient` の `--agent` 動的化・プロセス再起動~~
- ~~webview メッセージ型への agent 関連追加~~
- ~~`ChatController` への `switchAgent` メソッド追加~~

これらはすべて不要。既存の `configOptions` + `session/set_mode` の仕組みで完結する。
