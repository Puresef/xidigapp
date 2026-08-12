'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * The show-publicly opt-in, re-homed beneath the attendee wall (Munaasabado
 * Task 6, brief item 6): the checkbox lives next to the names it would join,
 * so the choice reads as "appear on this wall", not abstract privacy.
 *
 * Rendered only for a viewer who already HAS an RSVP on an open event —
 * a toggle persists immediately through the same PUT the RSVP verbs use
 * (status unchanged, showPublicly flipped) and refreshes so the wall tells
 * the truth. First-time RSVPs from the aside default to opt-IN (the named
 * wall is the default per Task 4's flip — DB column default `true`); this
 * is the one place to opt back out.
 */
export function ShowPubliclyToggle({
  slug,
  rsvp,
}: {
  slug: string;
  rsvp: { status: 'going' | 'interested'; showPublicly: boolean };
}) {
  const t = useT();
  const router = useRouter();
  const [checked, setChecked] = useState(rsvp.showPublicly);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  // This instance survives a `router.refresh()` (same position in the tree),
  // so a prop change that didn't originate from THIS component's own
  // `persist()` — a verb PUT elsewhere on the page, the offline queue
  // flushing a different showPublicly than was optimistically shown here —
  // must be adopted, or the checkbox mirrors a value the server no longer
  // holds. Render-phase derived state, per React's docs (LocaleProvider
  // precedent: packages/i18n/src/react.tsx).
  const [lastRsvpShowPublicly, setLastRsvpShowPublicly] = useState(rsvp.showPublicly);
  if (rsvp.showPublicly !== lastRsvpShowPublicly) {
    setLastRsvpShowPublicly(rsvp.showPublicly);
    setChecked(rsvp.showPublicly);
  }

  async function persist(next: boolean) {
    setChecked(next);
    setPending(true);
    setError(null);
    try {
      await apiPut(`/api/events/${slug}/rsvp`, { status: rsvp.status, showPublicly: next });
      router.refresh();
    } catch (cause) {
      setChecked(!next); // the wall shows the server's truth, not the wish
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="xidig-event-wall__optin">
      {error ? <PlainErrorBanner error={error} /> : null}
      <label className="xidig-field__label">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(event) => void persist(event.target.checked)}
        />{' '}
        {t('events.showPubliclyLabel')}
      </label>
    </div>
  );
}
