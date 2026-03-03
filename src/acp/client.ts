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
  KiroClearStatusParams,
  KiroCompactionStatusParams,
  PromptContent,
  SessionCancelParams,
  SessionLoadParams,
  SessionNewParams,
  SessionNewResultWithConfig,
  SessionPromptParams,
  SessionSetConfigOptionParams,
  SessionSetConfigOptionResult,
  SessionSetModelParams,
  SessionSetModeParams,
  SessionTerminateParams,
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
  timeoutHandle?: NodeJS.Timeout;
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
/** Maximum number of characters per RPC trace log line. / RPC トレース1行あたりの最大文字数。 */
const MAX_RPC_TRACE_CHARS = 3_000;

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
  /** Whether stdin/stdout JSON-RPC traffic tracing is enabled. / JSON-RPC 通信トレースの有効フラグ。 */
  private readonly traceRpc: boolean;
  /** Map of unresolved requests keyed by request ID. / 未解決リクエストを ID で管理するマップ。 */
  private readonly pendingRequests = new Map<number, PendingRequest>();
  /** Registry for Agent→Client request handlers. / Agent→Client リクエストハンドラの登録表。 */
  private readonly handlers = new Map<string, RequestHandler>();
  /** Emitter for `session/update` notifications. / `session/update` 通知のイベントエミッタ。 */
  private readonly updateEmitter = new vscode.EventEmitter<SessionUpdateParams>();
  /** Emitter for `_kiro.dev/compaction/status` notifications. / `_kiro.dev/compaction/status` 通知のイベントエミッタ。 */
  private readonly compactionStatusEmitter = new vscode.EventEmitter<KiroCompactionStatusParams>();
  /** Emitter for `_kiro.dev/clear/status` notifications. / `_kiro.dev/clear/status` 通知のイベントエミッタ。 */
  private readonly clearStatusEmitter = new vscode.EventEmitter<KiroClearStatusParams>();
  /** Emitter for `_session/terminate` notifications. / `_session/terminate` 通知のイベントエミッタ。 */
  private readonly terminateEmitter = new vscode.EventEmitter<SessionTerminateParams>();

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
  constructor(options?: {
    outputChannel?: vscode.OutputChannel;
    requestTimeoutMs?: number;
    traceRpc?: boolean;
  }) {
    this.outputChannel = options?.outputChannel ?? vscode.window.createOutputChannel('Kiro ACP');
    this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.traceRpc =
      options?.traceRpc ??
      vscode.workspace.getConfiguration('kiro-acp').get<boolean>('traceRpc', false);
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
  public async newSession(cwd: string): Promise<SessionNewResultWithConfig> {
    const params: SessionNewParams = { cwd, mcpServers: [] };
    return this.sendRequest<SessionNewResultWithConfig>('session/new', params);
  }

  /**
   * Loads an existing ACP session by ID.
   * 既存の ACP セッションを ID で読み込みます。
   *
   * @param sessionId - Session ID to load.
   *                    読み込むセッション ID。
   * @param cwd - Working directory path.
   *              作業ディレクトリのパス。
   * @returns Session result containing the session ID.
   *          セッション ID を含む結果。
   */
  public async loadSession(sessionId: string, cwd: string): Promise<SessionNewResultWithConfig> {
    const params: SessionLoadParams = { sessionId, cwd, mcpServers: [] };
    return this.sendRequest<SessionNewResultWithConfig>('session/load', params);
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
   * Changes a session config option (e.g. model, mode).
   * セッションの設定オプション（モデル、モードなど）を変更します。
   *
   * @param sessionId - Target ACP session ID.
   *                    対象の ACP セッション ID。
   * @param configId - Config option identifier.
   *                   設定オプションの識別子。
   * @param value - New value for the config option.
   *               設定オプションの新しい値。
   * @returns Updated config options.
   *          更新後の設定オプション一覧。
   */
  public async setConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<SessionSetConfigOptionResult> {
    const params: SessionSetConfigOptionParams = { sessionId, configId, value };
    return this.sendRequest<SessionSetConfigOptionResult>('session/set_config_option', params);
  }

  /**
   * Changes the model for a session (legacy API).
   * セッションのモデルを変更します（レガシー API）。
   *
   * @param sessionId - Target ACP session ID.
   *                    対象の ACP セッション ID。
   * @param modelId - New model identifier.
   *                  新しいモデルの識別子。
   */
  public async setModel(sessionId: string, modelId: string): Promise<void> {
    const params: SessionSetModelParams = { sessionId, modelId };
    await this.sendRequest('session/set_model', params);
  }

  /**
   * Changes the mode for a session (legacy API).
   * セッションのモードを変更します（レガシー API）。
   *
   * @param sessionId - Target ACP session ID.
   *                    対象の ACP セッション ID。
   * @param modeId - New mode identifier.
   *                 新しいモードの識別子。
   */
  public async setMode(sessionId: string, modeId: string): Promise<void> {
    const params: SessionSetModeParams = { sessionId, modeId };
    await this.sendRequest('session/set_mode', params);
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
   * Subscribes to `_kiro.dev/compaction/status` notifications.
   * `_kiro.dev/compaction/status` 通知を購読します。
   *
   * @param callback - Callback invoked for each compaction status update.
   *                   コンパクション状態更新時に呼び出されるコールバック。
   * @returns Disposable subscription handle.
   *          購読解除に使う Disposable ハンドル。
   */
  public onCompactionStatus(
    callback: (params: KiroCompactionStatusParams) => void,
  ): vscode.Disposable {
    return this.compactionStatusEmitter.event(callback);
  }

  /**
   * Subscribes to `_kiro.dev/clear/status` notifications.
   * `_kiro.dev/clear/status` 通知を購読します。
   *
   * @param callback - Callback invoked for each clear status update.
   *                   クリア状態更新時に呼び出されるコールバック。
   * @returns Disposable subscription handle.
   *          購読解除に使う Disposable ハンドル。
   */
  public onClearStatus(callback: (params: KiroClearStatusParams) => void): vscode.Disposable {
    return this.clearStatusEmitter.event(callback);
  }

  /**
   * Subscribes to `_session/terminate` notifications.
   * `_session/terminate` 通知を購読します。
   *
   * @param callback - Callback invoked when a session is terminated.
   *                   セッション終了時に呼び出されるコールバック。
   * @returns Disposable subscription handle.
   *          購読解除に使う Disposable ハンドル。
   */
  public onTerminate(callback: (params: SessionTerminateParams) => void): vscode.Disposable {
    return this.terminateEmitter.event(callback);
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

  /**
   * Resolves the executable path for `kiro-cli` from config and common locations.
   * 設定値と一般的な配置候補から `kiro-cli` の実行可能パスを解決します。
   *
   * @returns Resolved absolute path to an executable `kiro-cli`.
   *          実行可能な `kiro-cli` の解決済み絶対パス。
   */
  private async resolveCliPath(): Promise<string> {
    const configCliPath = vscode.workspace
      .getConfiguration('kiro-acp')
      .get<string>('cliPath')
      ?.trim();

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

  /**
   * Verifies that the given path exists and is executable.
   * 指定パスが存在し、実行可能であることを検証します。
   *
   * @param path - File system path to validate.
   *               検証対象のファイルシステムパス。
   */
  private async assertExecutable(path: string): Promise<void> {
    await access(path, fsConstants.X_OK);
  }

  /**
   * Spawns the ACP child process and wires process event handlers.
   * ACP 子プロセスを起動し、各種プロセスイベントハンドラを設定します。
   */
  private spawnProcess(): void {
    if (!this.cliPath) {
      throw new Error('CLI path is not resolved.');
    }

    this.outputChannel.appendLine(`Starting ACP process: ${this.cliPath} acp`);
    // TODO: Allow users to configure the agent name (e.g., via settings).
    this.process = spawn(this.cliPath, ['acp', '--agent', 'kiro_default'], {
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

  /**
   * Attempts to restart the ACP process within the configured retry limit.
   * 設定された再試行上限内で ACP プロセスの再起動を試みます。
   */
  private tryRestart(): void {
    if (this.restartCount >= MAX_RESTARTS) {
      this.outputChannel.appendLine('ACP process restart limit reached.');
      return;
    }

    this.restartCount += 1;
    this.outputChannel.appendLine(
      `Restarting ACP process (${this.restartCount}/${MAX_RESTARTS})...`,
    );

    try {
      this.spawnProcess();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Failed to restart ACP process: ${message}`);
    }
  }

  /**
   * Appends stdout data to the NDJSON buffer and dispatches complete lines.
   * stdout データを NDJSON バッファへ連結し、完成した行をディスパッチします。
   *
   * @param data - UTF-8 decoded stdout chunk.
   *               UTF-8 デコード済みの stdout チャンク。
   */
  private handleStdoutData(data: string): void {
    const parsed = splitNdjsonBuffer(this.stdoutBuffer, data);
    this.stdoutBuffer = parsed.nextBuffer;

    for (const line of parsed.lines) {
      this.handleMessage(line);
    }
  }

  /**
   * Parses and routes a single JSON-RPC message line from the ACP process.
   * ACP プロセスから受信した 1 行の JSON-RPC メッセージを解析して振り分けます。
   *
   * @param rawLine - Raw NDJSON line payload.
   *                  生の NDJSON 1 行ペイロード。
   */
  private handleMessage(rawLine: string): void {
    try {
      this.logRpcTraffic('IN', rawLine);
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

  /**
   * Matches a JSON-RPC response to its pending request and settles its promise.
   * JSON-RPC レスポンスを対応する保留中リクエストに関連付け、Promise を確定します。
   *
   * @param response - JSON-RPC response payload.
   *                   JSON-RPC レスポンスのペイロード。
   */
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

  /**
   * Executes a registered handler for an incoming Agent→Client request.
   * 受信した Agent→Client リクエストに対して登録済みハンドラを実行します。
   *
   * @param request - Incoming JSON-RPC request object.
   *                  受信した JSON-RPC リクエストオブジェクト。
   */
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

  /**
   * Processes incoming JSON-RPC notifications handled by the client.
   * クライアントが処理対象とする JSON-RPC 通知を処理します。
   *
   * @param notification - Incoming notification payload.
   *                       受信した通知ペイロード。
   */
  private handleIncomingNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case 'session/update':
        this.updateEmitter.fire(notification.params as SessionUpdateParams);
        return;
      case '_kiro.dev/compaction/status':
        this.compactionStatusEmitter.fire(notification.params as KiroCompactionStatusParams);
        return;
      case '_kiro.dev/clear/status':
        this.clearStatusEmitter.fire(notification.params as KiroClearStatusParams);
        return;
      case '_session/terminate':
        this.terminateEmitter.fire(notification.params as SessionTerminateParams);
        return;
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

    const noTimeout = method === 'session/prompt';

    return new Promise<TResponse>((resolve, reject) => {
      const timeoutHandle = noTimeout
        ? undefined
        : setTimeout(() => {
            this.pendingRequests.delete(id);
            reject(createRequestTimeoutError(method, id));
          }, this.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        timeoutHandle,
      });

      this.writeMessage(request).catch((error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  /**
   * Sends a fire-and-forget JSON-RPC notification.
   * 応答を待たない JSON-RPC 通知を送信します。
   *
   * @param method - JSON-RPC method name.
   *                 JSON-RPC のメソッド名。
   * @param params - Optional notification parameters.
   *                 任意の通知パラメータ。
   */
  private sendNotification(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = {
      jsonrpc: JSON_RPC_VERSION,
      method,
      params,
    };

    void this.writeMessage(notification);
  }

  /**
   * Serializes and writes a JSON-RPC message to ACP process stdin.
   * JSON-RPC メッセージをシリアライズして ACP プロセスの stdin に書き込みます。
   *
   * @param message - JSON-RPC payload to send.
   *                  送信する JSON-RPC ペイロード。
   * @returns A promise that resolves after the write callback succeeds.
   *          書き込みコールバック成功後に resolve される Promise。
   */
  private async writeMessage(
    message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification,
  ): Promise<void> {
    if (!this.process) {
      throw new Error('ACP process is not running.');
    }

    const payload = `${JSON.stringify(message)}\n`;
    this.logRpcTraffic('OUT', payload);
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

  /**
   * Rejects and clears all in-flight requests with the provided error.
   * 指定したエラーで未完了リクエストをすべて reject し、管理状態をクリアします。
   *
   * @param error - Error to propagate to pending request promises.
   *                保留中リクエストの Promise に伝播させるエラー。
   */
  private rejectAllPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  private logRpcTraffic(direction: 'IN' | 'OUT', payload: string): void {
    if (!this.traceRpc) {
      return;
    }

    const trimmed = payload.trimEnd();
    const preview =
      trimmed.length > MAX_RPC_TRACE_CHARS
        ? `${trimmed.slice(0, MAX_RPC_TRACE_CHARS)}... [truncated ${trimmed.length - MAX_RPC_TRACE_CHARS} chars]`
        : trimmed;
    this.outputChannel.appendLine(`[ACP ${direction}] ${preview}`);
  }
}
