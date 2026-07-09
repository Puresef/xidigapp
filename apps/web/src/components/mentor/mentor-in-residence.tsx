import Link from 'next/link';

import { requireUser } from '@/lib/auth/guards';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getCurrentMentor } from '@/lib/mentor/current';
import { getT } from '@/lib/locale';

/**
 * Mentor-in-Residence featured slot (§20). Names the rotating verified Advisor
 * for the current period, their focus lane, a link to their profile, and the
 * §20 weekly commitment ("answered N Asks this week", display only).
 *
 * Renders nothing when there is no active residency, so it appears on Home only
 * when it's useful — same quiet-when-empty contract as the other Home modules.
 * Reads through the viewer's RLS client (every member may see the mentor).
 */
export async function MentorInResidence() {
  let mentor;
  try {
    // A signed-in member context is required to read mentor_residencies (RLS).
    await requireUser();
    const supabase = await getSupabaseServer();
    mentor = await getCurrentMentor(supabase);
  } catch {
    return null;
  }

  if (!mentor) return null;
  const t = await getT();

  return (
    <section className="xidig-section" aria-label={t('mentor.featuredTitle')}>
      <h2 className="xidig-section__title">{t('mentor.featuredTitle')}</h2>
      <div className="xidig-card">
        <div className="xidig-card__body">
          <Link href={`/u/${mentor.advisor.handle}`} className="xidig-card__title">
            {mentor.advisor.displayName}
          </Link>
          <p className="xidig-card__meta">@{mentor.advisor.handle}</p>
          {mentor.focus ? (
            <p className="xidig-card__meta">
              {t('mentor.focusLabel')} {mentor.focus}
            </p>
          ) : null}
          <p className="xidig-card__meta">
            {t('mentor.asksAnswered', { count: mentor.asksThisWeek })}
          </p>
        </div>
      </div>
    </section>
  );
}
