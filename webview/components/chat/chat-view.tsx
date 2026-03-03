import * as React from 'react';
import {
  Square,
  Plus,
  ArrowUp,
  Wrench,
  Play,
  X,
  ChevronDown,
  Shield,
  ChevronRight,
  Check,
  Loader2,
  History,
} from 'lucide-react';
import hljs from 'highlight.js/lib/core';
import plaintext from 'highlight.js/lib/languages/plaintext';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import markdown from 'highlight.js/lib/languages/markdown';
import { Marked } from 'marked';

import type { ChatItem, ConfigOptionState, QueuedPrompt, SessionInfo } from '../../logic/types';

hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('text', plaintext);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);

const marked = new Marked({
  breaks: true,
  gfm: true,
});

marked.use({
  renderer: {
    code(token) {
      const language = (token.lang || '').trim().toLowerCase();
      const value = token.text || '';
      const highlighted =
        language && hljs.getLanguage(language)
          ? hljs.highlight(value, { language }).value
          : hljs.highlightAuto(value).value;
      return `<pre><code class="hljs language-${language || 'plaintext'}">${highlighted}</code></pre>`;
    },
  },
});

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toSafeMarkdownHtml(text: string): string {
  return marked.parse(escapeHtml(text)) as string;
}

export interface ChatViewProps {
  items: ChatItem[];
  queue: QueuedPrompt[];
  streaming: boolean;
  configOptions: ConfigOptionState[];
  sessions: SessionInfo[];
  currentSessionId?: string;
  ready: boolean;
  onSubmitPrompt: (text: string) => void;
  onCancel: () => void;
  onNewSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onSendQueuedNow: (queuedPromptId: string) => void;
  onRemoveQueued: (queuedPromptId: string) => void;
  onPermissionResponse: (requestId: number, optionId: string) => void;
  onSetConfigOption: (configId: string, value: string) => void;
}

export function ChatView({
  items,
  queue,
  streaming,
  configOptions,
  sessions,
  currentSessionId,
  ready,
  onSubmitPrompt,
  onCancel,
  onNewSession,
  onSwitchSession,
  onSendQueuedNow,
  onRemoveQueued,
  onPermissionResponse,
  onSetConfigOption,
}: ChatViewProps): React.JSX.Element {
  const [prompt, setPrompt] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [sessionListOpen, setSessionListOpen] = React.useState(false);
  const sessionListRef = React.useRef<HTMLDivElement>(null);

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

  React.useEffect(() => {
    if (!sessionListOpen) {
      return;
    }
    const handleClick = (e: MouseEvent) => {
      if (sessionListRef.current && !sessionListRef.current.contains(e.target as Node)) {
        setSessionListOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sessionListOpen]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-(--vscode-sideBar-background) text-(--vscode-sideBar-foreground)">
      <header className="sticky top-0 z-10 bg-(--vscode-sideBar-background)/95 px-3 py-2 backdrop-blur">
        {ready ? (
        <div className="relative flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setSessionListOpen(!sessionListOpen)}
            title="Switch session"
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-(--vscode-descriptionForeground)"
          >
            <History className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onNewSession}
            title="New chat"
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-(--vscode-descriptionForeground)"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          {sessionListOpen ? (
            <div
              ref={sessionListRef}
              className="absolute right-0 top-full z-20 mt-1 max-h-64 w-full min-w-0 overflow-y-auto rounded-md border border-(--vscode-panel-border) bg-(--vscode-sideBar-background) py-1 shadow-lg"
            >
              {sessions.length > 0 ? (
                sessions.map((s) => (
                  <button
                    key={s.sessionId}
                    type="button"
                    onClick={() => {
                      if (s.sessionId !== currentSessionId) {
                        onSwitchSession(s.sessionId);
                      }
                      setSessionListOpen(false);
                    }}
                    className={`flex w-full cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,white_5%)] ${
                      s.sessionId === currentSessionId
                        ? 'text-(--vscode-textLink-foreground)'
                        : 'text-(--vscode-editor-foreground)'
                    }`}
                  >
                    <span className="line-clamp-1 text-[12px]">{s.title}</span>
                    <span className="text-[10px] text-(--vscode-descriptionForeground)">
                      {new Date(s.updatedAt).toLocaleString()}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-1.5 text-[12px] text-(--vscode-descriptionForeground)">
                  No sessions
                </p>
              )}
            </div>
          ) : null}
        </div>
        ) : null}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!ready ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-(--vscode-descriptionForeground)" />
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              {items.map((item) => (
                <MessageRow key={item.id} item={item} onPermissionResponse={onPermissionResponse} />
              ))}
            </div>

            {streaming &&
            items.length > 0 &&
            items[items.length - 1].role !== 'agent' &&
            !items.some(
              (i) =>
                (i.role === 'tool' || i.role === 'permission') &&
                (i.toolStatus === 'running' || i.toolStatus === 'pending' || !i.toolStatus),
            ) ? (
              <p className="mt-2 text-xs text-(--vscode-descriptionForeground)">thinking...</p>
            ) : null}
          </>
        )}
      </div>

      <footer className="shrink-0 bg-(--vscode-sideBar-background) p-3">
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
              if (event.nativeEvent.isComposing) {
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (ready) {
                  event.currentTarget.form?.requestSubmit();
                }
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
              {configOptions
                .filter((opt) => opt.category === 'model' || opt.category === 'mode')
                .map((opt) => (
                  <ModelSelector
                    key={opt.id}
                    option={opt}
                    onChange={(value) => onSetConfigOption(opt.id, value)}
                  />
                ))}
              {configOptions.filter((opt) => opt.category === 'model').length === 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </span>
              ) : null}
            </div>

            <button
              type={streaming && !prompt.trim() ? 'button' : 'submit'}
              onClick={streaming && !prompt.trim() ? onCancel : undefined}
              disabled={!ready || (!streaming && !prompt.trim())}
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

function MessageRow({
  item,
  onPermissionResponse,
}: {
  item: ChatItem;
  onPermissionResponse: (requestId: number, optionId: string) => void;
}): React.JSX.Element {
  const isUser = item.role === 'user';
  const isMeta =
    item.role === 'system' ||
    item.role === 'error' ||
    item.role === 'tool' ||
    item.role === 'permission';
  if (item.role === 'tool') {
    return <ToolCallRow item={item} />;
  }
  if (item.role === 'permission') {
    return <PermissionRow item={item} onPermissionResponse={onPermissionResponse} />;
  }

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
        {item.role === 'agent' ? (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: toSafeMarkdownHtml(item.text) }}
          />
        ) : (
          item.text
        )}
      </div>
    </article>
  );
}

function ToolCallRow({ item }: { item: ChatItem }): React.JSX.Element {
  const status = item.toolStatus ?? 'pending';
  const [open, setOpen] = React.useState(false);

  const statusIcon =
    status === 'completed' ? (
      <Check className="h-3 w-3 text-emerald-400" />
    ) : status === 'failed' ? (
      <X className="h-3 w-3 text-red-400" />
    ) : (
      <Loader2 className="h-3 w-3 animate-spin text-(--vscode-descriptionForeground)" />
    );

  return (
    <article className="text-[12px] text-(--vscode-descriptionForeground)">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex cursor-pointer items-center gap-1.5 px-1.5 py-0.5"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        {statusIcon}
        <span>{item.toolName}</span>
      </button>
      {open ? (
        <div className="mt-1 ml-6 max-h-56 overflow-auto rounded-md bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,black_10%)] p-2 text-[11px] whitespace-pre-wrap">
          {item.toolTitle ? <p>{item.toolTitle}</p> : null}
          {item.text ? <pre className="whitespace-pre-wrap">{item.text}</pre> : null}
        </div>
      ) : null}
    </article>
  );
}

function PermissionRow({
  item,
  onPermissionResponse,
}: {
  item: ChatItem;
  onPermissionResponse: (requestId: number, optionId: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const status = item.toolStatus;
  const resolvedLabel = item.resolved
    ? ((item.permissionOptions ?? []).find((o) => o.optionId === item.resolvedOptionId)?.label ??
      item.resolvedOptionId)
    : undefined;

  const statusIcon = status ? (
    status === 'completed' ? (
      <Check className="h-3 w-3 text-emerald-400" />
    ) : status === 'failed' ? (
      <X className="h-3 w-3 text-red-400" />
    ) : (
      <Loader2 className="h-3 w-3 animate-spin" />
    )
  ) : null;

  return (
    <article className="text-[12px] text-(--vscode-descriptionForeground)">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex cursor-pointer items-center gap-1.5 px-1.5 py-0.5"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
          {statusIcon ?? <Shield className="h-3 w-3 text-amber-400" />}
          <span>{item.toolName}</span>
        </button>

        {item.resolved ? (
          <span className="inline-flex items-center gap-1 text-[11px]">
            <Check className="h-3 w-3 text-emerald-400" />
            {resolvedLabel}
          </span>
        ) : (
          <div className="inline-flex items-center gap-0.5">
            {(item.permissionOptions ?? []).map((option) => (
              <button
                key={option.optionId}
                type="button"
                onClick={() => {
                  if (item.permissionRequestId !== undefined) {
                    onPermissionResponse(item.permissionRequestId, option.optionId);
                  }
                }}
                className="rounded-md px-2 py-0.5 text-[11px] font-medium text-(--vscode-textLink-foreground) hover:bg-[color-mix(in_srgb,var(--vscode-textLink-foreground)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--vscode-textLink-foreground)_18%,transparent)]"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {open ? (
        <div className="mt-1 ml-6 max-h-56 overflow-auto rounded-md bg-[color-mix(in_srgb,var(--vscode-editor-background)_90%,black_10%)] p-2 text-[11px] whitespace-pre-wrap">
          {item.toolTitle ? <p>{item.toolTitle}</p> : null}
          {item.text ? <pre className="whitespace-pre-wrap">{item.text}</pre> : null}
        </div>
      ) : null}
    </article>
  );
}

function ModelSelector({
  option,
  onChange,
}: {
  option: ConfigOptionState;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const currentLabel =
    option.values.find((v) => v.value === option.currentValue)?.name ?? option.currentValue;

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1"
      >
        {currentLabel}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-20 mb-1 min-w-40 rounded-md border border-(--vscode-panel-border) bg-(--vscode-sideBar-background) py-1 shadow-lg">
          {option.values.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => {
                onChange(v.value);
                setOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,white_5%)] ${
                v.value === option.currentValue
                  ? 'text-(--vscode-textLink-foreground)'
                  : 'text-(--vscode-editor-foreground)'
              }`}
            >
              {v.value === option.currentValue ? (
                <Check className="h-3 w-3" />
              ) : (
                <span className="h-3 w-3" />
              )}
              {v.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
