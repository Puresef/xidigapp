import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { slugifyTerm, suggestionResolveSchema } from '@/lib/taxonomy/schemas';

/**
 * Admin review of member term suggestions (§ governed shared-coordinate lists).
 * GET lists the pending queue; PATCH approves (the term lands in the target
 * catalog — lanes / listing_categories) or declines. Approve is idempotent if
 * the slug already exists (someone added it meanwhile). Audited.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireRole('admin');
    const { data, error } = await ctx.supabase
      .from('term_suggestions')
      .select('id, kind, term, note, suggested_by, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw new Error(`suggestions query failed: ${error.message}`);
    return apiOk({ suggestions: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

async function nextPosition(
  admin: ReturnType<typeof getSupabaseAdmin>,
  table: 'lanes' | 'listing_categories',
): Promise<number> {
  const { data } = await admin.from(table).select('position').order('position', { ascending: false }).limit(1);
  const top = (data?.[0] as { position: number } | undefined)?.position ?? 0;
  return top + 1;
}

/** Insert the approved term into its catalog. Idempotent on an existing slug. */
async function promote(
  admin: ReturnType<typeof getSupabaseAdmin>,
  kind: 'lane' | 'listing_category',
  term: string,
  adminId: string,
): Promise<void> {
  // Submit-time validation guarantees a slug; this is a defensive backstop.
  const slug = slugifyTerm(term);
  if (!slug) throw new Error(`unslugifiable term: ${term}`);

  if (kind === 'lane') {
    const { error } = await admin.from('lanes').insert({
      slug,
      name_en: term,
      name_so: term,
      position: await nextPosition(admin, 'lanes'),
      source: 'member',
      created_by: adminId,
    });
    if (error && error.code !== '23505') throw new Error(`lane promote failed: ${error.message}`);
  } else {
    const { error } = await admin.from('listing_categories').insert({
      slug,
      name_en: term,
      position: await nextPosition(admin, 'listing_categories'),
    });
    if (error && error.code !== '23505') throw new Error(`category promote failed: ${error.message}`);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const ctx = await requireRole('admin');
    const input = suggestionResolveSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const { data: row, error: readError } = await admin
      .from('term_suggestions')
      .select('id, kind, term, status')
      .eq('id', input.id)
      .maybeSingle();
    if (readError) throw new Error(`suggestion read failed: ${readError.message}`);
    if (!row) throw new ApiError('not_found', 404);
    // Already resolved (double-click / another admin) → idempotent no-op.
    if (row.status !== 'pending') return apiOk({ resolved: row.status });

    if (input.action === 'approve') {
      await promote(admin, row.kind, row.term, ctx.appUser.id);
    }

    const { error: updateError } = await admin
      .from('term_suggestions')
      .update({
        status: input.action === 'approve' ? 'approved' : 'declined',
        resolved_by: ctx.appUser.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', input.id);
    if (updateError) throw new Error(`suggestion resolve failed: ${updateError.message}`);

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: `taxonomy.suggestion.${input.action}`,
      metadata: { kind: row.kind, term: row.term },
    });

    return apiOk({ resolved: input.action });
  } catch (error) {
    return handleApiError(error);
  }
}
