export type WebviewToExtensionMessage =
  | { type: 'prompt'; text: string }
  | { type: 'cancel' }
  | { type: 'newSession' };

export type ExtensionToWebviewMessage =
  | { type: 'agentMessageChunk'; text: string }
  | { type: 'toolCall'; name: string; status: string }
  | { type: 'toolCallUpdate'; name: string; content: string }
  | { type: 'turnEnd' }
  | { type: 'error'; message: string }
  | { type: 'ready'; agentInfo: { name: string; version: string } };

export type ChatRole = 'user' | 'agent' | 'system' | 'error';

export interface ChatItem {
  id: string;
  role: ChatRole;
  text: string;
}

export interface QueuedPrompt {
  id: string;
  text: string;
}

export interface ChatState {
  items: ChatItem[];
  queue: QueuedPrompt[];
  statusText: string;
  streaming: boolean;
}
