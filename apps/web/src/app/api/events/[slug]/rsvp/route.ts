import { after } from 'next/server';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { EVENT_SLUG_REGEX } from '@/lib/events/constants';
import { rsvpSchema } from '@/lib/events/schemas';
import { getMemberEventView } from '@/lib/events/views';
import { insertNotification } from '@/lib/notifications/notify';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * RSVP (extras item 8, locked): going/interested only — absence means no.
 * PUT upserts the caller's RSVP; DELETE removes it. Writes are API-only (no
 * client insert policy) because the gates live here:
 *
 *   * the event must be readable to the caller (RLS via getMemberEventView),
 *     published, not cancelled, and not already finished;
 *   * SOFT capacity: when full, new 'going' RSVPs 409 (event_full) while
 *     'interested' keeps working (locked);
 *   * show_publicly is the member's own opt-in to appear by name.
 */

interface Ctx {
  params: Promise<{ slug: string }>;
}

export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { slug } = await params;
    if (!EVENT_SLUG_REGEX.test(slug)) throw new ApiError('not_found', 404);
    const ctx = await requireUser();
    const input = rsvpSchema.parse(await request.json());

    const view = await getMemberEventView(ctx, slug);
    if (!view) throw new ApiError('not_found', 404);
    const row = view.event;

    if (row.status !== 'published') throw new ApiError('event_not_open', 409);
    const endBoundary = row.ends_at ?? row.starts_at;
    if (Date.parse(endBoundary) < Date.now()) throw new ApiError('event_not_open', 409);

    const admin = getSupabaseAdmin();

    // Soft capacity: block a NEW 'going' (or interested→going flip) when full;
    // an existing 'going' member may still update show_publicly.
    if (input.status === 'going' && row.capacity !== null && view.viewer.rsvp?.status !== 'going') {
      const { count } = await admin
        .from('event_rsvps')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', row.id)
        .eq('status', 'going');
      if ((count ?? 0) >= row.capacity) throw new ApiError('event_full', 409);
    }

    const { error } = await admin.from('event_rsvps').upsert(
      {
        event_id: row.id,
        user_id: ctx.appUser.id,
        status: input.status,
        show_publicly: input.showPublicly,
      },
      { onConflict: 'event_id,user_id' },
    );
    if (error) throw new Error(`rsvp upsert failed: ${error.message}`);

    // Tell the host (bundled per event; skip self-RSVPs).
    if (!view.viewer.isHost && view.viewer.rsvp?.status !== input.status) {
      after(() =>
        insertNotification(admin, {
          userId: row.host_user_id,
          actorUserId: ctx.appUser.id,
          type: 'event_rsvp',
          entityType: 'event',
          entityId: row.id,
          payload: { eventSlug: row.slug, status: input.status },
          bundleKey: `event_rsvp:${row.id}`,
        }),
      );
    }

    emitServer(event('event_rsvp', { status: input.status }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

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

    const view = await getMemberEventView(ctx, slug);
    if (!view) throw new ApiError('not_found', 404);

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('event_rsvps')
      .delete()
      .eq('event_id', view.event.id)
      .eq('user_id', ctx.appUser.id);
    if (error) throw new Error(`rsvp delete failed: ${error.message}`);

    const fresh = await getMemberEventView(ctx, slug);
    return apiOk({ event: fresh });
  } catch (error) {
    return handleApiError(error);
  }
}
