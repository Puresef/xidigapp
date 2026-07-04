import type { ReactNode } from 'react';

import { cn } from './cn';

export interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
}

/**
 * Minimal presentational button. Intentionally has no client-side interactivity
 * so it renders in a React Server Component without a `'use client'` boundary.
 */
export function Button({ children, variant = 'primary', className }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'xidig-button',
        variant === 'primary' ? 'xidig-button--primary' : 'xidig-button--secondary',
        className,
      )}
    >
      {children}
    </button>
  );
}
