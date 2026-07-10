import Link from 'next/link';

import { formatDate, type Locale } from '@xidig/i18n';

import type { EventListItem } from '@/lib/events/views';

/**
 * Compact upcoming-events list (extras item 8) — shared by the /events index
 * cards' small cousins: the embedded sections on Lab pages, listing pages and
 * host profiles, plus the digest slot preview. Server component; Lite-friendly
 * (text only, no media).
 */

export function formatEventStart(item: { startsAt: string; timezone: string }, locale: Locale): string {
  return formatDate(new Date(item.startsAt), locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: item.timezone,
  });
}

export function EventList({
  items,
  locale,
  modeLabels,
}: {
  items: EventListItem[];
  locale: Locale;
  modeLabels: Record<string, string>;
}) {
  return (
    <ul className="xidig-invite-list">
      {items.map((item) => (
        <li key={item.slug} className="xidig-invite-list__item">
          <Link href={`/events/${item.slug}`}>{item.title}</Link>
          <p className="xidig-card__meta">
            {formatEventStart(item, locale)}
            {' · '}
            {modeLabels[item.mode] ?? item.mode}
          </p>
        </li>
      ))}
    </ul>
  );
}
