# ACP プロトコル仕様

## 概要

ACP（Agent Client Protocol）は、AI エージェントとエディタ間の通信を標準化するオープンプロトコル。本拡張機能は ACP の **Client** 側を実装し、`kiro-cli acp` が **Agent** 側として動作する。

## 通信方式

- トランスポート: stdio（stdin/stdout）
- プロトコル: JSON-RPC 2.0
- メッセージ種別:
  - **Method**: リクエスト/レスポンスのペア（`id` フィールドあり）
  - **Notification**: 一方向メッセージ（`id` フィールドなし、レスポンスなし）

## メッセージフロー

```
1. 初期化フェーズ
   Client → Agent: initialize

2. セッション作成
   Client → Agent: session/new  または  session/load

3. プロンプトターン（繰り返し）
   Client → Agent: session/prompt
   Agent → Client: session/update（複数回、ストリーミング）
   Client → Agent: session/cancel（必要時）
```

## Client → Agent メソッド

### initialize

接続初期化。プロトコルバージョンとケイパビリティを交換する。

リクエスト:

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {
      "fs": {
        "readTextFile": true,
        "writeTextFile": true
      },
      "terminal": true
    },
    "clientInfo": {
      "name": "kiro-acp-dev",
      "title": "Kiro ACP Dev",
      "version": "0.1.0"
    }
  }
}
```

レスポンス:

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": {
        "image": true
      }
    },
    "agentInfo": {
      "name": "kiro-cli",
      "version": "1.5.0"
    }
  }
}
```

### session/new

新規チャットセッションを作成する。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/path/to/project",
    "mcpServers": []
  }
}
```

### session/load

既存セッションを ID で復元する。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/load",
  "params": {
    "sessionId": "sess_abc123"
  }
}
```

### session/prompt

ユーザーのプロンプトをエージェントに送信する。

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/prompt",
  "params": {
    "sessionId": "sess_abc123",
    "content": [
      {
        "type": "text",
        "text": "このコードを説明して"
      }
    ]
  }
}
```

コンテンツタイプ:

- `text` - テキストメッセージ（必須サポート）
- `image` - 画像（`promptCapabilities.image: true` の場合）
- `resource_link` - リソースリンク（必須サポート）

### session/cancel（Notification）

処理中のオペレーションをキャンセルする。レスポンスなし。

```json
{
  "jsonrpc": "2.0",
  "method": "session/cancel",
  "params": {
    "sessionId": "sess_abc123"
  }
}
```

### session/set_mode

エージェントのモードを切り替える。

### session/set_model

セッションのモデルを変更する。

## Agent → Client メソッド

### session/request_permission

ツール呼び出しに対するユーザー承認を要求する。

### fs/read_text_file

ファイル内容の読み取り（`fs.readTextFile` ケイパビリティが必要）。パスは絶対パス。

### fs/write_text_file

ファイル内容の書き込み（`fs.writeTextFile` ケイパビリティが必要）。パスは絶対パス。

### terminal/\*

ターミナル操作群（`terminal` ケイパビリティが必要）:

- `terminal/create` - ターミナル作成
- `terminal/output` - 出力取得
- `terminal/wait_for_exit` - 終了待機
- `terminal/release` - ターミナル解放
- `terminal/kill` - プロセス強制終了

## Agent → Client Notification

### session/update

セッションの進捗を通知する。以下の更新タイプがある:

| 更新タイプ          | 説明                                                |
| ------------------- | --------------------------------------------------- |
| `AgentMessageChunk` | エージェントからのストリーミングテキスト/コンテンツ |
| `ToolCall`          | ツール呼び出し（名前、パラメータ、ステータス）      |
| `ToolCallUpdate`    | 実行中ツールの進捗更新                              |
| `TurnEnd`           | エージェントのターン完了                            |

## Kiro 独自拡張（`_kiro.dev/` プレフィックス）

ACP 仕様に準拠したカスタムメソッド。未対応クライアントは無視可能。

| メソッド                           | 種別         | 説明                           |
| ---------------------------------- | ------------ | ------------------------------ |
| `_kiro.dev/commands/execute`       | Request      | スラッシュコマンド実行         |
| `_kiro.dev/commands/options`       | Request      | コマンド補完候補取得           |
| `_kiro.dev/commands/available`     | Notification | 利用可能コマンド一覧通知       |
| `_kiro.dev/mcp/oauth_request`      | Notification | OAuth 認証 URL 通知            |
| `_kiro.dev/mcp/server_initialized` | Notification | MCP サーバー初期化完了通知     |
| `_kiro.dev/compaction/status`      | Notification | コンテキスト圧縮進捗           |
| `_kiro.dev/clear/status`           | Notification | セッション履歴クリア状態       |
| `_session/terminate`               | Notification | サブエージェントセッション終了 |

## 制約事項

- ファイルパスはすべて絶対パスであること
- 行番号は 1-based
- エラーハンドリングは JSON-RPC 2.0 標準に準拠
- セッションは `~/.kiro/sessions/cli/` に永続化される
