import type { JsonRpcResponse } from '../types';

/**
 * Builds a JSON-RPC internal handler error response.
 * JSON-RPC の内部ハンドラエラーレスポンスを生成します。
 *
 * @param id - Request ID from the incoming call.
 *             受信リクエストの ID。
 * @param error - Runtime error thrown by handler.
 *                ハンドラ実行中に発生した実行時エラー。
 * @returns JSON-RPC error response payload.
 *          JSON-RPC エラーレスポンス。
 */
export function createInternalHandlerErrorResponse(id: number, error: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message: error instanceof Error ? error.message : 'Internal handler error',
    },
  };
}
