import * as React from 'react';

import { ChatController } from './chat-controller';
import type { ChatState } from './types';

/**
 * Exposes the chat controller and reactive state for React UI components.
 * React UI コンポーネント向けに、チャットコントローラとリアクティブ状態を提供します。
 *
 * @returns Controller instance and current state snapshot.
 *          コントローラインスタンスと現在状態のスナップショット。
 */
export function useChatController(): { controller: ChatController; state: ChatState } {
  const controllerRef = React.useRef<ChatController>();

  if (!controllerRef.current) {
    controllerRef.current = new ChatController();
  }

  const controller = controllerRef.current;
  const state = React.useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getState(),
  );

  React.useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  return { controller, state };
}
