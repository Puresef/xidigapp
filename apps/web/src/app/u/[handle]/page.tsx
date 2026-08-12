import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import type { Locale, Translator } from '@xidig/i18n';

import { UpcomingEventsSection } from '@/components/events/upcoming-events-section';
import { LiteMediaProvider } from '@/components/media/lite-media-provider';
import { LiteShowAll } from '@/components/media/lite-show-all';
import { FollowButton } from '@/components/profile/follow-button';
import { StartDmButton } from '@/components/messages/start-dm-button';
import { AnigaFacts } from '@/components/profile/aniga-facts';
import { AnigaPrivateStats } from '@/components/profile/aniga-private-stats';
import { AnigaProfile } from '@/components/profile/aniga-profile';
import { CompletionMeter } from '@/components/profile/completion-meter';
import { ModuleManager } from '@/components/profile/module-manager';
import { ReportControl } from '@/components/report-control';
import { ShareActions } from '@/components/share-actions';
import { getAnigaView, getPublicAnigaView, type AnigaView } from '@/lib/aniga/view';
import { getAuthContext, type AuthContext } from '@/lib/auth/guards';
import { canReceiveDms } from '@/lib/dm/service';
import { getLitePrefs } from '@/lib/lite/server';
import { getLocale, getT } from '@/lib/locale';
import { getPublicProfileView, isProfileIndexable } from '@/lib/profile-view';
import { HANDLE_REGEX } from '@/lib/profiles';
import { BackLink } from '@/components/back-link';

export const dynamic = 'force-dynamic';

/**
 * Member profile permalink (§13 "everything is linkable", §28 share pages).
 *
 * Aniga v3: the page is the module shell (`AnigaProfile`) — fixed chrome down
 * to the bio, then the member's own ordered module column. It replaced
 * `ProfileViewCard`, which rendered its own skills, links and pinned-Spaces
 * sections; those are modules now, so the card had to go rather than sit
 * beside the column double-rendering all three.
 *
 * Three viewer classes, three projections:
 *  - **owner** — `getAnigaView` under their own RLS, plus the rail: the module
 *    manager (their arrangement) and their private stats.
 *  - **member** — the same projection under THEIR RLS, so every module target
 *    is filtered by what they may actually read.
 *  - **anon** — `getPublicAnigaView`: the narrow login-free projection (no
 *    contact channels — a sign-in CTA is the top-of-funnel hook), and no
 *    module whose contents are member-visible surfaces.
 *
 * Privacy settings stay server-side: location granularity folds inside the
 * projection and `discoverable_search_engines=false` → robots noindex.
 */

async function loadView(
  handle: string,
  t: Translator,
  locale: Locale,
): Promise<{
  view: AnigaView | null;
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
    return { view: await getPublicAnigaView(handle), viewer: 'anon', viewerId: null, supabase: null };
  }
  const view = await getAnigaView(ctx.supabase, handle, ctx.appUser.id, t, locale);
  const viewer = view && view.base.profile.user_id === ctx.appUser.id ? 'owner' : 'member';
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
  // §privacy: discoverable_search_engines=false → noindex (server-side; the
  // page still renders for direct links, it just asks crawlers to stay out).
  const indexable = await isProfileIndexable(view.profile.user_id);
  return {
    title: `${view.profile.display_name} (@${view.profile.handle})`,
    description: view.profile.bio ?? undefined,
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function ProfilePermalinkPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const { view, viewer, viewerId, supabase } = await loadView(handle, t, locale);
  if (!view) notFound();

  const litePrefs = await getLitePrefs();
  const profile = view.base.profile;

  // Own-edge check under RLS (follows_select_own) — only meaningful for
  // signed-in non-owners.
  let initialFollowing = false;
  if (viewer === 'member' && supabase && viewerId) {
    const { data: edge } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_user_id', viewerId)
      .eq('target_type', 'user')
      .eq('target_id', profile.user_id)
      .maybeSingle();
    initialFollowing = Boolean(edge);
  }

  const linkRows = Array.isArray(profile.links) ? profile.links.length : 0;

  return (
    <main>
      <BackLink href="/suuq" labelKey="nav.suuq" />
      <LiteMediaProvider>
        <LiteShowAll />
        {viewer === 'owner' ? (
          <CompletionMeter
            input={{
              displayName: profile.display_name,
              bio: profile.bio,
              hasLocation: Boolean(profile.location_city ?? profile.location_country),
              skillsCount: profile.skills.length,
              lanesCount: profile.lanes.length,
              linksCount: linkRows,
              hasAvatar: Boolean(view.base.media.avatarUrl),
            }}
          />
        ) : null}
        <AnigaProfile
          view={view}
          viewer={viewer}
          prefs={litePrefs}
          actions={
            viewer === 'owner' ? (
              <>
                <Link href="/settings/profile" className="xidig-button xidig-button--secondary">
                  {t('action.editProfile')}
                </Link>
                <ShareActions path={`/u/${profile.handle}`} text={profile.display_name} />
              </>
            ) : viewer === 'member' ? (
              <>
                <FollowButton targetUserId={profile.user_id} initialFollowing={initialFollowing} />
                {canReceiveDms(profile.contact_options) ? (
                  <StartDmButton recipientUserId={profile.user_id} />
                ) : null}
                <ShareActions path={`/u/${profile.handle}`} text={profile.display_name} />
              </>
            ) : (
              <Link href="/signup" className="xidig-button xidig-button--primary">
                {t('profile.joinCta', { name: profile.display_name })}
              </Link>
            )
          }
          rail={
            /* 10b/5c — the owner's rail: the manager is the toggle surface for
               the whole ordered set (which is why no module carries its own
               eye), and the private stats live here rather than in the column
               a visitor can share.
               10d — a signed-in visitor's rail carries the report link instead.
               Gated on `member` rather than "not owner": reporting needs an
               account, so offering it to a logged-out reader would be a control
               that 401s on click. Same shape as the listing page's
               `viewerId && owner !== viewerId`. */
            viewer === 'owner' ? (
              <>
                <ModuleManager modules={view.modules} presentation="rail" />
                {/* Xogta — owner-only, and structurally so: `view.ownerFacts`
                    is null for every other viewer, so the visitor branch below
                    has no node to un-hide and carries no fold state. */}
                <AnigaFacts facts={view.ownerFacts} />
                <AnigaPrivateStats stats={view.privateStats} variant="rail" />
              </>
            ) : viewer === 'member' ? (
              <ReportControl
                targetType="profile"
                targetId={profile.user_id}
                targetName={profile.display_name}
                variant="quiet"
                // Named, not the generic `action.report`: under 10d this is the
                // only element in a stranger's rail, so an unlabelled flag
                // standing alone in a column says less than nothing.
                labelKey="profile.reportProfile"
              />
            ) : null
          }
        />
        {/* Merged discovery (extras item 8): events this member hosts.
            Anonymous visitors get PUBLIC + organic rows only. */}
        <UpcomingEventsSection
          target={{ hostUserId: profile.user_id }}
          publicOnly={viewer === 'anon'}
        />
      </LiteMediaProvider>
    </main>
  );
}
