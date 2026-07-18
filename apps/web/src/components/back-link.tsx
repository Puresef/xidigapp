'use client';

import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

/**
 * Detail-page orientation (18 Jul nav review): a quiet "← Section" link back
 * to the parent surface. Deliberately NOT a history back button — deep-link
 * visitors have no history, and the browser already owns real back. Uses the
 * section's nav label so no new copy is minted per page.
 */
export function BackLink({ href, labelKey }: { href: string; labelKey: MessageKey }) {
  const t = useT();
  return (
    <p className="xidig-backlink">
      <Link href={href}>← {t(labelKey)}</Link>
    </p>
  );
}
