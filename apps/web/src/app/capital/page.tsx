import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  DEFAULT_VENTURE_SORT,
  MaalIndexFilters,
  VENTURE_INDEX_FILTERS,
  VENTURE_INDEX_SORTS,
  type VentureIndexFilter,
  type VentureIndexSort,
} from '@/components/maal/index-filters';
import { MaalIndexEmpty } from '@/components/maal/index-empty';
import { MaalIndexList } from '@/components/maal/index-list';
import { getAuthContext } from '@/lib/auth/guards';
import { getLitePrefs } from '@/lib/lite/server';
import { getLocale, getT } from '@/lib/locale';
import { listVentureIndex } from '@/lib/maal/views';
import { frontMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // Describes the Maal index, which is what this route is since F2 §5. The old
  // marketing.capitalTeaser* pair ("venture candidates rise from Labs, get
  // reviewed, face a member vote") stayed with the board it describes, at
  // /capital/candidates. Never invest language, on either.
  const t = await getT();
  return frontMetadata({
    title: t('maal.teaserTitle'),
    description: t('maal.teaserBody'),
    path: '/capital',
  });
}

/**
 * The Maal index — frame 7a, plus states m1 (loading.tsx) and m2 (empty).
 *
 * `/capital` IS this screen (plan D1). `nav.capital` is the locked SO label
 * "Maal" and `/capital` is a locked rail destination, so the Maal index goes
 * where the rail already points and no nav lock is touched. The Phase-5
 * candidate board moved to `/capital/candidates` with its filters, its cards
 * and its loading shell intact — nothing was deleted, and the quiet link below
 * the list is what keeps it reachable.
 *
 * What this screen is, in one line: ONE list of staged work organisations,
 * with the stage as a badge rather than a separate tab. A Warshad and a Maal
 * sit in the same list on purpose — the footer law says why — so nobody's real
 * stage is hidden behind a filter nobody clicked.
 *
 * **A Koox is never here** (ruling 4). `listVentureIndex` filters `space_mode`
 * in the query, so a club is neither fetched nor counted; `MaalIndexList`
 * holds the same rule at its own boundary. Absence, not concealment.
 *
 * Lite: the only bytes on this surface are the facepile thumbs, which ride
 * `Avatar`'s `prefs` ladder (thumb → initials disc). There is no cover and no
 * icon image in frame 7a, so there is nothing else to defer — and nothing is
 * gated: every row, every count and the join verb are identical in Lite.
 */
export default async function MaalIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) {
    // Front-door teaser (Phase A): honest explanation of what a Maal IS, never
    // invest language (matches the /c/[id] public projection rule) — replaced by
    // the real public list in Phase B (docs/front-door-plan.md §3/§4).
    const t = await getT();
    return (
      <main className="xidig-front">
        <section className="xidig-front__hero">
          <h1>{t('maal.teaserTitle')}</h1>
          <p>{t('maal.teaserBody')}</p>
          <p className="xidig-banner xidig-banner--notice">{t('capital.securitiesDisclaimer')}</p>
          <div className="xidig-front__cta-row">
            <Link href="/waitlist?from=capital" className="xidig-button xidig-button--primary">
              {t('marketing.requestAccess')}
            </Link>
          </div>
        </section>
      </main>
    );
  }
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const params = await searchParams;
  const filter: VentureIndexFilter =
    VENTURE_INDEX_FILTERS.find((value) => value === params.filter) ?? 'all';
  const sort: VentureIndexSort =
    VENTURE_INDEX_SORTS.find((value) => value === params.sort) ?? DEFAULT_VENTURE_SORT;

  const [t, locale, prefs, { rows, counts }] = await Promise.all([
    getT(),
    getLocale(),
    getLitePrefs(),
    listVentureIndex(ctx, { filter }),
  ]);

  return (
    <main className="xidig-maal-index">
      <header className="xidig-maal-head">
        <span className="xidig-maal-head__lines">
          <h1 className="xidig-auth__title">{t('capital.indexTitle')}</h1>
          <p className="xidig-maal-head__sub">{t('maal.indexSubtitle')}</p>
        </span>
        <Link href="/labs/new" className="xidig-button xidig-button--primary xidig-maal-head__cta">
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5.5v13M5.5 12h13" />
          </svg>
          {t('maal.newLab')}
        </Link>
      </header>

      <MaalIndexFilters filter={filter} sort={sort} counts={counts} />

      {rows.length === 0 ? (
        <MaalIndexEmpty workingLabs={counts.labs} />
      ) : (
        <MaalIndexList rows={rows} prefs={prefs} locale={locale} />
      )}

      {/* Outside the branch on purpose: the candidate board must not become
          unreachable on the one screen that is empty. */}
      <p className="xidig-card__meta xidig-maal-index__candidates">
        <Link href="/capital/candidates">{t('maal.candidatesLink')} →</Link>
      </p>

      {/* The honest core of the screen, not decoration: what the stage is, how
          it is earned, and how it is lost. m2 states its own footer instead —
          an empty index has no stages to explain yet. */}
      {rows.length > 0 ? <p className="xidig-maal-index__law">{t('maal.indexLaw')}</p> : null}
    </main>
  );
}
