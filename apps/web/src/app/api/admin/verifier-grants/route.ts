import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { verifierGrantSchema } from '@/lib/moderation/schemas';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * §14 verifier roster management (admin-only). The verifier capability sits
 * BESIDE mod/admin: only admins can grant/revoke it, and it's the gate for the
 * sensitive recording-access endpoint. Grant upserts an active row (re-granting
 * a revoked user clears revoked_at); revoke stamps revoked_at without deleting
 * the history. verifier_grants has user_id as PK, so the upsert conflict target
 * is user_id. All writes are service role.
 */

export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await requireRole('admin');
    const input = verifierGrantSchema.parse(await request.json());
    const service = getSupabaseAdmin();

    if (input.action === 'grant') {
      const { error } = await service
        .from('verifier_grants')
        .upsert(
          {
            user_id: input.userId,
            granted_by_user_id: admin.appUser.id,
            note: input.note ?? null,
            revoked_at: null,
          },
          { onConflict: 'user_id' },
        );
      if (error) throw new Error(`verifier grant failed: ${error.message}`);
    } else {
      const { error } = await service
        .from('verifier_grants')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', input.userId);
      if (error) throw new Error(`verifier revoke failed: ${error.message}`);
    }

    await writeAudit(service, {
      actorUserId: admin.appUser.id,
      action: `verifier.${input.action}`,
      targetType: 'user',
      targetId: input.userId,
    });

    return apiOk({ userId: input.userId, action: input.action });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(): Promise<Response> {
  try {
    await requireRole('admin');
    const service = getSupabaseAdmin();

    const { data: grants, error } = await service
      .from('verifier_grants')
      .select('user_id, granted_by_user_id, note, granted_at')
      .is('revoked_at', null)
      .order('granted_at', { ascending: false });
    if (error) throw new Error(`verifier roster load failed: ${error.message}`);

    const rows = grants ?? [];
    const userIds = [...new Set(rows.map((g) => g.user_id))];
    const { data: profiles } = userIds.length
      ? await service.from('profiles').select('user_id, display_name, handle').in('user_id', userIds)
      : {
          data: [] as { user_id: string; display_name: string; handle: string }[],
        };

    const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    const verifiers = rows.map((g) => {
      const profile = profileById.get(g.user_id);
      return {
        userId: g.user_id,
        grantedByUserId: g.granted_by_user_id,
        note: g.note,
        grantedAt: g.granted_at,
        profile: profile ? { displayName: profile.display_name, handle: profile.handle } : null,
      };
    });

    return apiOk({ verifiers });
  } catch (error) {
    return handleApiError(error);
  }
}
