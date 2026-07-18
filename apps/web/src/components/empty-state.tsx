'use client';

import type { ReactNode } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';

/**
 * Shared empty state (rich-by-default, §22-friendly: one tiny inline SVG, no
 * media): the mark as a quiet visual anchor, the message, and — when the
 * surface has an obvious next step — a single CTA. The message arrives as a
 * MessageKey and resolves here, so a hardcoded string is a type error at the
 * call site; the CTA stays caller-built (Link, button, or nothing).
 */
export function EmptyState({
  titleKey,
  messageKey,
  action,
  className,
}: {
  titleKey?: MessageKey;
  messageKey: MessageKey;
  action?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const boxClass = ['xidig-section', 'xidig-empty', className].filter(Boolean).join(' ');
  return (
    <div className={boxClass}>
      <span className="xidig-empty__mark">
        <AnimatedMark mode="static" size={26} />
      </span>
      {titleKey ? <h2 className="xidig-empty__title">{t(titleKey)}</h2> : null}
      <p className="xidig-card__body">{t(messageKey)}</p>
      {action ?? null}
    </div>
  );
}
