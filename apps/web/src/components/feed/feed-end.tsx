'use client';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

/**
 * Branded end-of-feed terminus (brand-rethink adoption): the feed ENDS, and
 * says so — the no-infinite-scroll pledge made visible. Distinct from the
 * empty state (feed.empty = nothing to show; this = you saw everything).
 * The spark is a decorative CSS shape (aria-hidden), never a bare text glyph,
 * so screen readers get only the sentence; color inherits the muted meta tone
 * (no gold — reserved pending the palette decision).
 *
 * `messageKey` swaps the sentence for surfaces where "from your people" is
 * wrong (Labs, Directory, Saved use the plain state.endOfList).
 */
export function FeedEnd({ messageKey = 'feed.end' }: { messageKey?: MessageKey }) {
  const t = useT();
  return (
    <p className="xidig-card__meta xidig-feed-end">
      <span className="xidig-feed-end__spark" aria-hidden="true" />
      {t(messageKey)}
    </p>
  );
}
