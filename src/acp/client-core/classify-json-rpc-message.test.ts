import { describe, expect, it } from 'vitest';

import { classifyJsonRpcMessage } from './classify-json-rpc-message';

describe('classifyJsonRpcMessage', () => {
  // result を持つレスポンスを response として分類すること
  it('classifies a response message with result', () => {
    const message = {
      jsonrpc: '2.0',
      id: 1,
      result: { ok: true },
    };

    const classified = classifyJsonRpcMessage(message);

    expect(classified.type).toBe('response');
    if (classified.type === 'response') {
      expect(classified.message.id).toBe(1);
      expect(classified.message.result).toEqual({ ok: true });
    }
  });

  // id と method を持つメッセージを request として分類すること
  it('classifies a request message', () => {
    const message = {
      jsonrpc: '2.0',
      id: 2,
      method: 'session/new',
      params: { cwd: '/tmp' },
    };

    const classified = classifyJsonRpcMessage(message);

    expect(classified.type).toBe('request');
    if (classified.type === 'request') {
      expect(classified.message.method).toBe('session/new');
    }
  });

  // id がなく method を持つメッセージを notification として分類すること
  it('classifies a notification message', () => {
    const message = {
      jsonrpc: '2.0',
      method: 'session/update',
      params: { state: 'running' },
    };

    const classified = classifyJsonRpcMessage(message);

    expect(classified.type).toBe('notification');
    if (classified.type === 'notification') {
      expect(classified.message.method).toBe('session/update');
    }
  });

  // JSON-RPC として不正な値を unknown として扱うこと
  it('returns unknown for non-object or ambiguous payloads', () => {
    expect(classifyJsonRpcMessage(null).type).toBe('unknown');
    expect(classifyJsonRpcMessage('text').type).toBe('unknown');
    expect(classifyJsonRpcMessage({ id: 1 }).type).toBe('unknown');
  });
});
