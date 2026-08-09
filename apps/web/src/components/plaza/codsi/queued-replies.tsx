'use client';

import { useT } from '@xidig/i18n/react';

export interface QueuedReply {
  body: string;
  /** True enqueue timestamp — preserved, never re-stamped on send (HANDOFF). */
  queuedAt: number;
}

/**
 * Offline-queued replies (state s4, HANDOFF shared queue grammar): clock
 * chip + "waxay baxaysaa marka internetku soo noqdo" + Tirtir — identical
 * pattern to Maal contribution logs and Fariimo sends. Nothing here pretends
 * to be sent.
 */
export function QueuedReplies({
  items,
  onRemove,
}: {
  items: QueuedReply[];
  onRemove: (queuedAt: number) => void;
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <ul className="xidig-codsi-queue" aria-label={t('state.queuedChip')}>
      {items.map((item) => (
        <li key={item.queuedAt} className="xidig-codsi-queue__row">
          <span className="xidig-tag xidig-codsi-queue__chip">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="8.6" />
              <path d="M12 8v4.4l2.8 1.7" />
            </svg>
            {t('state.queuedChip')}
          </span>
          <p className="xidig-codsi-queue__body">{item.body}</p>
          <span className="xidig-codsi-queue__meta">
            {t('state.queuedNote')}{' '}
            <button
              type="button"
              className="xidig-codsi-queue__remove"
              onClick={() => onRemove(item.queuedAt)}
            >
              {t('action.delete')}
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
