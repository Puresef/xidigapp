import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LiteMediaProvider } from '@/components/media/lite-media-provider';
import { LiteShowAll } from '@/components/media/lite-show-all';
import { AnigaFacts } from '@/components/profile/aniga-facts';
import { AnigaPrivateStats } from '@/components/profile/aniga-private-stats';
import { AnigaProfile } from '@/components/profile/aniga-profile';
import { CompletionMeter } from '@/components/profile/completion-meter';
import { ModuleManager } from '@/components/profile/module-manager';
import { ShareActions } from '@/components/share-actions';
import { getAnigaView } from '@/lib/aniga/view';
import { getAuthContext } from '@/lib/auth/guards';
import { getLitePrefs } from '@/lib/lite/server';
import { getLocale, getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Aniga — the signed-in member's own profile (nav.profile). Fixes the Seq 29
 * dead tab: no profile row yet → a friendly set-up nudge instead of a 404.
 *
 * Same shell as /u/[handle] with `viewer="owner"`: the module column below the
 * bio, the module manager in the rail (the one surface that toggles and
 * reorders the whole set), and the owner's private stats beside it rather than
 * inside the column a visitor can share.
 */
export default async function OwnProfilePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/profile');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const [t, locale] = await Promise.all([getT(), getLocale()]);

  // Resolve own handle first (RLS row, cheap), then reuse the shared view.
  const { data: row } = await ctx.supabase
    .from('profiles')
    .select('handle')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle();

  if (!row) {
    return (
      <main className="xidig-auth">
        <h1 className="xidig-auth__title">{t('nav.profile')}</h1>
        <p>{t('profile.notSetUp')}</p>
        <p>
          <Link href="/settings/profile" className="xidig-button xidig-button--primary">
            {t('onboarding.completeProfile')} →
          </Link>
        </p>
      </main>
    );
  }

  // Own profile — pass the viewer id so the owner always sees their real
  // city/coords regardless of location_granularity (the privacy fold is for
  // OTHER members' views).
  const view = await getAnigaView(ctx.supabase, row.handle, ctx.appUser.id, t, locale);
  if (!view) redirect('/settings/profile');

  const profile = view.base.profile;

  // Owner-only completion nudge — this page is always the signed-in member's
  // own profile (viewer id passed above), so there is no leak surface. Mirrors
  // the input shape used on /u/[handle].
  const linkRows = Array.isArray(profile.links) ? profile.links.length : 0;

  // The owner's own profile honours Lite exactly like /u/[handle] does. Without
  // this the member who turned images off still paid for their own cover and
  // avatar every visit — the one surface they load most.
  const litePrefs = await getLitePrefs();

  return (
    <main>
      <LiteMediaProvider>
        <LiteShowAll />
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
        <AnigaProfile
          view={view}
          viewer="owner"
          prefs={litePrefs}
          actions={
            <>
              <Link href="/settings/profile" className="xidig-button xidig-button--secondary">
                {t('action.editProfile')}
              </Link>
              <ShareActions path={`/u/${profile.handle}`} text={profile.display_name} />
            </>
          }
          rail={
            <>
              <ModuleManager modules={view.modules} presentation="rail" />
              {/* Xogta sits between the manager and the private stats (ruled
                  11 Aug). It is the owner's only sight of two facts that decide
                  how they get FOUND: their lanes, and — mirrored — the location
                  a visitor actually sees, which this page otherwise never shows
                  them because the owner read path skips the privacy fold. */}
              <AnigaFacts facts={view.ownerFacts} />
              <AnigaPrivateStats stats={view.privateStats} variant="rail" />
            </>
          }
        />
      </LiteMediaProvider>
    </main>
  );
}
