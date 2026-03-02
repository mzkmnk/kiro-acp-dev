/**
 * Creates a timeout error for a JSON-RPC request.
 * JSON-RPC リクエストのタイムアウトエラーを生成します。
 *
 * @param method - JSON-RPC method name.
 *                 JSON-RPC メソッド名。
 * @param id - Request ID.
 *             リクエスト ID。
 * @returns Timeout error instance.
 *          タイムアウトエラーのインスタンス。
 */
export function createRequestTimeoutError(method: string, id: number): Error {
  return new Error(`Request timed out: ${method} (id=${id})`);
}
