import { after } from 'next/server';

import type { Json, TablesUpdate } from '@xidig/db';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { autopostEventPublished } from '@/lib/events/autopost';
import { EVENT_SLUG_REGEX } from '@/lib/events/constants';
import { eventUpdateSchema } from '@/lib/events/schemas';
import { getMemberEventView, type EventView } from '@/lib/events/views';
import { getT } from '@/lib/locale';
import { loadAttachableMedia } from '@/lib/media/attach';
import { scanTextContent } from '@/lib/moderation/scan';
import { insertNotification } from '@/lib/notifications/notify';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * One event (extras item 8, semantics per the Munaasabado mechanics upgrade).
 * GET = the member detail view (privacy-folded address/link, EXACT member-
 * surface RSVP counts — the N>=5 floor survives only on the signed-out
 * projection — and the named public wall: opted-in 'going' names for members,
 * every RSVP for the host; all in lib/events/views.ts). PATCH = host/mod
 * edits + the one-way draft→published transition (fires the Plaza auto-post +
 * moderation pre-scan exactly once — the status machine has no
 * published→draft edge); a finished event's record is IMMUTABLE (409
 * event_ended). DELETE = cancel (soft; the page stays up with a cancelled
 * banner) and notifies every RSVPed member (going AND interested) — also
 * blocked once the event has ended.
 */

interface Ctx {
  params: Promise<{ slug: string }>;
}

async function requireManageableEvent(ctx: AuthContext, slug: string): Promise<EventView> {
  const view = await getMemberEventView(ctx, slug);
  if (!view) throw new ApiError('not_found', 404);
  const isMod = ctx.appUser.role === 'admin' || ctx.appUser.role === 'mod';
  if (!view.viewer.isHost && !isMod) throw new ApiError('forbidden', 403);
  return view;
}

/** Post-end immutability (Task 4): a finished event's record is fixed. */
function rejectEndedEvent(event: EventView['event']): void {
  if (Date.parse(event.ends_at ?? event.starts_at) < Date.now()) {
    throw new ApiError('event_ended', 409);
  }
}

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { slug } = await params;
    if (!EVENT_SLUG_REGEX.test(slug)) throw new ApiError('not_found', 404);
    const ctx = await requireUser();
    const view = await getMemberEventView(ctx, slug);
    if (!view) throw new ApiError('not_found', 404);
    return apiOk({ event: view });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { slug } = await params;
    if (!EVENT_SLUG_REGEX.test(slug)) throw new ApiError('not_found', 404);
    const ctx = await requireUser();
    const input = eventUpdateSchema.parse(await request.json());
    const view = await requireManageableEvent(ctx, slug);
    const current = view.event;

    rejectEndedEvent(current);
    if (current.status === 'cancelled') throw new ApiError('event_not_open', 409);

    const admin = getSupabaseAdmin();

    if (input.category !== undefined) {
      const { data: category } = await admin
        .from('event_categories')
        .select('slug')
        .eq('slug', input.category)
        .eq('is_active', true)
        .maybeSingle();
      if (!category) throw new ApiError('event_category_invalid', 400);
    }

    // Cross-field rules against the STORED row.
    const startsAt = input.startsAt ?? current.starts_at;
    const endsAt = input.endsAt !== undefined ? input.endsAt : current.ends_at;
    if (endsAt != null && Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw new ApiError('invalid_request', 400);
    }
    const visibility = input.visibility ?? current.visibility;
    if (visibility === 'space_only' && current.lab_id === null) {
      throw new ApiError('invalid_request', 400);
    }

    const publishing = input.status === 'published' && current.status === 'draft';

    const patch: TablesUpdate<'events'> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.category !== undefined) patch.category_id = input.category;
    if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
    if (input.endsAt !== undefined) patch.ends_at = input.endsAt;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.mode !== undefined) patch.mode = input.mode;
    if (input.venueName !== undefined) patch.venue_name = input.venueName;
    if (input.venueAddress !== undefined) patch.venue_address = input.venueAddress;
    if (input.addressVisibility !== undefined) patch.address_visibility = input.addressVisibility;
    if (input.onlineUrl !== undefined) patch.online_url = input.onlineUrl;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.capacity !== undefined) patch.capacity = input.capacity;

    // Cover attach (Task 3, mirrors attachLabMedia in
    // app/api/labs/[id]/route.ts:40-88): `null` clears both denormalized
    // columns, a media id re-validates ownership/kind/scan before attaching.
    if (input.coverMediaId !== undefined) {
      if (input.coverMediaId === null) {
        patch.cover_path = null;
        patch.cover_blurhash = null;
      } else {
        const media = await loadAttachableMedia(admin, ctx.appUser.id, input.coverMediaId, [
          'event_cover',
        ]);
        patch.cover_path = media.storage_path;
        patch.cover_blurhash = media.blurhash;
      }
    }
    if (input.agenda !== undefined) patch.agenda = input.agenda as unknown as Json;

    if (publishing) patch.status = 'published';

    const { error } = await admin.from('events').update(patch).eq('id', current.id);
    if (error) throw new Error(`event update failed: ${error.message}`);

    const title = input.title ?? current.title;
    const description = input.description ?? current.description;

    if (publishing) {
      const t = await getT();
      after(() =>
        autopostEventPublished(admin, {
          hostUserId: current.host_user_id,
          slug: current.slug,
          title,
          startsAt,
          visibility,
          labId: current.lab_id,
          bodyLead: t('events.autopostLead'),
        }),
      );
    }
    if (publishing || input.title !== undefined || input.description !== undefined) {
      // Re-scan on publish and on copy edits (re-scans reuse the open review).
      after(() =>
        scanTextContent(admin, {
          entityType: 'event',
          entityId: current.id,
          authorUserId: current.host_user_id,
          text: `${title}\n${description}`.trim(),
        }),
      );
    }

    const fresh = await getMemberEventView(ctx, slug);
    return apiOk({ event: fresh });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { slug } = await params;
    if (!EVENT_SLUG_REGEX.test(slug)) throw new ApiError('not_found', 404);
    const ctx = await requireUser();
    const view = await requireManageableEvent(ctx, slug);
    rejectEndedEvent(view.event);
    if (view.event.status === 'cancelled') return apiOk({ cancelled: true });

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('events')
      .update({ status: 'cancelled' })
      .eq('id', view.event.id);
    if (error) throw new Error(`event cancel failed: ${error.message}`);

    // Tell everyone who RSVPed (in-app; email joins with extras item 14).
    after(async () => {
      const { data: rsvps } = await admin
        .from('event_rsvps')
        .select('user_id')
        .eq('event_id', view.event.id);
      for (const rsvp of rsvps ?? []) {
        if (rsvp.user_id === ctx.appUser.id) continue;
        await insertNotification(admin, {
          userId: rsvp.user_id,
          actorUserId: ctx.appUser.id,
          type: 'event_cancelled',
          entityType: 'event',
          entityId: view.event.id,
          payload: { eventSlug: view.event.slug },
        });
      }
    });

    emitServer(event('event_cancelled', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ cancelled: true });
  } catch (error) {
    return handleApiError(error);
  }
}
