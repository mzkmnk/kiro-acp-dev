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
      options: ConfigOptionState[];
    };

export type ChatRole = 'user' | 'agent' | 'system' | 'error' | 'tool' | 'permission';

export interface ConfigOptionState {
  id: string;
  name: string;
  category?: string;
  currentValue: string;
  values: Array<{ value: string; name: string }>;
}

export interface ChatItem {
  id: string;
  role: ChatRole;
  text: string;
  toolCallId?: string;
  toolStatus?: string;
  toolName?: string;
  toolTitle?: string;
  permissionRequestId?: number;
  permissionOptions?: Array<{ optionId: string; label: string }>;
  resolved?: boolean;
  resolvedOptionId?: string;
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
  configOptions: ConfigOptionState[];
}
