import { after } from 'next/server';
import { z } from 'zod';

import type { TablesInsert } from '@xidig/db';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { assertCanCreateEvent, containerOf } from '@/lib/events/authz';
import { EVENT_CREATE_LIMIT_PER_DAY } from '@/lib/events/constants';
import { autopostEventPublished } from '@/lib/events/autopost';
import { eventCreateSchema } from '@/lib/events/schemas';
import { allocateEventSlug } from '@/lib/events/slug';
import { getMemberEventView, listMemberEvents } from '@/lib/events/views';
import { getT } from '@/lib/locale';
import { scanTextContent } from '@/lib/moderation/scan';
import { RATE_WINDOW_DAY_SECONDS } from '@/lib/plaza/constants';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Events index + create (extras item 8). GET is the member calendar:
 * chronological upcoming events under the caller's RLS (visibility policy),
 * optional ?category= filter — no ranking, no personalization (locked).
 *
 * POST creates an event under the LOCKED alpha creation rights (Lab/Club
 * organizers for their Space, verified businesses for their listing,
 * mods/admins for community events) — enforced server-side in
 * assertCanCreateEvent, never just UI. Publishing fires the Plaza auto-post
 * (host-authored 'update' post — awards/digest pattern) and the §15
 * moderation pre-scan (fire-and-forget, like posts).
 */

const querySchema = z.object({
  category: z.string().trim().min(1).max(50).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const items = await listMemberEvents(ctx, { category: params.category });
    return apiOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = eventCreateSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    // Locked creation rights — 403 before anything else is validated.
    await assertCanCreateEvent(ctx, admin, containerOf(input));

    const allowed = await checkRateLimit(`events:${ctx.appUser.id}`, {
      max: EVENT_CREATE_LIMIT_PER_DAY,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });
    if (!allowed) throw new ApiError('rate_limited', 429);

    const { data: category } = await admin
      .from('event_categories')
      .select('slug')
      .eq('slug', input.category)
      .eq('is_active', true)
      .maybeSingle();
    if (!category) throw new ApiError('event_category_invalid', 400);

    const slug = await allocateEventSlug(admin, input.title);
    const insert: TablesInsert<'events'> = {
      slug,
      title: input.title,
      description: input.description,
      category_id: input.category,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      timezone: input.timezone,
      mode: input.mode,
      venue_name: input.venueName ?? null,
      venue_address: input.venueAddress ?? null,
      address_visibility: input.addressVisibility,
      online_url: input.onlineUrl ?? null,
      host_user_id: ctx.appUser.id,
      lab_id: input.labId ?? null,
      listing_id: input.listingId ?? null,
      candidate_id: input.candidateId ?? null,
      visibility: input.visibility,
      capacity: input.capacity ?? null,
      status: input.status,
    };

    const { data: row, error } = await admin.from('events').insert(insert).select('id, slug').single();
    if (error || !row) throw new Error(`event insert failed: ${error?.message ?? 'no row'}`);

    if (input.status === 'published') {
      const t = await getT();
      after(() =>
        autopostEventPublished(admin, {
          hostUserId: ctx.appUser.id,
          slug: row.slug,
          title: input.title,
          startsAt: input.startsAt,
          visibility: input.visibility,
          labId: input.labId ?? null,
          bodyLead: t('events.autopostLead'),
        }),
      );
      after(() =>
        scanTextContent(admin, {
          entityType: 'event',
          entityId: row.id,
          authorUserId: ctx.appUser.id,
          text: `${input.title}\n${input.description}`.trim(),
        }),
      );
    }

    emitServer(
      event('event_created', {
        category: input.category,
        mode: input.mode,
        visibility: input.visibility,
        container: containerOf(input).kind,
      }),
      { distinctId: ctx.appUser.id, userId: ctx.appUser.id },
    );

    const view = await getMemberEventView(ctx, row.slug);
    return apiOk({ event: view }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
