import { z } from 'zod';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { isActiveModOrAdmin } from '@/lib/auth/privilege';
import { EVENT_SLUG_REGEX } from '@/lib/events/constants';
import { getMemberEventView } from '@/lib/events/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Door check-in (Task 4): the host marks who actually showed up.
 *
 *   * authz mirrors requireManageableEvent in ../route.ts — host or
 *     mod/admin only;
 *   * the door opens at starts_at (before that: 409 event_checkin_not_open);
 *   * only an EXISTING RSVP row can be checked in — attendance is never
 *     invented at the door;
 *   * the write goes through the admin client on purpose: event_rsvps has no
 *     member update policy for other people's rows, so this route IS the
 *     gate. checkedIn:false clears the stamp (undo stays possible).
 */

interface Ctx {
  params: Promise<{ slug: string }>;
}

const checkinSchema = z.object({
  userId: z.string().uuid(),
  checkedIn: z.boolean(),
});

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { slug } = await params;
    if (!EVENT_SLUG_REGEX.test(slug)) throw new ApiError('not_found', 404);
    const ctx = await requireUser();
    const input = checkinSchema.parse(await request.json());

    const view = await getMemberEventView(ctx, slug);
    if (!view) throw new ApiError('not_found', 404);
    const isMod = isActiveModOrAdmin(ctx.appUser);
    if (!view.viewer.isHost && !isMod) throw new ApiError('forbidden', 403);

    if (Date.parse(view.event.starts_at) > Date.now()) {
      throw new ApiError('event_checkin_not_open', 409);
    }

    const admin = getSupabaseAdmin();
    const { data: rsvp, error: lookupError } = await admin
      .from('event_rsvps')
      .select('user_id')
      .eq('event_id', view.event.id)
      .eq('user_id', input.userId)
      .maybeSingle();
    if (lookupError) throw new Error(`checkin rsvp lookup failed: ${lookupError.message}`);
    if (!rsvp) throw new ApiError('not_found', 404);

    const { error } = await admin
      .from('event_rsvps')
      .update({ checked_in_at: input.checkedIn ? new Date().toISOString() : null })
      .eq('event_id', view.event.id)
      .eq('user_id', input.userId);
    if (error) throw new Error(`checkin update failed: ${error.message}`);

    // Payload-free (§23): WHO was checked in stays out of analytics.
    emitServer(event('event_checked_in', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ checkedIn: input.checkedIn });
  } catch (error) {
    return handleApiError(error);
  }
}
