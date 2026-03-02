import type { JsonRpcResponse } from '../types';

/**
 * Builds a JSON-RPC "method not found" error response.
 * JSON-RPC の「メソッド未定義」エラーレスポンスを生成します。
 *
 * @param id - Request ID from the incoming call.
 *             受信リクエストの ID。
 * @param method - Missing method name.
 *                 未登録のメソッド名。
 * @returns JSON-RPC error response payload.
 *          JSON-RPC エラーレスポンス。
 */
export function createMethodNotFoundResponse(id: number, method: string): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  };
}
