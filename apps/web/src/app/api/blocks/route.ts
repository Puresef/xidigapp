import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';

/**
 * The caller's block list (Settings → Privacy & Safety), hydrated with the
 * blocked members' public display fields. Reads run under the caller's RLS
 * (user_blocks_select_own; profiles are member-readable). Block/unblock
 * writes live at PUT/DELETE /api/blocks/[userId].
 */

export interface BlockedMember {
  userId: string;
  displayName: string | null;
  handle: string | null;
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
  blockedAt: string;
}

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();

    const { data: blocks, error } = await ctx.supabase
      .from('user_blocks')
      .select('blocked_user_id, created_at')
      .eq('blocker_user_id', ctx.appUser.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`block list read failed: ${error.message}`);

    const ids = (blocks ?? []).map((row) => row.blocked_user_id);

    const profilesById = new Map<
      string,
      { display_name: string; handle: string; avatar_path: string | null; avatar_blurhash: string | null }
    >();
    if (ids.length > 0) {
      const { data: profiles, error: profilesError } = await ctx.supabase
        .from('profiles')
        .select('user_id, display_name, handle, avatar_path, avatar_blurhash')
        .in('user_id', ids);
      if (profilesError) throw new Error(`block list hydrate failed: ${profilesError.message}`);
      for (const profile of profiles ?? []) profilesById.set(profile.user_id, profile);
    }

    const list: BlockedMember[] = (blocks ?? []).map((row) => {
      const profile = profilesById.get(row.blocked_user_id);
      return {
        userId: row.blocked_user_id,
        displayName: profile?.display_name ?? null,
        handle: profile?.handle ?? null,
        avatarThumbUrl: profile?.avatar_path
          ? publicMediaUrl(derivedThumbPath(profile.avatar_path))
          : null,
        avatarBlurhash: profile?.avatar_blurhash ?? null,
        blockedAt: row.created_at,
      };
    });

    return apiOk({ blocks: list });
  } catch (error) {
    return handleApiError(error);
  }
}
