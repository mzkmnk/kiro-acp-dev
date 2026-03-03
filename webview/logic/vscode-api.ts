import type { WebviewToExtensionMessage } from './types';

type VsCodeApi = {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare const acquireVsCodeApi: () => VsCodeApi;

let cachedApi: VsCodeApi | undefined;

/**
 * Returns a singleton VS Code webview API instance.
 * VS Code Webview API のシングルトンインスタンスを返します。
 *
 * @returns Cached VS Code API instance.
 *          キャッシュ済みの VS Code API インスタンス。
 */
export function getVsCodeApi(): VsCodeApi {
  if (!cachedApi) {
    cachedApi = acquireVsCodeApi();
  }
  return cachedApi;
}
