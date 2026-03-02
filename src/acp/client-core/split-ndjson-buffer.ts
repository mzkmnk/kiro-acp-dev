/**
 * Splits an NDJSON stream into complete lines and residual buffer.
 * NDJSON ストリームを「完全行」と「残バッファ」に分割します。
 *
 * @param buffer - Existing incomplete buffer.
 *                 既存の未完了バッファ。
 * @param incoming - Newly received chunk.
 *                   新規受信チャンク。
 * @returns Complete lines and next residual buffer.
 *          完全行配列と次回用の残バッファ。
 */
export function splitNdjsonBuffer(
  buffer: string,
  incoming: string,
): { lines: string[]; nextBuffer: string } {
  const next = `${buffer}${incoming}`;
  const parts = next.split('\n');
  const nextBuffer = parts.pop() ?? '';
  const lines = parts.map((line) => line.trim()).filter((line) => line.length > 0);

  return { lines, nextBuffer };
}
