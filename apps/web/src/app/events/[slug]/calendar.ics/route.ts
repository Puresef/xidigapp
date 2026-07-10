import { env } from '@/env';
import { getAuthContext } from '@/lib/auth/guards';
import { EVENT_SLUG_REGEX } from '@/lib/events/constants';
import { eventToIcs } from '@/lib/events/ics';
import { getMemberEventView, getPublicEventView, type EventView } from '@/lib/events/views';

export const dynamic = 'force-dynamic';

/**
 * ICS download (extras item 8 — hand-rolled, no calendar dependency).
 * Dual-mode like the event page: members get their privacy-folded view
 * (address/online link only when the reveal rules grant them), anonymous
 * callers get the public projection (public events only, no address/link).
 * The calendar entry therefore never carries more than its requester may see.
 */

interface Ctx {
  params: Promise<{ slug: string }>;
}

function locationLine(view: EventView): string | null {
  const parts = [view.event.venue_name, view.reveal.venueAddress].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  if (view.reveal.onlineUrl && parts.length === 0) return view.reveal.onlineUrl;
  return parts.length > 0 ? parts.join(', ') : null;
}

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  const { slug } = await params;
  if (!EVENT_SLUG_REGEX.test(slug)) return new Response('Not found', { status: 404 });

  const ctx = await getAuthContext();
  const blocked =
    ctx &&
    (ctx.appUser.status === 'suspended' ||
      ctx.appUser.status === 'deactivated' ||
      ctx.appUser.status === 'deleted');

  const view =
    !ctx || blocked ? await getPublicEventView(slug) : await getMemberEventView(ctx, slug);
  if (!view || view.event.status !== 'published') {
    return new Response('Not found', { status: 404 });
  }

  const ics = eventToIcs({
    slug: view.event.slug,
    title: view.event.title,
    description: view.event.description,
    startsAt: view.event.starts_at,
    endsAt: view.event.ends_at,
    location: locationLine(view),
    url: `${env.APP_URL.replace(/\/$/, '')}/events/${view.event.slug}`,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${view.event.slug}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
