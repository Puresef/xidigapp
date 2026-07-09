import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { getT } from '@/lib/locale';
import { BADGE_SLUGS } from '@/lib/reputation/constants';
import { awardBadge } from '@/lib/reputation/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Mentor-in-Residence appointment (§20, admin-only). Appoints the rotating
 * verified Advisor for a period: inserts the residency, ensures the appointee
 * carries the advisor grant (so is_advisor() holds), and awards the pre-seeded
 * mentor-in-residence badge (idempotent, emits badge_awarded, disambiguated by
 * the period so the next quarter's mentor gets their own award).
 *
 * All writes are service role AFTER the admin authz check. `period` is unique
 * (one residency per period); a 23505 on it surfaces as a 409 period_taken
 * envelope rather than a raw DB error.
 */

const bodySchema = z
  .object({
    advisorUserId: z.uuid(),
    period: z.string().trim().min(1).max(32),
    focus: z.string().trim().min(1).max(64).optional(),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
  // A clean 400 for an inverted window, rather than letting the
  // mentor_residencies_window CHECK raise an opaque 500.
  .refine((v) => v.endsOn >= v.startsOn, {
    message: 'endsOn must be on or after startsOn',
    path: ['endsOn'],
  });

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireRole('admin');
    const input = bodySchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const { error: insertError } = await admin.from('mentor_residencies').insert({
      advisor_user_id: input.advisorUserId,
      period: input.period,
      focus: input.focus ?? null,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      created_by_user_id: ctx.appUser.id,
    });

    if (insertError) {
      // 23505 = duplicate period (mentor_residencies.period is UNIQUE).
      if (insertError.code === '23505') {
        const t = await getT();
        return NextResponse.json(
          { error: { code: 'period_taken', message: t('mentor.periodTaken') } },
          { status: 409 },
        );
      }
      throw new Error(`mentor residency insert failed: ${insertError.message}`);
    }

    // Ensure is_advisor() holds for the appointee: (re-)activate their advisor
    // grant. Upsert on the user_id PK so re-appointing a previously-revoked
    // advisor clears revoked_at.
    const { error: grantError } = await admin.from('advisor_grants').upsert(
      {
        user_id: input.advisorUserId,
        granted_by_user_id: ctx.appUser.id,
        revoked_at: null,
      },
      { onConflict: 'user_id' },
    );
    if (grantError) throw new Error(`advisor grant failed: ${grantError.message}`);

    // Award the mentor badge (idempotent, emits badge_awarded once). The period
    // is the context so each residency gets its own award.
    await awardBadge(admin, {
      userId: input.advisorUserId,
      slug: BADGE_SLUGS.mentor,
      context: input.period,
    });

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'mentor.appoint',
      targetType: 'user',
      targetId: input.advisorUserId,
      metadata: { period: input.period },
    });

    return apiOk({ advisorUserId: input.advisorUserId, period: input.period });
  } catch (error) {
    return handleApiError(error);
  }
}
