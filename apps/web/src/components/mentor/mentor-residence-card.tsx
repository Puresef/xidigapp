import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';

import { requireUser } from '@/lib/auth/guards';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { getCurrentMentor, getMentorSlots } from '@/lib/mentor/current';
import { getSupabaseServer } from '@/lib/supabase/server';

import { Avatar } from '../media/avatar';
import { MentorBookingIsland } from './mentor-booking-island';

/**
 * Frame 9c rail card ("La-taliye joogto ah — {period}"): the bookable
 * mentor-in-residence module for the Madal rail (Munaasabado Task 9; Task 10
 * mounts it). Self-fetching + quiet-when-empty, the SAME contract as the Home
 * card it sits beside (mentor-in-residence.tsx) — renders nothing without an
 * active residency, so a caller can drop `<MentorResidenceCard />` in with no
 * wiring.
 *
 * This is a SEPARATE component from mentor-in-residence.tsx on purpose: that
 * card is the Home "who's the mentor + how many Asks this week" summary and
 * stays untouched; this one is the Warshad-hosted booking flow.
 *
 * "Yours" is resolved entirely server-side before the client ever mounts:
 * `getMentorSlots` reads open/taken through the viewer's RLS client (the
 * booker identity column is grant-hidden) and adds `'yours'` via a
 * service-role check — see lib/mentor/current.ts. The client island below
 * receives only that already-resolved `state`, never an identity to compare.
 */
export async function MentorResidenceCard() {
  let mentor;
  let viewerId: string;
  let supabase: Awaited<ReturnType<typeof getSupabaseServer>>;
  try {
    const ctx = await requireUser();
    viewerId = ctx.appUser.id;
    supabase = await getSupabaseServer();
    mentor = await getCurrentMentor(supabase);
  } catch {
    return null;
  }

  if (!mentor) return null;

  const [slots, prefs] = await Promise.all([
    getMentorSlots(supabase, mentor.residencyId, viewerId),
    getLitePrefs(),
  ]);

  const t = await getT();
  // `period` is admin-typed free text (bodySchema.period, max 32) — only the
  // YYYY-MM shape earns a dictionary month name; anything else prints as-is
  // rather than guessing at a format the admin didn't use.
  const periodMatch = /^(\d{4})-(\d{2})$/.exec(mentor.period);
  const period = periodMatch
    ? t(`time.month${Number(periodMatch[2])}` as MessageKey)
    : mentor.period;

  const hasFacts = mentor.hoursNote !== null || mentor.labName !== null;

  return (
    // A plain card, not a landmark: the same silhouette as the events detail
    // page's individual aside cards (`.xidig-event-detail__card`, itself a
    // `<div>` — the surrounding `<aside>` landmark belongs to whichever rail
    // Task 10 mounts this in, so this component doesn't nest a second one).
    <div className="xidig-event-detail__card">
      <h2 className="xidig-event-detail__label">{t('mentor.residenceTitle', { period })}</h2>

      <Link href={`/u/${mentor.advisor.handle}`} className="xidig-event-host">
        <Avatar
          name={mentor.advisor.displayName}
          handle={mentor.advisor.handle}
          src={
            mentor.advisor.avatarPath
              ? publicMediaUrl(derivedThumbPath(mentor.advisor.avatarPath))
              : null
          }
          blurhash={mentor.advisor.avatarBlurhash}
          size={38}
          prefs={prefs}
        />
        <span className="xidig-event-host__lines">
          <span className="xidig-event-host__name">{mentor.advisor.displayName}</span>
          {mentor.focus ? <span className="xidig-event-host__stat">{mentor.focus}</span> : null}
        </span>
      </Link>

      {hasFacts ? (
        <dl className="xidig-event-facts">
          {mentor.hoursNote ? (
            <>
              <dt>{t('mentor.hoursLabel')}</dt>
              <dd>{mentor.hoursNote}</dd>
            </>
          ) : null}
          {mentor.labName ? (
            <>
              <dt>{t('mentor.hostLabel')}</dt>
              <dd>{mentor.labName}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <MentorBookingIsland slots={slots} />

      <p className="xidig-event-detail__note">
        {t('mentor.freeNote', { minutes: mentor.slotMinutes })}
      </p>
    </div>
  );
}

export default MentorResidenceCard;
