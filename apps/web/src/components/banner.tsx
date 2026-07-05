import type { ReactNode } from 'react';

/**
 * §27 plain-language banner. Presentational only (no 'use client') so it
 * renders in server AND client components. kind=error announces assertively
 * for screen readers; notices announce politely.
 */
export function Banner({ kind, children }: { kind: 'error' | 'notice'; children: ReactNode }) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`xidig-banner xidig-banner--${kind}`}>
      {children}
    </div>
  );
}
