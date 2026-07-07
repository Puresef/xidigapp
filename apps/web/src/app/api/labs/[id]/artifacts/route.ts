import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadLabForViewer, parseLabId, requireLabContributor } from '@/lib/labs-api';
import { artifactCreateSchema } from '@/lib/labs/schemas';
import { addArtifact } from '@/lib/labs/service';
import { ARTIFACT_COLUMNS, attachAuthors, type ArtifactRow } from '@/lib/labs/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Space artifacts (§16 — shared LINKS only in v1.0, no file uploads). GET lists
 * artifacts the caller can see (RLS-scoped); POST adds one. Contributors only.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const { data, error } = await ctx.supabase
      .from('lab_artifacts')
      .select(ARTIFACT_COLUMNS)
      .eq('lab_id', id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`artifacts query failed: ${error.message}`);

    const admin = getSupabaseAdmin();
    const items = await attachAuthors(admin, (data ?? []) as ArtifactRow[], 'added_by_user_id');
    return apiOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const input = artifactCreateSchema.parse(await request.json());

    const lab = await loadLabForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    await requireLabContributor(ctx, admin, lab);

    const { id: artifactId } = await addArtifact(admin, lab, ctx.appUser.id, input);
    return apiOk({ id: artifactId }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
