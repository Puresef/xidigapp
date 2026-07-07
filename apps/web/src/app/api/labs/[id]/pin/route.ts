import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadLabForViewer, parseLabId } from '@/lib/labs-api';
import { pinLab, unpinLab } from '@/lib/labs/membership';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Pinned Labs on a profile (§20): a member features 1–3 Spaces. POST pins the
 * Space (must be readable — you can't pin a Space you can't see), DELETE unpins.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    await loadLabForViewer(ctx, id); // RLS gate: 404 if not readable
    const admin = getSupabaseAdmin();
    await pinLab(admin, ctx.appUser.id, id);
    return apiOk({ ok: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const admin = getSupabaseAdmin();
    await unpinLab(admin, ctx.appUser.id, id);
    return apiOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
