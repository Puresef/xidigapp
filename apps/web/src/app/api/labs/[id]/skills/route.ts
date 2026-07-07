import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadLabForViewer, parseLabId, requireLabContributor } from '@/lib/labs-api';
import { skillNeedSchema } from '@/lib/labs/schemas';
import { addSkillNeed, removeSkillNeed } from '@/lib/labs/membership';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * "Looking for" skill needs (§16/§20). POST adds a needed skill (drives the
 * directory card + the 7-day skills-gap alert); DELETE removes one by id.
 * Contributors only.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const input = skillNeedSchema.parse(await request.json());

    const lab = await loadLabForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    await requireLabContributor(ctx, admin, lab);

    await addSkillNeed(admin, lab, ctx.appUser.id, input.skill);
    return apiOk({ ok: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const skillNeedId = new URL(request.url).searchParams.get('skillNeedId');
    if (!skillNeedId) throw new ApiError('invalid_request', 400);

    const lab = await loadLabForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    await requireLabContributor(ctx, admin, lab);

    await removeSkillNeed(admin, lab, ctx.appUser.id, skillNeedId);
    return apiOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
