# プロジェクト概要

## プロジェクト名

kiro-acp-dev

## 概要

VSCode 拡張機能として、`kiro-cli acp` プロセスを内包し、完全オリジナルのチャットパネル UI を提供するアプリケーション。

サイドバーに Webview View としてチャットパネルを表示し、内部で `kiro-cli acp` を子プロセスとして起動、ACP（Agent Client Protocol）の JSON-RPC 2.0 over stdio で通信する。

## 目的

- VSCode 上で Kiro AI エージェントとチャットできる独自チャットパネルを提供する
- `kiro-cli acp` を子プロセスとして管理し、ACP プロトコルで通信する
- 既存の VSCode Chat API（Copilot 等）に依存しない、完全独立の拡張機能として動作する

## 技術スタック

| 要素            | 技術                                          |
| --------------- | --------------------------------------------- |
| 拡張機能        | VSCode Extension（TypeScript）                |
| UI              | Webview View（HTML/CSS/JS）、サイドバーパネル |
| 通信プロトコル  | ACP / JSON-RPC 2.0 over stdio                 |
| AI エージェント | `kiro-cli acp`（子プロセス）                  |
| ビルド          | esbuild or webpack                            |
| パッケージ管理  | pnpm                                          |
| ライセンス      | MIT                                           |

## アーキテクチャ

```
┌──────────────────────────────────────────────────┐
│                    VSCode                        │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  kiro-acp-dev Extension (TypeScript)       │  │
│  │                                            │  │
│  │  ┌──────────────┐   ┌──────────────────┐   │  │
│  │  │ Webview View │   │ ACP Client       │   │  │
│  │  │ (Chat UI)    │◄─►│ (JSON-RPC 2.0)   │   │  │
│  │  │ HTML/CSS/JS  │   │                  │   │  │
│  │  └──────────────┘   └────────┬─────────┘   │  │
│  │    postMessage                │ stdio       │  │
│  └───────────────────────────────┼────────────┘  │
│                                  │               │
│  ┌───────────────────────────────▼────────────┐  │
│  │         kiro-cli acp (子プロセス)           │  │
│  │         ACP Agent Server                   │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### データフロー

1. ユーザーが Webview のチャット入力欄にメッセージを入力
2. Webview → Extension Host: `postMessage` でメッセージ送信
3. Extension Host: ACP Client が JSON-RPC リクエストを構築
4. Extension Host → kiro-cli acp: stdin にリクエストを書き込み
5. kiro-cli acp → Extension Host: stdout からレスポンス/通知を読み取り
6. Extension Host → Webview: `postMessage` でレスポンスを転送
7. Webview がチャット UI を更新

## 参考リンク

- [Kiro CLI ACP ドキュメント](https://kiro.dev/docs/cli/acp/)
- [ACP 仕様](https://agentclientprotocol.com)
- [VSCode Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VSCode Webview View Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-view-sample)
- [VSCode Extension API](https://code.visualstudio.com/api)
