import * as vscode from 'vscode';

import { AcpClient } from '../acp/client';
import type {
  ConfigOption,
  ConfigOptionsUpdate,
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
  | { type: 'permissionResponse'; id: number; optionId: string }
  | { type: 'setConfigOption'; configId: string; value: string };

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
  | { type: 'ready'; agentInfo: { name: string; version: string } }
  | {
      type: 'configOptions';
      options: Array<{
        id: string;
        name: string;
        category?: string;
        currentValue: string;
        values: Array<{ value: string; name: string }>;
      }>;
    }
  | { type: 'sessionStatus'; status: string; message: string };

/**
 * Provides and bridges the chat webview with ACP session APIs.
 * チャット Webview を提供し、ACP セッション API とのブリッジを担当します。
 */
export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'kiro-acp.chatView';

  private static readonly SESSION_ID_KEY = 'kiro-acp.lastSessionId';

  private view?: vscode.WebviewView;
  private sessionId?: string;
  private initializeResult?: InitializeResult;
  private startPromise?: Promise<InitializeResult>;
  private sessionPromise?: Promise<string>;
  private configOptions: ConfigOption[] = [];
  private readonly pendingPermissionRequests = new Map<number, (optionId: string) => void>();
  private readonly disposables: vscode.Disposable[];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly acpClient: AcpClient,
    private readonly workspacePath: string,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.disposables = [
      this.acpClient.onUpdate((params) => {
        void this.handleSessionUpdate(params);
      }),
      this.acpClient.onCompactionStatus((params) => {
        if (this.sessionId && params.sessionId === this.sessionId) {
          void this.postMessage({
            type: 'sessionStatus',
            status: 'compacting',
            message: params.status,
          });
        }
      }),
      this.acpClient.onClearStatus((params) => {
        if (this.sessionId && params.sessionId === this.sessionId) {
          void this.postMessage({
            type: 'sessionStatus',
            status: 'clearing',
            message: params.status,
          });
        }
      }),
      this.acpClient.onTerminate((params) => {
        if (this.sessionId && params.sessionId === this.sessionId) {
          this.sessionId = undefined;
          this.persistSessionId(undefined);
          void this.postMessage({
            type: 'sessionStatus',
            status: 'terminated',
            message: 'Session terminated',
          });
        }
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
      this.sessionId = undefined;
      this.persistSessionId(undefined);
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
        case 'setConfigOption': {
          if (!this.sessionId) {
            return;
          }
          await this.applyConfigOption(this.sessionId, message.configId, message.value);
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
    if (this.configOptions.length > 0) {
      await this.postConfigOptions();
    }
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

    const savedId = this.context.workspaceState.get<string>(ChatViewProvider.SESSION_ID_KEY);
    if (savedId) {
      try {
        return await this.loadSession(savedId);
      } catch {
        // Saved session is no longer valid; create a new one.
        this.persistSessionId(undefined);
      }
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
      this.persistSessionId(result.sessionId);

      if (result.configOptions) {
        this.configOptions = result.configOptions;
      } else {
        this.configOptions = this.buildConfigOptionsFromResult(result);
      }

      if (this.configOptions.length > 0) {
        await this.postConfigOptions();
      }

      return result.sessionId;
    })();

    try {
      return await this.sessionPromise;
    } finally {
      this.sessionPromise = undefined;
    }
  }

  /**
   * Loads an existing ACP session by ID and restores config options.
   * 既存の ACP セッションを ID で読み込み、設定オプションを復元します。
   *
   * @param sessionId - Session ID to load.
   *                    読み込むセッション ID。
   * @returns The loaded session ID.
   *          読み込まれたセッション ID。
   */
  private async loadSession(sessionId: string): Promise<string> {
    await this.ensureStarted();
    const result = await this.acpClient.loadSession(sessionId, this.workspacePath);
    this.sessionId = result.sessionId;
    this.persistSessionId(result.sessionId);

    if (result.configOptions) {
      this.configOptions = result.configOptions;
    } else {
      this.configOptions = this.buildConfigOptionsFromResult(result);
    }

    if (this.configOptions.length > 0) {
      await this.postConfigOptions();
    }

    return result.sessionId;
  }

  /**
   * Persists or clears the session ID in workspace state.
   * ワークスペース状態にセッション ID を保存またはクリアします。
   *
   * @param sessionId - Session ID to persist, or undefined to clear.
   *                    保存するセッション ID。undefined でクリア。
   */
  private persistSessionId(sessionId: string | undefined): void {
    void this.context.workspaceState.update(ChatViewProvider.SESSION_ID_KEY, sessionId);
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
      case 'config_options_update': {
        this.configOptions = (update as ConfigOptionsUpdate).configOptions;
        await this.postConfigOptions();
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

  /**
   * Applies a config option change via the appropriate ACP API and updates local state.
   * 適切な ACP API を使って設定オプションの変更を適用し、ローカル状態を更新します。
   *
   * @param sessionId - Target ACP session ID.
   *                    対象の ACP セッション ID。
   * @param configId - Config option identifier (e.g. 'model', 'mode').
   *                   設定オプションの識別子。
   * @param value - New value.
   *               新しい値。
   */
  private async applyConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<void> {
    if (configId === 'model') {
      await this.acpClient.setModel(sessionId, value);
    } else if (configId === 'mode') {
      await this.acpClient.setMode(sessionId, value);
    } else {
      const result = await this.acpClient.setConfigOption(sessionId, configId, value);
      this.configOptions = result.configOptions;
      await this.postConfigOptions();
      return;
    }

    this.configOptions = this.configOptions.map((opt) =>
      opt.id === configId ? { ...opt, currentValue: value } : opt,
    );
    await this.postConfigOptions();
  }

  /**
   * Builds ConfigOption[] from legacy modes/models fields in session/new response.
   * session/new レスポンスのレガシー modes/models フィールドから ConfigOption[] を構築します。
   */
  private buildConfigOptionsFromResult(result: {
    modes?: { currentModeId: string; availableModes: Array<{ id: string; name: string }> };
    models?: {
      currentModelId: string;
      availableModels: Array<{ modelId: string; name: string }>;
    };
  }): ConfigOption[] {
    const options: ConfigOption[] = [];

    if (result.models) {
      options.push({
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        currentValue: result.models.currentModelId,
        options: result.models.availableModels.map((m) => ({
          value: m.modelId,
          name: m.name,
        })),
      });
    }

    if (result.modes) {
      options.push({
        id: 'mode',
        name: 'Mode',
        category: 'mode',
        type: 'select',
        currentValue: result.modes.currentModeId,
        options: result.modes.availableModes.map((m) => ({
          value: m.id,
          name: m.name,
        })),
      });
    }

    return options;
  }

  private async postConfigOptions(): Promise<void> {
    await this.postMessage({
      type: 'configOptions',
      options: this.configOptions.map((opt) => ({
        id: opt.id,
        name: opt.name,
        category: opt.category,
        currentValue: opt.currentValue,
        values: opt.options.map((v) => ({ value: v.value, name: v.name })),
      })),
    });
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
