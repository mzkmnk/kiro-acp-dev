import type { InitializeParams } from '../types';

/**
 * Builds the ACP initialize parameters for this extension.
 * この拡張機能で使用する ACP の initialize パラメータを生成します。
 *
 * @returns Initialize parameters for the ACP handshake.
 *          ACP ハンドシェイクに使用する initialize パラメータ。
 */
export function createInitializeParams(): InitializeParams {
  return {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
    clientInfo: {
      name: 'kiro-acp-dev',
      title: 'Kiro ACP Dev',
      version: '0.1.0',
    },
  };
}
