import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';

import { getT } from '@/lib/locale';
import type { VentureIndexQuery } from '@/lib/maal/schemas';
import type { VentureIndexCounts } from '@/lib/maal/views';

/**
 * Frame 7a's control row: the four stage/membership chips with live counts,
 * and the sort rule beside them.
 *
 * Both are plain `?filter=` / `?sort=` links, exactly like `/labs?filter=` and
 * `/events?tab=` — a filtered index is shareable, bookmarkable and works with
 * no JavaScript at all. The two params compose: changing the filter keeps the
 * sort and vice versa, because a member who shared a URL shared both choices.
 *
 * Counts come from the loader under the CALLER's RLS, so a chip can never
 * reveal a space the viewer cannot read — and "Dhammaan · 24" over a list of 23
 * rows is the bug the member notices before we do.
 *
 * The sort control publishes ONE rule today (Firfircoonida — most recently
 * active first) and is rendered as the selected option rather than as a menu
 * pretending there are others. It is a real, routed control so a second rule is
 * a data change rather than a redesign, and so the ordering is stated in the UI
 * next to the list — DESIGN.md §4's chronological-honesty clause, which is why
 * this row exists at all instead of an unlabelled implicit order.
 */

export type VentureIndexFilter = VentureIndexQuery['filter'];

export const VENTURE_INDEX_FILTERS = ['all', 'ventures', 'labs', 'mine'] as const;

/** The published sort rules. One today; the control is built for the second. */
export const VENTURE_INDEX_SORTS = ['activity'] as const;

export type VentureIndexSort = (typeof VENTURE_INDEX_SORTS)[number];

export const DEFAULT_VENTURE_SORT: VentureIndexSort = 'activity';

const CHIP_KEYS: Record<VentureIndexFilter, MessageKey> = {
  all: 'maal.chipAll',
  ventures: 'maal.chipVentures',
  labs: 'maal.chipLabs',
  mine: 'maal.chipMine',
};

const SORT_KEYS: Record<VentureIndexSort, MessageKey> = {
  activity: 'maal.sortActivity',
};

/** `/capital?filter=…&sort=…`, with defaults left out of the URL. */
export function maalIndexHref(filter: VentureIndexFilter, sort: VentureIndexSort): string {
  const query = new URLSearchParams();
  if (filter !== 'all') query.set('filter', filter);
  if (sort !== DEFAULT_VENTURE_SORT) query.set('sort', sort);
  const qs = query.toString();
  return qs ? `/capital?${qs}` : '/capital';
}

export async function MaalIndexFilters({
  filter,
  sort,
  counts,
}: {
  filter: VentureIndexFilter;
  sort: VentureIndexSort;
  counts: VentureIndexCounts;
}) {
  const t = await getT();
  const countFor: Record<VentureIndexFilter, number> = {
    all: counts.all,
    ventures: counts.ventures,
    labs: counts.labs,
    mine: counts.mine,
  };

  return (
    <div className="xidig-maal-controls">
      <nav className="xidig-maal-filters" aria-label={t('capital.indexTitle')}>
        {VENTURE_INDEX_FILTERS.map((value) => (
          <Link
            key={value}
            href={maalIndexHref(value, sort)}
            className="xidig-tag"
            aria-current={filter === value ? 'page' : undefined}
          >
            {t(CHIP_KEYS[value], { count: countFor[value] })}
          </Link>
        ))}
      </nav>
      <div className="xidig-maal-sort">
        <span className="xidig-maal-sort__label">{t('maal.sortLabel')}</span>
        {VENTURE_INDEX_SORTS.map((value) => (
          <Link
            key={value}
            href={maalIndexHref(filter, value)}
            className="xidig-tag"
            aria-current={sort === value ? 'true' : undefined}
          >
            {t(SORT_KEYS[value])}
          </Link>
        ))}
      </div>
    </div>
  );
}
