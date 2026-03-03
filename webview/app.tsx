import * as React from 'react';

import { ChatView } from './components/chat/chat-view';
import { useChatController } from './logic/use-chat-controller';

export function App(): React.JSX.Element {
  const { controller, state } = useChatController();

  return (
    <ChatView
      items={state.items}
      queue={state.queue}
      streaming={state.streaming}
      configOptions={state.configOptions}
      sessions={state.sessions}
      currentSessionId={state.currentSessionId}
      ready={state.ready}
      onSubmitPrompt={(text) => controller.sendPrompt(text)}
      onCancel={() => controller.cancel()}
      onNewSession={() => {
        if (state.items.length > 0) {
          controller.newSession();
        }
      }}
      onSwitchSession={(sessionId) => controller.switchSession(sessionId)}
      onSendQueuedNow={(id) => controller.sendQueuedPromptNow(id)}
      onRemoveQueued={(id) => controller.removeQueuedPrompt(id)}
      onPermissionResponse={(requestId, optionId) =>
        controller.respondPermission(requestId, optionId)
      }
      onSetConfigOption={(configId, value) => controller.setConfigOption(configId, value)}
    />
  );
}
