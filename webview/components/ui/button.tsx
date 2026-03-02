import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[12px] font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:brightness-110',
        ghost:
          'border border-[var(--vscode-panel-border)] bg-transparent text-[var(--vscode-editor-foreground)] hover:bg-[color-mix(in_srgb,var(--vscode-editor-background)_70%,white_5%)]',
      },
      size: {
        default: 'h-9 px-3 py-2',
        sm: 'h-8 px-2.5 text-xs',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);

Button.displayName = 'Button';
