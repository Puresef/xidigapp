import { redirect } from 'next/navigation';

import { ProfileForm, type ProfileSnapshot } from '@/components/profile/profile-form';
import {
  ProfileMediaEditor,
  type ProfileMediaSnapshot,
} from '@/components/profile/profile-media-editor';
import { PinsPicker } from '@/components/profile/pins-picker';
import { getAuthContext } from '@/lib/auth/guards';
import { LANES } from '@/lib/lanes';
import { getLocale, getT } from '@/lib/locale';
import { loadOpenTo, PROFILE_MEMBER_COLUMNS, profileMediaView } from '@/lib/profile-view';

// Per-request auth + own-profile snapshot.
export const dynamic = 'force-dynamic';

/**
 * Profile editor (§10 fields save; §20 complete-profile step). Lives at
 * /settings/profile — the exact href the §27 `profile_incomplete` CTA has
 * pointed at since the error catalog shipped. Creating and editing are the
 * same PUT (upsert semantics in /api/me/profile).
 *
 * Phase 4.5: avatar/cover editor (media identity), "open to" chips in the
 * form, and the pins picker. Media + pins only appear once the profile row
 * exists — both attach to it.
 */
export default async function ProfileSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/settings/profile');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');
  if (ctx.appUser.status === 'deactivated' || ctx.appUser.status === 'deleted') redirect('/');

  const t = await getT();
  const locale = await getLocale();

  // Lanes catalog: the DB lookup table is the runtime source (ops can extend it
  // without a deploy); fall back to the shipped const if the fetch comes back
  // empty so the picker is never blank.
  const { data: laneRows } = await ctx.supabase
    .from('lanes')
    .select('slug, name_en, name_so')
    .eq('is_active', true)
    .order('position');
  const laneCatalog =
    laneRows && laneRows.length > 0
      ? laneRows.map((row) => ({
          slug: row.slug,
          label: locale === 'so' ? row.name_so : row.name_en,
        }))
      : LANES.map((slug) => ({ slug, label: slug }));

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select(PROFILE_MEMBER_COLUMNS)
    .eq('user_id', ctx.appUser.id)
    .maybeSingle();

  const snapshot = (profile as unknown as ProfileSnapshot | null) ?? null;
  const openTo = profile ? await loadOpenTo(ctx.supabase, ctx.appUser.id) : [];

  let mediaSnapshot: ProfileMediaSnapshot | null = null;
  if (snapshot) {
    const media = profileMediaView(
      profile as unknown as {
        avatar_path?: string | null;
        avatar_blurhash?: string | null;
        cover_path?: string | null;
        cover_blurhash?: string | null;
      },
    );
    mediaSnapshot = {
      displayName: snapshot.display_name,
      handle: snapshot.handle,
      avatarThumbUrl: media.avatarThumbUrl,
      avatarBlurhash: media.avatarBlurhash,
      coverUrl: media.coverUrl,
    };
  }

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('action.editProfile')}</h1>
      {mediaSnapshot ? <ProfileMediaEditor snapshot={mediaSnapshot} /> : null}
      <ProfileForm snapshot={snapshot} initialOpenTo={openTo} laneCatalog={laneCatalog} />
      {snapshot ? <PinsPicker /> : null}
    </main>
  );
}
