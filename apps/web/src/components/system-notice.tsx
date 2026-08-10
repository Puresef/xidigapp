'use client';

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

/**
 * System-voice notice (DESIGN.md §4): moderation/system messaging renders as
 * a DESIGNED element — raised surface-2 + left accent rule + leading icon —
 * sitting OUTSIDE the member's own text flow, so a system message can never
 * be mistaken for something the author wrote (unlike Banner, which is the
 * §27 plain-language error/notice voice for form feedback). Tone picks the
 * rule + icon treatment: `info` (accent — pending states, neutral system
 * information) or `moderation` (muted — a moderation decision; calm and
 * administrative, never shaming).
 *
 * The optional `link` composes into the message's `{link}` placeholder via
 * the bracketed-sentinel pattern (docs/i18n.md; see SignUpForm's
 * renderTermsLabel): the sentence template owns word order per locale, and
 * the link text is its own key — translated fragments are never hand-glued.
 */
export function SystemNotice({
  tone,
  messageKey,
  link,
  params,
}: {
  tone: 'info' | 'moderation';
  messageKey: MessageKey;
  /** Rendered into the message's `{link}` placeholder as an internal link. */
  link?: { href: string; textKey: MessageKey } | undefined;
  /** Plain placeholder values (e.g. a member name) — composes with `link`. */
  params?: Record<string, string | number> | undefined;
}) {
  const t = useT();

  let message: ReactNode = t(messageKey, params);
  if (link) {
    const mark = '[[link]]';
    message = t(messageKey, { ...params, link: mark })
      .split(/(\[\[link\]\])/)
      .map((part, index) =>
        part === mark ? (
          <Link key={index} href={link.href}>
            {t(link.textKey)}
          </Link>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      );
  }

  return (
    <div role="status" className={`xidig-system-notice xidig-system-notice--${tone}`}>
      <span className="xidig-system-notice__icon" aria-hidden="true">
        {tone === 'moderation' ? (
          // Shield — the moderation system speaking.
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7 3v5c0 4.6-3 7.7-7 9.2-4-1.5-7-4.6-7-9.2V6l7-3z" />
          </svg>
        ) : (
          // Info circle — neutral system information.
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 7.5h.01" />
          </svg>
        )}
      </span>
      <p className="xidig-system-notice__text">{message}</p>
    </div>
  );
}
