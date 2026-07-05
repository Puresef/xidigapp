import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FollowButton } from '@/components/profile/follow-button';
import { ProfileViewCard } from '@/components/profile/profile-view-card';
import { ShareActions } from '@/components/share-actions';
import { getAuthContext, type AuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import {
  getMemberProfileView,
  getPublicProfileView,
  type ProfileView,
} from '@/lib/profile-view';
import { HANDLE_REGEX } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

/**
 * Member profile permalink (§13 "everything is linkable", §28 share pages).
 * Renders login-free with the narrow public projection (no contact channels —
 * a sign-in CTA is the top-of-funnel hook); signed-in members get the full
 * §13 contact choices and a follow button.
 */

async function loadView(handle: string): Promise<{
  view: ProfileView | null;
  viewer: 'owner' | 'member' | 'anon';
  viewerId: string | null;
  supabase: AuthContext['supabase'] | null;
}> {
  if (!HANDLE_REGEX.test(handle)) return { view: null, viewer: 'anon', viewerId: null, supabase: null };
  const ctx = await getAuthContext();
  // Blocked accounts (suspended/deactivated/deleted) must not retain member
  // scope — the API layer 403s them (requireUser), so the SSR page degrades
  // to the login-free public projection to match. pending_deletion keeps
  // access (§19 grace period), mirroring requireUser semantics.
  const blocked =
    ctx &&
    (ctx.appUser.status === 'suspended' ||
      ctx.appUser.status === 'deactivated' ||
      ctx.appUser.status === 'deleted');
  if (!ctx || blocked) {
    return { view: await getPublicProfileView(handle), viewer: 'anon', viewerId: null, supabase: null };
  }
  const view = await getMemberProfileView(ctx.supabase, handle);
  const viewer = view && view.profile.user_id === ctx.appUser.id ? 'owner' : 'member';
  return { view, viewer, viewerId: ctx.appUser.id, supabase: ctx.supabase };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  if (!HANDLE_REGEX.test(handle)) return {};
  const view = await getPublicProfileView(handle);
  if (!view) return {};
  return {
    title: `${view.profile.display_name} (@${view.profile.handle})`,
    description: view.profile.bio ?? undefined,
  };
}

export default async function ProfilePermalinkPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const { view, viewer, viewerId, supabase } = await loadView(handle);
  if (!view) notFound();

  const t = await getT();

  // Own-edge check under RLS (follows_select_own) — only meaningful for
  // signed-in non-owners.
  let initialFollowing = false;
  if (viewer === 'member' && supabase && viewerId) {
    const { data: edge } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_user_id', viewerId)
      .eq('target_type', 'user')
      .eq('target_id', view.profile.user_id)
      .maybeSingle();
    initialFollowing = Boolean(edge);
  }

  return (
    <main>
      <ProfileViewCard
        view={view}
        viewer={viewer}
        actions={
          viewer === 'owner' ? (
            <>
              <Link href="/settings/profile" className="xidig-button xidig-button--secondary">
                {t('action.editProfile')}
              </Link>
              <ShareActions path={`/u/${view.profile.handle}`} text={view.profile.display_name} />
            </>
          ) : viewer === 'member' ? (
            <>
              <FollowButton targetUserId={view.profile.user_id} initialFollowing={initialFollowing} />
              <ShareActions path={`/u/${view.profile.handle}`} text={view.profile.display_name} />
            </>
          ) : (
            <Link href="/signup" className="xidig-button xidig-button--primary">
              {t('profile.joinCta', { name: view.profile.display_name })}
            </Link>
          )
        }
      />
    </main>
  );
}
