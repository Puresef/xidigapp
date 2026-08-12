import Link from 'next/link';

import { SystemNotice } from '@/components/system-notice';
import { getT } from '@/lib/locale';

/**
 * The dormancy state — m3.
 *
 * Ruling 2 put dormancy where it belongs: it is the EARLY WARNING that comes
 * before the stage timeout, not the timeout itself and not a punishment. So the
 * order of this block is the order of the reassurance:
 *
 *   1. nothing has changed — the stage, the members and the history are all
 *      exactly where they were, and one update brings the venture back;
 *   2. here is where you'd pick it up, with the two things that actually revive
 *      a space (write an update, call the members in);
 *   3. and only then, plainly, what happens if the quiet continues: the timeout
 *      returns the stage to Warshad automatically — a clear rule, notice in
 *      advance, a public log, and an appeal.
 *
 * The copy must not read as a threat, and the structure is what keeps it from
 * reading as one: the rule arrives last, as a footnote to an invitation, and it
 * arrives with the appeal attached. Nothing here is a countdown, because a
 * countdown is a threat with a clock on it.
 *
 * Deliberately NOT an `EmptyState`: that component mounts the mascot, and a
 * dormant venture is one step from a stage change on a money-critical space.
 * The system voice speaks here, calmly, with no character attached.
 */
export async function VentureDormantNotice({
  name,
  weeks,
  slug,
  canContribute,
}: {
  name: string;
  /** Whole weeks since the last activity — the sentence's own unit. */
  weeks: number;
  slug: string;
  /** Only a member can actually revive it; a visitor gets the notice alone. */
  canContribute: boolean;
}) {
  const t = await getT();
  return (
    <section className="xidig-section xidig-dormant">
      <SystemNotice tone="info" messageKey="maal.dormantNotice" params={{ name, count: weeks }} />

      {canContribute ? (
        <section className="xidig-card xidig-venture__card">
          <h2 className="xidig-venture__card-title">{t('maal.resumeTitle')}</h2>
          <div className="xidig-dormant__actions">
            <Link className="xidig-button xidig-button--primary" href={`/labs/${slug}?tab=updates`}>
              {t('maal.resumePostUpdate')}
            </Link>
            <Link
              className="xidig-button xidig-button--secondary"
              href={`/labs/${slug}?tab=members`}
            >
              {t('maal.resumeCallMembers')}
            </Link>
          </div>
        </section>
      ) : null}

      {/* The rule, last and with the appeal attached. */}
      <p className="xidig-dormant__footer">{t('maal.dormantFooter')}</p>
    </section>
  );
}
