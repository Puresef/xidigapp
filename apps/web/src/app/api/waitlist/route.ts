import { z } from 'zod';

import { ApiError, apiNotice, handleApiError } from '@/lib/api';
import { emailSchema, normalizePhone } from '@/lib/auth/identifiers';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Join the beta waitlist (§9 signup gating: invite-only + waitlist).
 * Idempotent: re-joining with the same contact returns the same friendly
 * "you're on the list" — no duplicate rows, no state leak.
 */

const bodySchema = z
  .object({
    email: emailSchema.optional(),
    phone: z.string().trim().min(4).optional(),
    // Front-door attribution (docs/front-door-plan.md §5): the CTA's
    // ?from=<page> token. Route-ish shape only — never PII, never free text.
    from: z
      .string()
      .trim()
      .regex(/^[a-z0-9/_-]{1,64}$/)
      .optional(),
    // Updates-only lane: the contact wants product updates, not a spot.
    updatesOnly: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.phone), {
    message: 'exactly one of email or phone',
  });

export async function POST(request: Request): Promise<Response> {
  try {
    await enforceRateLimit(`waitlist:ip:${clientIp(request)}`, { max: 5, windowSeconds: 3600 });

    const body = bodySchema.parse(await request.json());
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError('phone_invalid', 400);

    const admin = getSupabaseAdmin();

    // Existing members get the SAME neutral success as everyone else — an
    // unauthenticated endpoint must not be a membership oracle
    // (adversarial-review fix). We just skip the queue insert for them.
    let member = admin.from('users').select('id').limit(1);
    member = body.email ? member.eq('email', body.email) : member.eq('phone', phone!);
    const { data: memberRows } = await member;

    if (!memberRows?.length) {
      const { error } = await admin.from('waitlist_entries').insert({
        email: body.email ?? null,
        phone,
        source_page: body.from ?? null,
        updates_only: body.updatesOnly ?? false,
      });
      // 23505 = unique_violation: already on the list — that's a success story.
      if (error && error.code !== '23505') {
        throw new Error(`waitlist insert failed: ${error.message}`);
      }
    }

    return apiNotice('waitlist_joined');
  } catch (error) {
    return handleApiError(error);
  }
}
