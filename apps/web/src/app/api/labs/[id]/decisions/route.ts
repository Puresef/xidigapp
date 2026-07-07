import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadLabForViewer, parseLabId, requireLabContributor } from '@/lib/labs-api';
import { decisionCreateSchema } from '@/lib/labs/schemas';
import { addDecision } from '@/lib/labs/service';
import { attachAuthors, DECISION_COLUMNS, type DecisionRow } from '@/lib/labs/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Space decision log (§16). GET lists decisions the caller can see (RLS-scoped);
 * POST records one. Contributors only; writes are service-role.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const { data, error } = await ctx.supabase
      .from('lab_decisions')
      .select(DECISION_COLUMNS)
      .eq('lab_id', id)
      .order('decided_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`decisions query failed: ${error.message}`);

    const admin = getSupabaseAdmin();
    const items = await attachAuthors(admin, (data ?? []) as DecisionRow[], 'created_by_user_id');
    return apiOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const input = decisionCreateSchema.parse(await request.json());

    const lab = await loadLabForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    await requireLabContributor(ctx, admin, lab);

    const { id: decisionId } = await addDecision(admin, lab, ctx.appUser.id, input);
    return apiOk({ id: decisionId }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
