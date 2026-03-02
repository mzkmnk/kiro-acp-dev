import type { ChatItem, ChatState, ExtensionToWebviewMessage, QueuedPrompt } from './types';
import { getVsCodeApi } from './vscode-api';

/**
 * Manages ACP chat state and VS Code postMessage bridge independent from UI rendering.
 * UI描画から独立して、ACPチャット状態とVS Code postMessage ブリッジを管理します。
 */
export class ChatController {
  private readonly vscode = getVsCodeApi();
  private readonly listeners = new Set<() => void>();
  private readonly onWindowMessage: (event: MessageEvent<ExtensionToWebviewMessage>) => void;

  private state: ChatState = {
    items: [],
    queue: [],
    statusText: 'Connecting...',
    streaming: false,
  };

  private activeAgentMessageId?: string;
  private inFlightTurns = 0;
  private pendingAgentChunk = '';
  private agentChunkRafId?: number;

  constructor() {
    this.onWindowMessage = (event) => {
      this.handleExtensionMessage(event.data);
    };

    window.addEventListener('message', this.onWindowMessage);
  }

  /**
   * Returns current immutable chat state snapshot.
   * 現在の不変チャット状態スナップショットを返します。
   *
   * @returns Current chat state.
   *          現在のチャット状態。
   */
  public getState(): ChatState {
    return this.state;
  }

  /**
   * Subscribes to state updates and returns an unsubscribe callback.
   * 状態更新を購読し、購読解除コールバックを返します。
   *
   * @param listener - Callback invoked on every state update.
   *                   状態更新のたびに呼び出すコールバック。
   * @returns Unsubscribe function.
   *          購読解除関数。
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Sends a user prompt and appends it to local timeline.
   * ユーザープロンプトを送信し、ローカルのタイムラインに追記します。
   *
   * @param text - Prompt text.
   *               送信するプロンプト文字列。
   */
  public sendPrompt(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    if (this.inFlightTurns > 0) {
      this.enqueuePrompt(trimmed);
      return;
    }

    this.dispatchPrompt(trimmed);
  }

  /**
   * Requests cancellation of the current turn.
   * 現在のターンのキャンセルを要求します。
   */
  public cancel(): void {
    this.vscode.postMessage({ type: 'cancel' });
  }

  /**
   * Starts a new session and clears current chat timeline.
   * 新しいセッションを開始し、現在のチャットタイムラインをクリアします。
   */
  public newSession(): void {
    this.vscode.postMessage({ type: 'newSession' });
    this.activeAgentMessageId = undefined;
    this.inFlightTurns = 0;
    this.setState({ items: [], queue: [], streaming: false });
  }

  /**
   * Sends the permission decision for the currently shown request.
   * 表示中の権限リクエストに対する決定を送信します。
   *
   * @param requestId - Permission request identifier.
   *                    権限リクエストの識別子。
   * @param optionId - Selected permission option ID.
   *                   選択した権限オプション ID。
   */
  public respondPermission(requestId: number, optionId: string): void {
    const target = this.state.items.find(
      (item) => item.role === 'permission' && item.permissionRequestId === requestId && !item.resolved,
    );
    if (!target) {
      return;
    }

    this.vscode.postMessage({ type: 'permissionResponse', id: requestId, optionId });
    this.setState({
      items: this.state.items.map((item) =>
        item.id === target.id ? { ...item, resolved: true, text: `${item.text}\nSelected: ${optionId}` } : item,
      ),
    });
  }

  /**
   * Removes a queued prompt without sending it.
   * キュー済みプロンプトを送信せずに削除します。
   *
   * @param queuedPromptId - Queue item identifier.
   *                         キュー項目の識別子。
   */
  public removeQueuedPrompt(queuedPromptId: string): void {
    const nextQueue = this.state.queue.filter((item) => item.id !== queuedPromptId);
    this.setState({ queue: nextQueue });
  }

  /**
   * Prioritizes one queued prompt and sends it as soon as possible.
   * キュー項目を優先し、可能な限り早く送信します。
   *
   * @param queuedPromptId - Queue item identifier to prioritize.
   *                         優先送信したいキュー項目の識別子。
   */
  public sendQueuedPromptNow(queuedPromptId: string): void {
    const target = this.state.queue.find((item) => item.id === queuedPromptId);
    if (!target) {
      return;
    }

    const rest = this.state.queue.filter((item) => item.id !== queuedPromptId);
    if (this.inFlightTurns === 0) {
      this.setState({ queue: rest });
      this.dispatchPrompt(target.text);
      return;
    }

    this.setState({ queue: [target, ...rest] });
    this.vscode.postMessage({ type: 'cancel' });
  }

  /**
   * Cleans up bridge event handlers and subscriptions.
   * ブリッジイベントハンドラと購読をクリーンアップします。
   */
  public dispose(): void {
    this.flushPendingAgentChunk();
    if (this.agentChunkRafId !== undefined) {
      cancelAnimationFrame(this.agentChunkRafId);
      this.agentChunkRafId = undefined;
    }
    window.removeEventListener('message', this.onWindowMessage);
    this.listeners.clear();
  }

  private handleExtensionMessage(message: ExtensionToWebviewMessage): void {
    switch (message.type) {
      case 'ready':
        this.setState({ statusText: `${message.agentInfo.name} ${message.agentInfo.version}` });
        return;
      case 'agentMessageChunk':
        this.queueAgentChunk(message.text);
        return;
      case 'toolCall':
        this.upsertToolCall(message.toolCallId, message.name, message.status, message.content);
        return;
      case 'toolCallUpdate':
        this.upsertToolCall(message.toolCallId, message.name, message.status, message.content);
        return;
      case 'requestPermission':
        this.pushItem({
          id: this.createId(),
          role: 'permission',
          text: message.params,
          toolName: message.toolName,
          permissionRequestId: message.id,
          permissionOptions: message.options,
          resolved: false,
        });
        return;
      case 'turnEnd':
        this.flushPendingAgentChunk();
        this.activeAgentMessageId = undefined;
        this.inFlightTurns = Math.max(0, this.inFlightTurns - 1);
        this.flushQueueIfIdle();
        this.setState({ streaming: this.inFlightTurns > 0 });
        return;
      case 'error':
        this.flushPendingAgentChunk();
        this.activeAgentMessageId = undefined;
        this.inFlightTurns = Math.max(0, this.inFlightTurns - 1);
        this.pushItem({ id: this.createId(), role: 'error', text: message.message });
        this.flushQueueIfIdle();
        this.setState({ streaming: this.inFlightTurns > 0 });
        return;
    }
  }

  private queueAgentChunk(chunk: string): void {
    this.pendingAgentChunk += chunk;
    if (this.agentChunkRafId !== undefined) {
      return;
    }

    this.agentChunkRafId = requestAnimationFrame(() => {
      this.agentChunkRafId = undefined;
      this.flushPendingAgentChunk();
    });
  }

  private flushPendingAgentChunk(): void {
    if (!this.pendingAgentChunk) {
      return;
    }

    const chunk = this.pendingAgentChunk;
    this.pendingAgentChunk = '';
    this.setState({ streaming: true });

    if (!this.activeAgentMessageId) {
      const id = this.createId();
      this.activeAgentMessageId = id;
      this.pushItem({ id, role: 'agent', text: chunk });
      return;
    }

    const nextItems = this.state.items.map((item) => {
      if (item.id !== this.activeAgentMessageId) {
        return item;
      }
      return { ...item, text: `${item.text}${chunk}` };
    });

    this.setState({ items: nextItems });
  }

  private pushItem(item: ChatItem): void {
    this.setState({ items: [...this.state.items, item] });
  }

  private enqueuePrompt(text: string): void {
    const next: QueuedPrompt = {
      id: this.createId(),
      text,
    };
    this.setState({ queue: [...this.state.queue, next] });
  }

  private dispatchPrompt(text: string): void {
    this.pushItem({ id: this.createId(), role: 'user', text });
    this.inFlightTurns += 1;
    this.setState({ streaming: true });
    this.vscode.postMessage({ type: 'prompt', text });
  }

  private upsertToolCall(toolCallId: string, name: string, status: string, content: string): void {
    const normalizedStatus = status === 'in_progress' ? 'running' : status;
    const existingIndex = this.state.items.findIndex(
      (item) => item.role === 'tool' && item.toolCallId === toolCallId,
    );

    if (existingIndex < 0) {
      this.pushItem({
        id: this.createId(),
        role: 'tool',
        text: content,
        toolCallId,
        toolStatus: normalizedStatus,
        toolName: name,
      });
      return;
    }

    const nextItems = [...this.state.items];
    const existing = nextItems[existingIndex];
    nextItems[existingIndex] = {
      ...existing,
      text: content || existing.text,
      toolName: name || existing.toolName,
      toolStatus: normalizedStatus || existing.toolStatus,
    };
    this.setState({ items: nextItems });
  }

  private flushQueueIfIdle(): void {
    if (this.inFlightTurns > 0 || this.state.queue.length === 0) {
      return;
    }

    const [next, ...rest] = this.state.queue;
    this.setState({ queue: rest });
    this.dispatchPrompt(next.text);
  }

  private setState(patch: Partial<ChatState>): void {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private createId(): string {
    return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
