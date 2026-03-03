import * as vscode from 'vscode';

import { AcpClient } from '../acp/client';
import type {
  InitializeResult,
  SessionRequestPermissionParams,
  SessionRequestPermissionResult,
  SessionUpdateParams,
  TextContent,
  ToolCallContent,
} from '../acp/types';

export type WebviewToExtensionMessage =
  | { type: 'prompt'; text: string }
  | { type: 'cancel' }
  | { type: 'newSession' }
  | { type: 'permissionResponse'; id: number; optionId: string };

export type ExtensionToWebviewMessage =
  | { type: 'agentMessageChunk'; text: string }
  | {
      type: 'toolCall';
      toolCallId: string;
      name: string;
      title: string;
      status: string;
      content: string;
    }
  | {
      type: 'toolCallUpdate';
      toolCallId: string;
      name: string;
      title: string;
      status: string;
      content: string;
    }
  | {
      type: 'requestPermission';
      id: number;
      toolCallId: string;
      toolName: string;
      params: string;
      options: Array<{ optionId: string; label: string }>;
    }
  | { type: 'turnEnd' }
  | { type: 'error'; message: string }
  | { type: 'ready'; agentInfo: { name: string; version: string } };

/**
 * Provides and bridges the chat webview with ACP session APIs.
 * チャット Webview を提供し、ACP セッション API とのブリッジを担当します。
 */
export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'kiro-acp.chatView';

  private view?: vscode.WebviewView;
  private sessionId?: string;
  private initializeResult?: InitializeResult;
  private startPromise?: Promise<InitializeResult>;
  private sessionPromise?: Promise<string>;
  private readonly pendingPermissionRequests = new Map<number, (optionId: string) => void>();
  private readonly disposables: vscode.Disposable[];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly acpClient: AcpClient,
    private readonly workspacePath: string,
  ) {
    this.disposables = [
      this.acpClient.onUpdate((params) => {
        void this.handleSessionUpdate(params);
      }),
    ];

    this.acpClient.registerHandler('session/request_permission', async (params) => {
      return this.handlePermissionRequest(params as SessionRequestPermissionParams);
    });
  }

  /**
   * Resolves and initializes the chat webview when VSCode creates the view.
   * VSCode がビューを生成した際に、チャット Webview を解決して初期化します。
   *
   * @param webviewView - Target webview view instance.
   *                      初期化対象の WebviewView インスタンス。
   */
  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
        void this.handleWebviewMessage(message);
      }),
    );

    void this.ensureReady();
  }

  /**
   * Creates a fresh ACP session and binds it to this view.
   * 新しい ACP セッションを作成し、このビューに紐付けます。
   */
  public async createNewSession(): Promise<void> {
    try {
      this.sessionId = await this.createSession();
    } catch (error) {
      await this.postError(error);
    }
  }

  /**
   * Cancels the current turn for the active session.
   * 現在アクティブなセッションのターンをキャンセルします。
   */
  public cancelCurrentRequest(): void {
    if (!this.sessionId) {
      return;
    }
    this.acpClient.cancel(this.sessionId);
  }

  /**
   * Sends a typed message to the webview instance.
   * Webview インスタンスへ型付きメッセージを送信します。
   *
   * @param message - Payload sent to webview.
   *                  Webview に送るペイロード。
   * @returns A promise that resolves after message dispatch.
   *          メッセージ送信処理後に解決される Promise。
   */
  public async postMessage(message: ExtensionToWebviewMessage): Promise<boolean> {
    if (!this.view) {
      return false;
    }
    return this.view.webview.postMessage(message);
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async handleWebviewMessage(message: WebviewToExtensionMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'prompt': {
          const text = message.text.trim();
          if (!text) {
            return;
          }

          const sessionId = await this.ensureSession();
          await this.acpClient.prompt(sessionId, [{ type: 'text', text }]);
          await this.postMessage({ type: 'turnEnd' });
          return;
        }
        case 'cancel':
          this.cancelCurrentRequest();
          return;
        case 'newSession':
          await this.createNewSession();
          return;
        case 'permissionResponse': {
          const resolver = this.pendingPermissionRequests.get(message.id);
          if (!resolver) {
            return;
          }
          this.pendingPermissionRequests.delete(message.id);
          resolver(message.optionId);
          return;
        }
      }
    } catch (error) {
      await this.postError(error);
    }
  }

  private async ensureReady(): Promise<void> {
    const initializeResult = await this.ensureStarted();
    await this.postMessage({
      type: 'ready',
      agentInfo: initializeResult.agentInfo,
    });
    await this.ensureSession();
  }

  private async ensureStarted(): Promise<InitializeResult> {
    if (this.initializeResult) {
      return this.initializeResult;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.acpClient.start();

    try {
      this.initializeResult = await this.startPromise;
      return this.initializeResult;
    } finally {
      this.startPromise = undefined;
    }
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    return this.createSession();
  }

  private async createSession(): Promise<string> {
    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    this.sessionPromise = (async () => {
      await this.ensureStarted();
      const result = await this.acpClient.newSession(this.workspacePath);
      this.sessionId = result.sessionId;
      return result.sessionId;
    })();

    try {
      return await this.sessionPromise;
    } finally {
      this.sessionPromise = undefined;
    }
  }

  private async handleSessionUpdate(params: SessionUpdateParams): Promise<void> {
    if (!this.sessionId || params.sessionId !== this.sessionId) {
      return;
    }

    const update = params.update;
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        if (update.content.type !== 'text') {
          return;
        }

        await this.postMessage({ type: 'agentMessageChunk', text: update.content.text });
        return;
      }
      case 'tool_call': {
        await this.postMessage({
          type: 'toolCall',
          toolCallId: update.toolCallId,
          name: this.toolDisplayName(update.kind, update.rawInput),
          title: update.title ?? '',
          status: this.normalizeToolCallStatus(update.status),
          content: this.renderToolCallUpdateContent(update.content),
        });
        return;
      }
      case 'tool_call_update': {
        await this.postMessage({
          type: 'toolCallUpdate',
          toolCallId: update.toolCallId,
          name: this.toolDisplayName(update.kind, update.rawInput),
          title: update.title ?? '',
          status: this.normalizeToolCallStatus(update.status),
          content: this.renderToolCallUpdateContent(update.content),
        });
        return;
      }
      case 'turn_end': {
        await this.postMessage({ type: 'turnEnd' });
        return;
      }
      default:
        return;
    }
  }

  private renderToolCallUpdateContent(content: ToolCallContent[] | undefined): string {
    if (!content || content.length === 0) {
      return 'updated';
    }

    const textBlocks = content
      .filter((item): item is { type: 'content'; content: TextContent } => {
        return item.type === 'content' && item.content.type === 'text';
      })
      .map((item) => item.content.text.trim())
      .filter(Boolean);

    return textBlocks.join('\n') || `updated (${content[0].type})`;
  }

  private normalizeToolCallStatus(status: string | undefined): string {
    if (!status) {
      return 'pending';
    }
    return status === 'in_progress' ? 'running' : status;
  }

  private toolKindLabel(kind: string | undefined): string {
    switch (kind) {
      case 'read':
        return 'read';
      case 'edit':
        return 'edit';
      case 'delete':
        return 'delete';
      case 'move':
        return 'move';
      case 'search':
        return 'search';
      case 'execute':
        return 'shell';
      case 'think':
        return 'think';
      case 'fetch':
        return 'fetch';
      default:
        return 'tool';
    }
  }

  private toolDisplayName(kind: string | undefined, rawInput: unknown): string {
    const label = this.toolKindLabel(kind);
    const purpose =
      rawInput && typeof rawInput === 'object' && '__tool_use_purpose' in rawInput
        ? String((rawInput as Record<string, unknown>).__tool_use_purpose)
        : undefined;
    return purpose ? `${label}(${purpose})` : label;
  }

  private async handlePermissionRequest(
    params: SessionRequestPermissionParams,
  ): Promise<SessionRequestPermissionResult> {
    const optionId = await this.waitForPermissionDecision({
      id: this.createRequestId(),
      toolCallId: params.toolCall.toolCallId,
      toolName: params.toolCall.title ?? 'tool',
      paramSummary: this.renderPermissionParams(params.toolCall.rawInput),
      options: params.options.map((option) => ({
        optionId: option.optionId,
        label: this.toPermissionLabel(option.kind),
      })),
    });

    return {
      outcome: {
        outcome: 'selected',
        optionId,
      },
    };
  }

  private async waitForPermissionDecision(request: {
    id: number;
    toolCallId: string;
    toolName: string;
    paramSummary: string;
    options: Array<{ optionId: string; label: string }>;
  }): Promise<string> {
    await this.postMessage({
      type: 'requestPermission',
      id: request.id,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      params: request.paramSummary,
      options: request.options,
    });

    const rejectOptionId =
      request.options.find((o) => o.optionId.startsWith('reject'))?.optionId ?? 'reject_once';

    return new Promise<string>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingPermissionRequests.delete(request.id);
        resolve(rejectOptionId);
      }, 120_000);

      this.pendingPermissionRequests.set(request.id, (optionId) => {
        clearTimeout(timeoutHandle);
        resolve(optionId);
      });
    });
  }

  private renderPermissionParams(rawInput: unknown): string {
    if (rawInput === undefined) {
      return '(no parameters)';
    }

    try {
      return JSON.stringify(rawInput, null, 2);
    } catch {
      return String(rawInput);
    }
  }

  private createRequestId(): number {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  private toPermissionLabel(kind: string): string {
    switch (kind) {
      case 'allow_once':
        return 'Yes';
      case 'allow_always':
        return 'Always';
      case 'reject_once':
        return 'No';
      case 'reject_always':
        return 'Never';
      default:
        return kind;
    }
  }

  private async postError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.postMessage({ type: 'error', message });
    void vscode.window.showErrorMessage(message);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'style.css'),
    );

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${
        webview.cspSource
      };"
    />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Kiro ACP Chat</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}
