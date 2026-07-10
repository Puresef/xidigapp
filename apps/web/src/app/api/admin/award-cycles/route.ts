import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Admin: open a Community-Awards voting cycle (§20). Adjacent Phase-7
 * hardening — Phase 7 shipped award_cycles + the vote guard, but award_votes
 * stays inert until a cycle is OPEN. This minimal admin/service route opens
 * (or reschedules) a quarter's window. Writes are service-role-only + audited;
 * award_cycles is otherwise not client-writable.
 *
 * Deliberately minimal (no awards admin UI) — a single upsert on the quarter.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/, 'quarter must look like 2026-Q3'),
  opensAt: z.string().datetime().optional(),
  closesAt: z.string().datetime(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireRole('admin');
    const input = bodySchema.parse(await request.json());
    const opensAt = input.opensAt ?? new Date().toISOString();

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('award_cycles')
      .upsert(
        { quarter: input.quarter, opens_at: opensAt, closes_at: input.closesAt },
        { onConflict: 'quarter' },
      )
      .select('quarter, opens_at, closes_at')
      .single();
    if (error || !data) throw new Error(`award cycle upsert failed: ${error?.message ?? 'no row'}`);

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'award_cycle.opened',
      metadata: { quarter: input.quarter },
    });

    return apiOk({ cycle: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
