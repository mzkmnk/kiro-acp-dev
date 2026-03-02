import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AcpClient } from './client';

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn() }),
    showErrorMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: () => ({
      get: () => '',
    }),
  },
  EventEmitter: class<T> {
    private listeners: Array<(value: T) => void> = [];

    public readonly event = (callback: (value: T) => void) => {
      this.listeners.push(callback);
      return { dispose: () => undefined };
    };

    public fire(value: T): void {
      for (const listener of this.listeners) {
        listener(value);
      }
    }
  },
}));

type OutputChannelStub = {
  appendLine: ReturnType<typeof vi.fn>;
};

function createClient(requestTimeoutMs = 50): { client: AcpClient; output: OutputChannelStub } {
  const output: OutputChannelStub = {
    appendLine: vi.fn(),
  };

  const client = new AcpClient({
    outputChannel: output as never,
    requestTimeoutMs,
  });

  return { client, output };
}

describe('AcpClient sendRequest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 応答受信時に pending request を解決できること
  it('resolves a request when a successful response is received', async () => {
    const { client } = createClient();
    const writeMessage = vi.fn().mockResolvedValue(undefined);
    (client as unknown as { writeMessage: typeof writeMessage }).writeMessage = writeMessage;

    const requestPromise = (
      client as unknown as {
        sendRequest: <T>(method: string, params?: unknown) => Promise<T>;
      }
    ).sendRequest<{ ok: boolean }>('session/new', { cwd: '/tmp' });

    expect(writeMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 0,
      method: 'session/new',
      params: { cwd: '/tmp' },
    });

    (
      client as unknown as {
        handleResponse: (response: {
          jsonrpc: '2.0';
          id: number;
          result?: unknown;
          error?: { code: number; message: string };
        }) => void;
      }
    ).handleResponse({
      jsonrpc: '2.0',
      id: 0,
      result: { ok: true },
    });

    await expect(requestPromise).resolves.toEqual({ ok: true });
  });

  // エラーレスポンス受信時に request を reject すること
  it('rejects a request when an error response is received', async () => {
    const { client } = createClient();
    (client as unknown as { writeMessage: () => Promise<void> }).writeMessage = vi
      .fn()
      .mockResolvedValue(undefined);

    const requestPromise = (
      client as unknown as {
        sendRequest: <T>(method: string, params?: unknown) => Promise<T>;
      }
    ).sendRequest('session/prompt', { value: 1 });

    (
      client as unknown as {
        handleResponse: (response: {
          jsonrpc: '2.0';
          id: number;
          result?: unknown;
          error?: { code: number; message: string };
        }) => void;
      }
    ).handleResponse({
      jsonrpc: '2.0',
      id: 0,
      error: { code: -32001, message: 'failed' },
    });

    await expect(requestPromise).rejects.toThrow('[-32001] failed');
  });

  // 応答が来ない場合にタイムアウトエラーで reject すること
  it('rejects a request when timeout is reached', async () => {
    const { client } = createClient(10);
    (client as unknown as { writeMessage: () => Promise<void> }).writeMessage = vi
      .fn()
      .mockResolvedValue(undefined);

    const requestPromise = (
      client as unknown as {
        sendRequest: <T>(method: string, params?: unknown) => Promise<T>;
      }
    ).sendRequest('slow/method');

    const expectation = expect(requestPromise).rejects.toThrow(
      'Request timed out: slow/method (id=0)',
    );
    await vi.advanceTimersByTimeAsync(11);
    await expectation;
  });
});

describe('AcpClient handleMessage', () => {
  // response メッセージを handleResponse に振り分けること
  it('routes a response payload to handleResponse', () => {
    const { client } = createClient();
    const handleResponse = vi.fn();
    (client as unknown as { handleResponse: typeof handleResponse }).handleResponse =
      handleResponse;

    (client as unknown as { handleMessage: (rawLine: string) => void }).handleMessage(
      '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}',
    );

    expect(handleResponse).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 1,
      result: { ok: true },
    });
  });

  // 不正 JSON の場合はエラーログを出力すること
  it('logs parse errors for invalid JSON payloads', () => {
    const { client, output } = createClient();

    (client as unknown as { handleMessage: (rawLine: string) => void }).handleMessage(
      '{invalid json',
    );

    expect(output.appendLine).toHaveBeenCalledTimes(1);
    expect(output.appendLine.mock.calls[0]?.[0]).toContain('Failed to parse ACP message');
  });
});

describe('AcpClient handleIncomingRequest', () => {
  // 未登録メソッドに対して method not found を返すこと
  it('returns method-not-found response when no handler is registered', async () => {
    const { client } = createClient();
    const writeMessage = vi.fn().mockResolvedValue(undefined);
    (client as unknown as { writeMessage: typeof writeMessage }).writeMessage = writeMessage;

    await (
      client as unknown as {
        handleIncomingRequest: (request: {
          jsonrpc: '2.0';
          id: number;
          method: string;
          params?: unknown;
        }) => Promise<void>;
      }
    ).handleIncomingRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'unknown/method',
    });

    expect(writeMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 3,
      error: {
        code: -32601,
        message: 'Method not found: unknown/method',
      },
    });
  });

  // 登録ハンドラの戻り値を result として返すこと
  it('returns handler result when a handler is registered', async () => {
    const { client } = createClient();
    const writeMessage = vi.fn().mockResolvedValue(undefined);
    (client as unknown as { writeMessage: typeof writeMessage }).writeMessage = writeMessage;

    client.registerHandler('echo', (params) => ({ echoed: params }));

    await (
      client as unknown as {
        handleIncomingRequest: (request: {
          jsonrpc: '2.0';
          id: number;
          method: string;
          params?: unknown;
        }) => Promise<void>;
      }
    ).handleIncomingRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'echo',
      params: { value: 42 },
    });

    expect(writeMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 7,
      result: { echoed: { value: 42 } },
    });
  });

  // ハンドラ例外時に internal handler error を返すこと
  it('returns internal-handler-error response when handler throws', async () => {
    const { client } = createClient();
    const writeMessage = vi.fn().mockResolvedValue(undefined);
    (client as unknown as { writeMessage: typeof writeMessage }).writeMessage = writeMessage;

    client.registerHandler('explode', () => {
      throw new Error('boom');
    });

    await (
      client as unknown as {
        handleIncomingRequest: (request: {
          jsonrpc: '2.0';
          id: number;
          method: string;
          params?: unknown;
        }) => Promise<void>;
      }
    ).handleIncomingRequest({
      jsonrpc: '2.0',
      id: 8,
      method: 'explode',
    });

    expect(writeMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 8,
      error: {
        code: -32000,
        message: 'boom',
      },
    });
  });
});

describe('AcpClient process lifecycle', () => {
  // stop 呼び出し時に pending request を全 reject しプロセス参照を解放すること
  it('rejects all pending requests and clears process on stop', async () => {
    const { client } = createClient();
    const reject = vi.fn();
    const timeoutHandle = setTimeout(() => undefined, 1_000);
    (
      client as unknown as {
        pendingRequests: Map<
          number,
          {
            resolve: (value: unknown) => void;
            reject: (reason?: unknown) => void;
            timeoutHandle: NodeJS.Timeout;
          }
        >;
      }
    ).pendingRequests.set(1, {
      resolve: vi.fn(),
      reject,
      timeoutHandle,
    });

    const exitHandlers: Array<() => void> = [];
    const processMock = {
      killed: false,
      once: (event: string, callback: () => void) => {
        if (event === 'exit') {
          exitHandlers.push(callback);
        }
      },
      kill: (signal: string) => {
        processMock.killed = true;
        if (signal === 'SIGTERM') {
          for (const exitHandler of exitHandlers) {
            exitHandler();
          }
        }
      },
    };

    (client as unknown as { process: typeof processMock }).process = processMock;

    await client.stop();

    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((client as unknown as { process?: unknown }).process).toBeUndefined();
  });

  // 再起動上限未満では spawnProcess を呼び上限到達時は呼ばないこと
  it('restarts below limit and stops restarting at max limit', () => {
    const { client, output } = createClient();
    const spawnProcess = vi.fn();
    (client as unknown as { spawnProcess: typeof spawnProcess }).spawnProcess = spawnProcess;

    (client as unknown as { tryRestart: () => void }).tryRestart();
    expect(spawnProcess).toHaveBeenCalledTimes(1);

    (client as unknown as { restartCount: number }).restartCount = 3;
    (client as unknown as { tryRestart: () => void }).tryRestart();

    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(output.appendLine).toHaveBeenCalledWith('ACP process restart limit reached.');
  });
});
