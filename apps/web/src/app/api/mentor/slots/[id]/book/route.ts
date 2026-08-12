import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { eventDateParts } from '@/lib/events/datetime';
import { getT } from '@/lib/locale';
import { MENTOR_SLOT_TIMEZONE } from '@/lib/mentor/constants';
import { notify } from '@/lib/notifications/notify';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Mentor slot booking (Munaasabado Task 9, §20 extension). POST claims an
 * open, future slot; DELETE releases the caller's own booking.
 *
 * All writes are service-role — `mentor_slots` revokes member
 * INSERT/UPDATE/DELETE entirely (migration 20260812000000), so the booker's
 * identity (`booked_by_user_id`) never rides through a client-writable
 * policy, only this route's own checks.
 *
 * The claim is a single conditional UPDATE
 * (`booked_by_user_id is null AND starts_at > now()`), never a
 * read-then-write: two members racing the same slot can never both win, and
 * a slot already in the past can never be claimed. Zero rows updated means
 * the id doesn't exist, was already taken, or is no longer in the future —
 * all three collapse to the same 409 mentor_slot_taken; the caller never
 * needed to tell them apart. The partial unique index on (residency_id,
 * booked_by_user_id) catches the OTHER race — this member already holding a
 * different slot in the same residency — as a 23505, mapped to 409
 * mentor_already_booked rather than a raw DB error.
 *
 * Mentor slots carry no per-residency timezone column (unlike `events`), so
 * every display and notification renders the slot's instant in UTC
 * (MENTOR_SLOT_TIMEZONE, shared with the booking island — lib/mentor/constants.ts).
 * Ruling 7 (12 Aug) requires that constraint to stay explicit to the member
 * rather than silent: the "when" string baked into the notification payload
 * below is built through `mentor.slotTimeUtc`, so it always carries a UTC
 * marker, never a bare weekday/time.
 */

const paramsSchema = z.object({ id: z.uuid() });

interface RouteCtx {
  params: Promise<{ id: string }>;
}

function parseSlotId(raw: { id: string }): string {
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data.id;
}

async function slotWhen(startsAt: string): Promise<string> {
  const t = await getT();
  const parts = eventDateParts(t, startsAt, null, MENTOR_SLOT_TIMEZONE);
  return t('mentor.slotTimeUtc', { time: `${parts.weekday} ${parts.time}` });
}

export async function POST(_request: Request, { params }: RouteCtx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const slotId = parseSlotId(await params);
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const { data: claimed, error } = await admin
      .from('mentor_slots')
      .update({ booked_by_user_id: ctx.appUser.id, booked_at: nowIso })
      .eq('id', slotId)
      .is('booked_by_user_id', null)
      .gt('starts_at', nowIso)
      .select('id, residency_id, starts_at')
      .maybeSingle();

    if (error) {
      // 23505 = mentor_slots_one_booking_per_member (partial unique index).
      if (error.code === '23505') throw new ApiError('mentor_already_booked', 409);
      throw new Error(`mentor slot claim failed: ${error.message}`);
    }
    if (!claimed) throw new ApiError('mentor_slot_taken', 409);

    const when = await slotWhen(claimed.starts_at);

    const { data: residency } = await admin
      .from('mentor_residencies')
      .select('advisor_user_id')
      .eq('id', claimed.residency_id)
      .maybeSingle();

    if (residency) {
      await notify(admin, {
        userId: residency.advisor_user_id,
        actorUserId: ctx.appUser.id,
        type: 'mentor_slot_booked',
        payload: { when },
      });
    }

    emitServer(event('mentor_slot_booked', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ id: claimed.id, startsAt: claimed.starts_at, when });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteCtx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const slotId = parseSlotId(await params);
    const admin = getSupabaseAdmin();

    // Pinned to the CALLER's own id — there is no path from this WHERE clause
    // to a slot booked by someone else. Idempotent by design (same posture as
    // the event_rsvps DELETE): unbooking a slot that isn't the caller's is a
    // no-op, not an error, so a stale client never needs a special case.
    const { error } = await admin
      .from('mentor_slots')
      .update({ booked_by_user_id: null, booked_at: null })
      .eq('id', slotId)
      .eq('booked_by_user_id', ctx.appUser.id);
    if (error) throw new Error(`mentor slot release failed: ${error.message}`);

    return apiOk({ id: slotId });
  } catch (error) {
    return handleApiError(error);
  }
}
