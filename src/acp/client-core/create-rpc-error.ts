import type { JsonRpcError } from '../types';

/**
 * Converts JSON-RPC error payload to a native Error object.
 * JSON-RPC のエラーペイロードをネイティブ Error オブジェクトへ変換します。
 *
 * @param error - JSON-RPC error payload.
 *                JSON-RPC のエラーペイロード。
 * @returns Error with code/message and optional `data` attached.
 *          code/message と任意の `data` を持つ Error。
 */
export function createRpcError(error: JsonRpcError): Error {
  const rpcError = new Error(`[${error.code}] ${error.message}`);
  (rpcError as Error & { data?: unknown }).data = error.data;
  return rpcError;
}
