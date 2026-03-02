import { describe, expect, it } from 'vitest';

import { splitNdjsonBuffer } from './split-ndjson-buffer';

describe('splitNdjsonBuffer', () => {
  // 完全な行を抽出し、末尾の不完全なデータをバッファに残すこと
  it('extracts complete lines and keeps trailing partial data as buffer', () => {
    const result = splitNdjsonBuffer('', '{"a":1}\n{"b":2');

    expect(result.lines).toEqual(['{"a":1}']);
    expect(result.nextBuffer).toBe('{"b":2');
  });

  // 既存バッファと新規チャンクを結合して複数行を復元できること
  it('joins existing buffer with incoming chunk and emits multiple lines', () => {
    const result = splitNdjsonBuffer('{"a":', '1}\n{"b":2}\n');

    expect(result.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(result.nextBuffer).toBe('');
  });

  // 空行や空白行を除外し、行末空白をトリムすること
  it('trims each line and drops blank lines', () => {
    const result = splitNdjsonBuffer('', '  {"a":1}  \n\n   \n{"b":2}\n');

    expect(result.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(result.nextBuffer).toBe('');
  });
});
