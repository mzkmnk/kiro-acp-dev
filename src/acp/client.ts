import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { homedir } from 'node:os';
import * as vscode from 'vscode';

import { classifyJsonRpcMessage } from './client-core/classify-json-rpc-message';
import { createCliNotFoundMessage } from './client-core/create-cli-not-found-message';
import { createCliPathCandidates } from './client-core/create-cli-path-candidates';
import { createInitializeParams } from './client-core/create-initialize-params';
import { createInternalHandlerErrorResponse } from './client-core/create-internal-handler-error-response';
import { createMethodNotFoundResponse } from './client-core/create-method-not-found-response';
import { createRequestTimeoutError } from './client-core/create-request-timeout-error';
import { createRpcError } from './client-core/create-rpc-error';
import { splitNdjsonBuffer } from './client-core/split-ndjson-buffer';

import type {
  InitializeResult,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  PromptContent,
  SessionCancelParams,
  SessionNewParams,
  SessionNewResult,
  SessionPromptParams,
  SessionUpdateParams,
} from './types';

/**
 * Tracks a pending JSON-RPC request until response/timeout.
 * JSON-RPC リクエストの応答またはタイムアウトまでの状態を保持します。
 */
type PendingRequest = {
  /** Promise resolver for successful response. / 正常応答時の Promise resolve。 */
  resolve: (value: unknown) => void;
  /** Promise rejecter for error/timeout. / エラーまたはタイムアウト時の Promise reject。 */
  reject: (reason?: unknown) => void;
  /** Timeout handle for the request. / リクエストのタイムアウトハンドル。 */
  timeoutHandle: NodeJS.Timeout;
};

/**
 * Handler signature for Agent→Client request dispatch.
 * Agent→Client リクエストのディスパッチに使うハンドラの型です。
 */
type RequestHandler = (params: unknown) => unknown | Promise<unknown>;

/** JSON-RPC protocol version string. / JSON-RPC のプロトコルバージョン文字列。 */
const JSON_RPC_VERSION = '2.0';
/** Default request timeout in milliseconds. / 既定のリクエストタイムアウト（ミリ秒）。 */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/** Grace period before SIGKILL on shutdown. / 停止時に SIGKILL へ切り替えるまでの猶予時間。 */
const PROCESS_SHUTDOWN_GRACE_MS = 3_000;
/** Maximum number of automatic restart attempts. / 自動再起動の最大試行回数。 */
const MAX_RESTARTS = 3;

/**
 * ACP client implementation that manages process lifecycle and JSON-RPC transport.
 * プロセスライフサイクルと JSON-RPC トランスポートを管理する ACP クライアント実装です。
 */
export class AcpClient {
  /** Child process for `kiro-cli acp`. / `kiro-cli acp` の子プロセス。 */
  private process?: ChildProcessWithoutNullStreams;
  /** Output target for operational logs. / 動作ログの出力先。 */
  private readonly outputChannel: vscode.OutputChannel;
  /** Request timeout per JSON-RPC call. / JSON-RPC 呼び出しごとのタイムアウト。 */
  private readonly requestTimeoutMs: number;
  /** Map of unresolved requests keyed by request ID. / 未解決リクエストを ID で管理するマップ。 */
  private readonly pendingRequests = new Map<number, PendingRequest>();
  /** Registry for Agent→Client request handlers. / Agent→Client リクエストハンドラの登録表。 */
  private readonly handlers = new Map<string, RequestHandler>();
  /** Emitter for `session/update` notifications. / `session/update` 通知のイベントエミッタ。 */
  private readonly updateEmitter = new vscode.EventEmitter<SessionUpdateParams>();

  /** Incremental stdout buffer for NDJSON framing. / NDJSON 分割用の stdout バッファ。 */
  private stdoutBuffer = '';
  /** Next request ID counter. / 次に採番するリクエスト ID。 */
  private nextId = 0;
  /** Current restart attempt count. / 現在の再起動試行回数。 */
  private restartCount = 0;
  /** Flag indicating intentional shutdown. / 意図的な停止処理中であることを示すフラグ。 */
  private stopping = false;
  /** Resolved absolute path to `kiro-cli`. / 解決済みの `kiro-cli` 絶対パス。 */
  private cliPath?: string;

  /**
   * Creates an ACP client instance with optional output and timeout settings.
   * 出力先とタイムアウト設定を任意指定して ACP クライアントインスタンスを生成します。
   *
   * @param options - Optional runtime options for logging and request timeout.
   *                  ログ出力先とリクエストタイムアウトの任意設定。
   */
  constructor(options?: { outputChannel?: vscode.OutputChannel; requestTimeoutMs?: number }) {
    this.outputChannel = options?.outputChannel ?? vscode.window.createOutputChannel('Kiro ACP');
    this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Starts the ACP process and performs the initialize handshake.
   * ACP プロセスを起動し、initialize ハンドシェイクを実行します。
   *
   * @returns Initialize result returned by the ACP agent.
   *          ACP エージェントから返される initialize 結果。
   */
  public async start(): Promise<InitializeResult> {
    if (this.process) {
      throw new Error('ACP client is already started.');
    }

    this.stopping = false;
    this.restartCount = 0;
    this.cliPath = await this.resolveCliPath();
    this.spawnProcess();

    return this.sendRequest<InitializeResult>('initialize', createInitializeParams());
  }

  /**
   * Stops the ACP process gracefully, then force-kills on timeout.
   * ACP プロセスを正常停止し、タイムアウト時は強制終了します。
   *
   * @returns A promise that resolves when the process is fully stopped.
   *          プロセス停止完了時に resolve される Promise。
   */
  public async stop(): Promise<void> {
    this.stopping = true;
    this.rejectAllPendingRequests(new Error('ACP client stopped.'));

    const proc = this.process;
    if (!proc) {
      return;
    }

    await new Promise<void>((resolve) => {
      const onExit = () => {
        this.process = undefined;
        resolve();
      };

      proc.once('exit', onExit);
      proc.kill('SIGTERM');

      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, PROCESS_SHUTDOWN_GRACE_MS);
    });
  }

  /**
   * Creates a new ACP session for the given working directory.
   * 指定された作業ディレクトリで新しい ACP セッションを作成します。
   *
   * @param cwd - Working directory path used for the new session.
   *              新規セッションで使用する作業ディレクトリのパス。
   * @returns Session creation result containing the session ID.
   *          セッション ID を含む作成結果。
   */
  public async newSession(cwd: string): Promise<SessionNewResult> {
    const params: SessionNewParams = { cwd, mcpServers: [] };
    return this.sendRequest<SessionNewResult>('session/new', params);
  }

  /**
   * Sends a prompt to an existing ACP session.
   * 既存の ACP セッションへプロンプトを送信します。
   *
   * @param sessionId - Target ACP session ID.
   *                    送信先の ACP セッション ID。
   * @param content - Prompt content blocks to submit.
   *                  送信するプロンプトコンテンツ。
   * @returns A promise that resolves when the prompt request is accepted.
   *          プロンプト要求が受理された時点で resolve される Promise。
   */
  public async prompt(sessionId: string, content: PromptContent[]): Promise<void> {
    const params: SessionPromptParams = { sessionId, prompt: content };
    await this.sendRequest('session/prompt', params);
  }

  /**
   * Sends a cancellation notification for the current session turn.
   * 現在のセッションターンに対するキャンセル通知を送信します。
   *
   * @param sessionId - Target ACP session ID to cancel.
   *                    キャンセル対象の ACP セッション ID。
   */
  public cancel(sessionId: string): void {
    const params: SessionCancelParams = { sessionId };
    this.sendNotification('session/cancel', params);
  }

  /**
   * Subscribes to `session/update` notifications.
   * `session/update` 通知を購読します。
   *
   * @param callback - Callback invoked for each update payload.
   *                   更新ペイロード受信時に呼び出されるコールバック。
   * @returns Disposable subscription handle.
   *          購読解除に使う Disposable ハンドル。
   */
  public onUpdate(callback: (params: SessionUpdateParams) => void): vscode.Disposable {
    return this.updateEmitter.event(callback);
  }

  /**
   * Registers a handler for Agent→Client JSON-RPC requests.
   * Agent→Client JSON-RPC リクエスト用のハンドラを登録します。
   *
   * @param method - JSON-RPC method name.
   *                 JSON-RPC のメソッド名。
   * @param handler - Handler function to execute when the method is received.
   *                  メソッド受信時に実行するハンドラ関数。
   */
  public registerHandler(method: string, handler: RequestHandler): void {
    this.handlers.set(method, handler);
  }

  private async resolveCliPath(): Promise<string> {
    const configCliPath = vscode.workspace.getConfiguration('kiro-acp').get<string>('cliPath')?.trim();

    const whichResult = spawnSync('which', ['kiro-cli'], { encoding: 'utf8' });
    const pathFromWhich = whichResult.status === 0 ? whichResult.stdout.trim() : '';

    const candidates = createCliPathCandidates(configCliPath, pathFromWhich, homedir());
    for (const candidate of candidates) {
      try {
        await this.assertExecutable(candidate);
        return candidate;
      } catch {
        // Continue scanning candidates.
      }
    }

    const message = createCliNotFoundMessage();
    this.outputChannel.appendLine(message);
    void vscode.window.showErrorMessage(message);
    throw new Error(message);
  }

  private async assertExecutable(path: string): Promise<void> {
    await access(path, fsConstants.X_OK);
  }

  private spawnProcess(): void {
    if (!this.cliPath) {
      throw new Error('CLI path is not resolved.');
    }

    this.outputChannel.appendLine(`Starting ACP process: ${this.cliPath} acp`);
    this.process = spawn(this.cliPath, ['acp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.stdoutBuffer = '';

    this.process.stdout.on('data', (chunk: Buffer) => {
      this.handleStdoutData(chunk.toString('utf8'));
    });

    this.process.stderr.on('data', (chunk: Buffer) => {
      this.outputChannel.appendLine(`[kiro-cli] ${chunk.toString('utf8').trimEnd()}`);
    });

    this.process.once('error', (error) => {
      this.outputChannel.appendLine(`ACP process error: ${error.message}`);
    });

    this.process.once('exit', (code, signal) => {
      this.outputChannel.appendLine(`ACP process exited (code=${code}, signal=${signal}).`);
      this.process = undefined;

      if (this.stopping) {
        return;
      }

      this.rejectAllPendingRequests(new Error('ACP process exited unexpectedly.'));
      this.tryRestart();
    });
  }

  private tryRestart(): void {
    if (this.restartCount >= MAX_RESTARTS) {
      this.outputChannel.appendLine('ACP process restart limit reached.');
      return;
    }

    this.restartCount += 1;
    this.outputChannel.appendLine(`Restarting ACP process (${this.restartCount}/${MAX_RESTARTS})...`);

    try {
      this.spawnProcess();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Failed to restart ACP process: ${message}`);
    }
  }

  private handleStdoutData(data: string): void {
    const parsed = splitNdjsonBuffer(this.stdoutBuffer, data);
    this.stdoutBuffer = parsed.nextBuffer;

    for (const line of parsed.lines) {
      this.handleMessage(line);
    }
  }

  private handleMessage(rawLine: string): void {
    try {
      const classified = classifyJsonRpcMessage(JSON.parse(rawLine));

      if (classified.type === 'response') {
        this.handleResponse(classified.message);
        return;
      }

      if (classified.type === 'request') {
        void this.handleIncomingRequest(classified.message);
        return;
      }

      if (classified.type === 'notification') {
        this.handleIncomingNotification(classified.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Failed to parse ACP message: ${message}; line=${rawLine}`);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.outputChannel.appendLine(`Received response for unknown id=${response.id}`);
      return;
    }

    clearTimeout(pending.timeoutHandle);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(createRpcError(response.error));
      return;
    }

    pending.resolve(response.result);
  }

  private async handleIncomingRequest(request: JsonRpcRequest): Promise<void> {
    const handler = this.handlers.get(request.method);
    if (!handler) {
      await this.writeMessage(createMethodNotFoundResponse(request.id, request.method));
      return;
    }

    try {
      const result = await handler(request.params);
      await this.writeMessage({
        jsonrpc: JSON_RPC_VERSION,
        id: request.id,
        result,
      });
    } catch (error) {
      await this.writeMessage(createInternalHandlerErrorResponse(request.id, error));
    }
  }

  private handleIncomingNotification(notification: JsonRpcNotification): void {
    if (notification.method === 'session/update') {
      this.updateEmitter.fire(notification.params as SessionUpdateParams);
    }
  }

  /**
   * Sends a typed JSON-RPC request and resolves with the expected response shape.
   * 期待するレスポンス型を指定して JSON-RPC リクエストを送信します。
   *
   * @param method - JSON-RPC method name to call.
   *                 呼び出す JSON-RPC メソッド名。
   * @param params - Optional request parameters.
   *                 任意のリクエストパラメータ。
   * @returns A promise of the typed response result.
   *          指定したレスポンス型で解決される Promise。
   */
  private async sendRequest<TResponse>(method: string, params?: unknown): Promise<TResponse> {
    const id = this.nextId;
    this.nextId += 1;

    const request: JsonRpcRequest = {
      jsonrpc: JSON_RPC_VERSION,
      id,
      method,
      params,
    };

    return new Promise<TResponse>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(createRequestTimeoutError(method, id));
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        timeoutHandle,
      });

      this.writeMessage(request).catch((error) => {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  private sendNotification(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = {
      jsonrpc: JSON_RPC_VERSION,
      method,
      params,
    };

    void this.writeMessage(notification);
  }

  private async writeMessage(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): Promise<void> {
    if (!this.process) {
      throw new Error('ACP process is not running.');
    }

    const payload = `${JSON.stringify(message)}\n`;
    await new Promise<void>((resolve, reject) => {
      this.process?.stdin.write(payload, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private rejectAllPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

}
