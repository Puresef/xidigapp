import { formatNumber, formatRelativeTime, type MessageKey } from '@xidig/i18n';

import type { AnigaMetrics } from '@/lib/aniga/view';
import { getLocale, getT } from '@/lib/locale';

/**
 * The owner's private numbers (spec §3.6, frames 5a/5c, state a4).
 *
 * These three counts exist because a member wants to know how they are doing;
 * they are not on the profile because nobody else's opinion of a member should
 * be shaped by a tally. So the block is dashed, lock-marked and explicitly
 * addressed — "Adiga kaliya ayaa arka" — and it renders for **nobody else**.
 *
 * Absence is structural, not conditional styling: `getAnigaView` returns
 * `privateStats: null` for every viewer but the owner, and this component
 * returns null on that. There is no visitor branch to get wrong, no hidden
 * node to un-hide in devtools, and no count in the visitor payload (A1).
 *
 * `cachedAt` is the offline shell's honesty (a4). A server render is fresh by
 * definition and passes null; a cached shell passes the age it really has, and
 * the line lands ABOVE the numbers — a reader learns the figures are old
 * before reading them, rather than after trusting them.
 */

/** Frame order (5a/5c), left to right. The rail spells the labels out. */
const STATS: ReadonlyArray<{
  grid: MessageKey;
  rail: MessageKey;
  of: (metrics: AnigaMetrics) => number;
}> = [
  { grid: 'profile.statPosts', rail: 'profile.statPostsPublished', of: (m) => m.posts },
  { grid: 'profile.statAsksHelped', rail: 'profile.statAsksYouHelped', of: (m) => m.asksHelped },
  { grid: 'profile.statConnections', rail: 'profile.statConnections', of: (m) => m.connections },
];

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  );
}

export interface AnigaPrivateStatsProps {
  /**
   * Owner-only. Null for every other viewer — and the component then emits no
   * DOM at all, which is the point of the prop being nullable rather than the
   * caller being trusted to omit the element.
   */
  stats: (AnigaMetrics & { cachedAt: string | null }) | null;
  /** 5a mobile 3-up (default) or the 5c desktop rail, which stacks the rows. */
  variant?: 'grid' | 'rail' | undefined;
}

export async function AnigaPrivateStats({ stats, variant = 'grid' }: AnigaPrivateStatsProps) {
  // Checked before `getT()`: the visitor path must cost nothing and reach
  // nothing. No wrapper, no aria-hidden node, no empty section.
  if (!stats) return null;

  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const labelOf = (stat: (typeof STATS)[number]) => t(variant === 'rail' ? stat.rail : stat.grid);

  return (
    <section
      className={variant === 'rail' ? 'xidig-aprivate xidig-aprivate--rail' : 'xidig-aprivate'}
    >
      <h2 className="xidig-aprivate__title">
        <LockGlyph />
        {t('profile.privateStatsTitle')}
      </h2>

      {/* a4 — the cache is stated, never papered over. The dictionary owns the
          age string (formatRelativeTime); the key only frames it. */}
      {stats.cachedAt ? (
        <p className="xidig-aprivate__cache">
          <time dateTime={stats.cachedAt}>
            {t('profile.cachedAge', { age: formatRelativeTime(new Date(stats.cachedAt), locale) })}
          </time>
        </p>
      ) : null}

      <ul className="xidig-aprivate__grid">
        {STATS.map((stat) => (
          <li key={stat.grid} className="xidig-aprivate__stat">
            {/* Tabular figures so the three columns line up and a number that
                changes doesn't shift the labels beside it. */}
            <b className="xidig-aprivate__value">{formatNumber(stat.of(stats), locale)}</b>
            <span className="xidig-aprivate__label">{labelOf(stat)}</span>
          </li>
        ))}
      </ul>

      <p className="xidig-aprivate__note">{t('profile.privateStatsNote')}</p>
    </section>
  );
}

export default AnigaPrivateStats;
