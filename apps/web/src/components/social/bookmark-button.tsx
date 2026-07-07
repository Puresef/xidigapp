'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiDelete, apiPut } from '@/lib/api-client';
import type { BookmarkEntityType } from '@/lib/social/entities';

/**
 * Save / unsave toggle (Phase 4.5 Saved). Optimistic: flips instantly, calls
 * the idempotent PUT/DELETE, and rolls back on failure — a save must feel
 * free on a slow connection (§22). Signed-out visitors (public listing/lab
 * pages) get bounced to sign-in with a return path.
 */
export function BookmarkButton({
  entityType,
  entityId,
  initialBookmarked = false,
  signedIn,
}: {
  entityType: BookmarkEntityType;
  entityId: string;
  initialBookmarked?: boolean;
  signedIn: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);

  function toggle() {
    if (!signedIn) {
      router.push(`/signin?next=${encodeURIComponent(pathname ?? '/')}`);
      return;
    }
    const next = !bookmarked;
    setBookmarked(next);
    const request = next
      ? apiPut(`/api/bookmarks/${entityType}/${entityId}`)
      : apiDelete(`/api/bookmarks/${entityType}/${entityId}`);
    request.catch(() => setBookmarked(!next));
  }

  return (
    <button
      type="button"
      className={`xidig-button xidig-button--secondary${bookmarked ? ' xidig-bookmark--on' : ''}`}
      aria-pressed={bookmarked}
      onClick={toggle}
    >
      {bookmarked ? t('saved.saved') : t('saved.save')}
    </button>
  );
}
