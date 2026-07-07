import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { requireRole } from '@/lib/auth/guards';
import { parsePostId } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Pin / unpin (§15 pinned weekly highlights slot — the feed's `?pinned=1`
 * strip shows the 3 most recently pinned). Mod-only, audited.
 */

async function setPinned(id: string, pinnedAt: string | null, actorUserId: string): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: updated, error } = await admin
    .from('posts')
    .update({ pinned_at: pinnedAt })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`pin update failed: ${error.message}`);
  if (!updated) throw new ApiError('not_found', 404);

  await writeAudit(admin, {
    actorUserId,
    action: pinnedAt ? 'post.pinned' : 'post.unpinned',
    targetType: 'post',
    targetId: id,
  });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireRole('mod');
    const id = parsePostId((await context.params).id);

    await setPinned(id, new Date().toISOString(), ctx.appUser.id);
    return apiOk({ pinned: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireRole('mod');
    const id = parsePostId((await context.params).id);

    await setPinned(id, null, ctx.appUser.id);
    return apiOk({ pinned: false });
  } catch (error) {
    return handleApiError(error);
  }
}
