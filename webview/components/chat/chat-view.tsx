import * as React from 'react';
import { Square, Plus, ArrowUp, Wrench, Play, X, ChevronDown } from 'lucide-react';

import type { ChatItem, QueuedPrompt } from '../../logic/types';

export interface ChatViewProps {
  items: ChatItem[];
  queue: QueuedPrompt[];
  streaming: boolean;
  onSubmitPrompt: (text: string) => void;
  onCancel: () => void;
  onNewSession: () => void;
  onSendQueuedNow: (queuedPromptId: string) => void;
  onRemoveQueued: (queuedPromptId: string) => void;
}

export function ChatView({
  items,
  queue,
  streaming,
  onSubmitPrompt,
  onCancel,
  onNewSession,
  onSendQueuedNow,
  onRemoveQueued,
}: ChatViewProps): React.JSX.Element {
  const [prompt, setPrompt] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items, streaming]);

  React.useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = '0px';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
  }, [prompt]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitPrompt(prompt);
    setPrompt('');
  };

  return (
    <div className="relative h-full overflow-hidden bg-(--vscode-sideBar-background) text-(--vscode-sideBar-foreground)">
      <header className="sticky top-0 z-10 bg-(--vscode-sideBar-background)/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onNewSession}
            title="New chat"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-(--vscode-descriptionForeground) hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,white_5%)] hover:text-(--vscode-editor-foreground)"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="h-[calc(100%-132px)] overflow-y-auto px-3 py-3">
        <div className="space-y-2.5">
          {items.map((item) => (
            <MessageRow key={item.id} item={item} />
          ))}
        </div>

        {streaming ? (
          <div className="mt-2 inline-flex items-center gap-2 text-xs text-(--vscode-descriptionForeground)">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-(--vscode-textLink-foreground) before:absolute before:inset-0 before:animate-ping before:rounded-full before:bg-(--vscode-textLink-foreground)" />
            Kiro is thinking...
          </div>
        ) : null}
      </div>

      <footer className="absolute inset-x-0 bottom-0 bg-(--vscode-sideBar-background) p-3">
        {queue.length > 0 ? (
          <section className="mb-2 rounded-md border border-(--vscode-panel-border) bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,black_4%)] p-2">
            <p className="mb-1 text-[11px] text-(--vscode-descriptionForeground)">
              Queued ({queue.length})
            </p>
            <div className="max-h-28 space-y-1.5 overflow-y-auto">
              {queue.map((queuedItem) => (
                <article
                  key={queuedItem.id}
                  className="flex items-start justify-between gap-2 rounded border border-(--vscode-panel-border) px-2 py-1.5"
                >
                  <p className="line-clamp-2 text-[12px] leading-snug">{queuedItem.text}</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Send now"
                      onClick={() => onSendQueuedNow(queuedItem.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,white_5%)]"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Remove from queue"
                      onClick={() => onRemoveQueued(queuedItem.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,white_5%)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <form
          className="space-y-2 rounded-[28px] border border-[color-mix(in_srgb,var(--vscode-panel-border)_75%,#b7bcc8_25%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,#c7ccda_22%)] p-3"
          onSubmit={handleSubmit}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Message Kiro Agent — @ to include context"
            className="max-h-55 min-h-11 w-full resize-none rounded-2xl border border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,#c7ccda_22%)] px-4 py-3 text-[13px] text-(--vscode-editor-foreground) outline-none"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[12px] text-(--vscode-descriptionForeground)">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-(--vscode-panel-border) bg-[color-mix(in_srgb,var(--vscode-editor-background)_72%,#c5cad7_28%)]"
                title="Add context"
              >
                <Plus className="h-4 w-4" />
              </button>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-1">
                auto
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
              <span>{streaming ? 'Generating... New send will be queued.' : 'Ready'}</span>
            </div>

            <button
              type={streaming && !prompt.trim() ? 'button' : 'submit'}
              onClick={streaming && !prompt.trim() ? onCancel : undefined}
              disabled={!streaming && !prompt.trim()}
              title={
                streaming && !prompt.trim()
                  ? 'Stop generation'
                  : streaming
                    ? 'Queue prompt'
                    : 'Send prompt'
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--vscode-panel-border)_70%,#a5aabd_30%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_65%,#9ea4b8_35%)] text-(--vscode-editor-foreground) disabled:opacity-50"
            >
              {streaming && !prompt.trim() ? (
                <Square className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}

function MessageRow({ item }: { item: ChatItem }): React.JSX.Element {
  const isUser = item.role === 'user';
  const isMeta = item.role === 'system' || item.role === 'error';

  return (
    <article className={`flex w-full gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && isMeta ? (
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-(--vscode-panel-border) bg-[color-mix(in_srgb,var(--vscode-editor-background)_80%,black_8%)] text-[10px] text-(--vscode-descriptionForeground)">
          <Wrench className="h-3 w-3" />
        </span>
      ) : null}
      <div
        className={
          item.role === 'user'
            ? 'max-w-[88%] whitespace-pre-wrap rounded-2xl border border-[color-mix(in_srgb,var(--vscode-panel-border)_65%,#b6bbca_35%)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_76%,#ced3df_24%)] px-3 py-2 text-[12px] leading-relaxed'
            : item.role === 'system'
              ? 'max-w-[88%] whitespace-pre-wrap rounded-xl border border-(--vscode-panel-border) bg-[color-mix(in_srgb,var(--vscode-editor-background)_86%,white_4%)] px-3 py-2 text-[12px] leading-relaxed text-(--vscode-descriptionForeground)'
              : item.role === 'error'
                ? 'max-w-[88%] whitespace-pre-wrap rounded-xl border border-(--vscode-inputValidation-errorBorder) bg-(--vscode-inputValidation-errorBackground) px-3 py-2 text-[12px] leading-relaxed text-(--vscode-inputValidation-errorForeground)'
                : 'max-w-[88%] whitespace-pre-wrap px-1 py-1 text-[12px] leading-relaxed text-(--vscode-editor-foreground)'
        }
      >
        {item.text}
      </div>
    </article>
  );
}
