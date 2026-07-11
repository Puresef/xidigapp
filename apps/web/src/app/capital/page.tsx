import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import type { Enums } from '@xidig/db';
import type { MessageKey } from '@xidig/i18n';

import { CandidateCard } from '@/components/capital/candidate-card';
import { getAuthContext } from '@/lib/auth/guards';
import { listCandidates } from '@/lib/capital/views';
import { getT } from '@/lib/locale';
import { frontMetadata } from '@/lib/seo';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // Dual-mode route: the teaser title/description are mode-neutral — honest
  // pipeline framing that fits the member candidates list too (standard §2
  // F36); never invest language.
  const t = await getT();
  return frontMetadata({
    title: t('marketing.capitalTeaserTitle'),
    description: t('marketing.capitalTeaserBody'),
    path: '/capital',
  });
}

/**
 * Capital / Maal index (§17). Lists the candidates the viewer can read (RLS
 * scopes the fetch — draft/reviewers-only rows they lack access to simply don't
 * appear). Status filter tabs are shareable ?status= links (no JS). Capital has
 * NO bottom tab (§12) — this page is reached from the Labs area and candidate
 * permalinks. Teaching empty state explains what a Candidate is.
 */

const STATUSES = ['submitted', 'in_review', 'approved', 'parked', 'declined'] as const;
type StatusFilter = (typeof STATUSES)[number];

const STATUS_TAB_KEYS: Record<StatusFilter, MessageKey> = {
  submitted: 'capital.statusSubmitted',
  in_review: 'capital.statusInReview',
  approved: 'capital.statusApproved',
  parked: 'capital.statusParked',
  declined: 'capital.statusDeclined',
};

export default async function CapitalIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) {
    // Front-door teaser (Phase A): honest pipeline explanation, never invest
    // language (matches the /c/[id] public projection rule) — replaced by the
    // real public candidates list in Phase B (docs/front-door-plan.md §3/§4).
    const t = await getT();
    return (
      <main className="xidig-front">
        <section className="xidig-front__hero">
          <h1>{t('marketing.capitalTeaserTitle')}</h1>
          <p>{t('marketing.capitalTeaserBody')}</p>
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
  const requested = params.status;
  const status = STATUSES.find((s) => s === requested) as StatusFilter | undefined;

  const t = await getT();
  const admin = getSupabaseAdmin();
  const { items } = await listCandidates(
    ctx.supabase,
    admin,
    status ? { status: status as Enums<'candidate_status'> } : {},
  );

  return (
    <main className="xidig-section">
      <div className="xidig-card__header">
        <h1 className="xidig-auth__title">{t('capital.indexTitle')}</h1>
      </div>
      <p className="xidig-card__body">{t('capital.indexSubtitle')}</p>

      <div className="xidig-tabs">
        <Link
          className="xidig-tabs__tab"
          href="/capital"
          aria-current={!status ? 'page' : undefined}
        >
          {t('capital.filterAll')}
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            className="xidig-tabs__tab"
            href={`/capital?status=${s}`}
            aria-current={status === s ? 'page' : undefined}
          >
            {t(STATUS_TAB_KEYS[s])}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="xidig-card xidig-capital-empty">
          <h2 className="xidig-card__title">{t('capital.emptyTitle')}</h2>
          <p className="xidig-card__body">{t('capital.emptyBody')}</p>
          <p className="xidig-card__meta">
            <Link href="/labs">{t('capital.emptyLabsLink')} →</Link>
          </p>
        </div>
      ) : (
        <ul className="xidig-card-grid">
          {items.map((item) => (
            <li key={item.candidate.id}>
              <CandidateCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
