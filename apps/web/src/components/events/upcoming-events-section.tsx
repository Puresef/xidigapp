import { listUpcomingEventsFor } from '@/lib/events/views';
import { getLocale, getT } from '@/lib/locale';

import { EventList } from './event-list';

/**
 * Embedded "upcoming events" section (extras item 8 — merged discovery, not
 * siloed): drops onto the public Lab page, the business listing page and the
 * host profile. Small, count-limited, reuses the service-role projection.
 * Renders NOTHING when the target has no upcoming events (no empty rooms).
 *
 * `publicOnly` MUST be true on signed-out surfaces (public visibility +
 * organic-proof filters); member surfaces may include members-visibility rows.
 * space_only events never appear here (see lib/events/views.ts).
 */
export async function UpcomingEventsSection({
  target,
  publicOnly,
}: {
  target: { labId: string } | { listingId: string } | { hostUserId: string };
  publicOnly: boolean;
}) {
  let items;
  try {
    items = await listUpcomingEventsFor(target, { publicOnly });
  } catch {
    // Resilience: a failed lookup degrades to no section, never a crash.
    return null;
  }
  if (items.length === 0) return null;

  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const modeLabels = {
    online: t('events.modeOnline'),
    in_person: t('events.modeInPerson'),
    hybrid: t('events.modeHybrid'),
  };

  return (
    <section className="xidig-section">
      <h2 className="xidig-section__title">{t('events.upcomingTitle')}</h2>
      <EventList items={items} locale={locale} modeLabels={modeLabels} />
    </section>
  );
}
