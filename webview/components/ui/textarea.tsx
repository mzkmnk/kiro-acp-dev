import * as React from 'react';

import { cn } from '../../lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[44px] w-full rounded-2xl border border-transparent bg-[color-mix(in_srgb,var(--vscode-editor-background)_82%,#c9ceda_18%)] px-4 py-3 text-[13px] text-[var(--vscode-editor-foreground)] placeholder:text-[color-mix(in_srgb,var(--vscode-descriptionForeground)_75%,transparent)] outline-none ring-0 shadow-none hover:border-transparent focus:border-transparent focus-visible:border-transparent focus:ring-0 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
