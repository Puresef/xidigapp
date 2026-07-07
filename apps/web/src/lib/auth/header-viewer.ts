import { getAuthContext } from '@/lib/auth/guards';
import { profileMediaView } from '@/lib/profile-view';

/**
 * Minimal identity the header needs to render the account menu + avatar
 * server-side (no client fetch → no flash). Resilient: a signed-in user whose
 * profile row is missing/unreadable still gets a usable menu (initials from
 * their email), and any failure degrades to signed-out rather than throwing —
 * the header must never take a page down.
 */
export interface HeaderViewer {
  signedIn: boolean;
  displayName: string;
  handle: string;
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
}

const SIGNED_OUT: HeaderViewer = {
  signedIn: false,
  displayName: '',
  handle: '',
  avatarThumbUrl: null,
  avatarBlurhash: null,
};

export async function getHeaderViewer(): Promise<HeaderViewer> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return SIGNED_OUT;

    const { data } = await ctx.supabase
      .from('profiles')
      .select('display_name, handle, avatar_path, avatar_blurhash')
      .eq('user_id', ctx.appUser.id)
      .maybeSingle();

    const media = profileMediaView(data ?? {});
    const emailLocal = ctx.appUser.email?.split('@')[0] ?? 'You';
    return {
      signedIn: true,
      displayName: data?.display_name ?? emailLocal,
      handle: data?.handle ?? '',
      avatarThumbUrl: media.avatarThumbUrl,
      avatarBlurhash: media.avatarBlurhash,
    };
  } catch {
    return SIGNED_OUT;
  }
}
