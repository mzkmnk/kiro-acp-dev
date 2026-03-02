import type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from '../types';

export type MessageKind =
  | { type: 'response'; message: JsonRpcResponse }
  | { type: 'request'; message: JsonRpcRequest }
  | { type: 'notification'; message: JsonRpcNotification }
  | { type: 'unknown' };

/**
 * Classifies a parsed JSON-RPC payload by protocol role.
 * パース済み JSON-RPC ペイロードをプロトコル上の役割で分類します。
 *
 * @param message - Parsed JSON value.
 *                  パース済み JSON 値。
 * @returns Classified message kind.
 *          分類済みメッセージ種別。
 */
export function classifyJsonRpcMessage(message: unknown): MessageKind {
  if (!message || typeof message !== 'object') {
    return { type: 'unknown' };
  }

  const typed = message as Record<string, unknown>;

  if ('id' in typed && ('result' in typed || 'error' in typed) && !('method' in typed)) {
    return { type: 'response', message: typed as unknown as JsonRpcResponse };
  }

  if ('id' in typed && 'method' in typed) {
    return { type: 'request', message: typed as unknown as JsonRpcRequest };
  }

  if (!('id' in typed) && 'method' in typed) {
    return { type: 'notification', message: typed as unknown as JsonRpcNotification };
  }

  return { type: 'unknown' };
}
