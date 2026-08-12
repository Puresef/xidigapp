import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { XidigIcon } from '@/components/icons/XidigIcon';
import { LabsFeed } from '@/components/labs/labs-feed';
import { getAuthContext } from '@/lib/auth/guards';
import { fetchLabCounts, fetchLabMembershipIds } from '@/lib/labs/views';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';
import { frontMetadata } from '@/lib/seo';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // Dual-mode route: generateMetadata runs for members too, so the teaser
  // title/description double as the signed-in tab title — the copy is
  // mode-neutral by design (standard §2 F36).
  const t = await getT();
  return frontMetadata({
    title: t('marketing.labsTeaserTitle'),
    description: t('marketing.labsTeaserBody'),
    path: '/labs',
  });
}

/**
 * Labs / Spaces Discover (§16). Filter tabs (All / Clubs / Labs / My Spaces) are
 * shareable ?filter= links — no JS to switch. The create action is a header
 * button (Capital lives inside Labs; create is not a nav tab).
 */

const FILTERS = ['all', 'clubs', 'labs', 'mine'] as const;
type Filter = (typeof FILTERS)[number];

export default async function LabsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) {
    // Front-door teaser (Phase A): anonymous visitors get an honest
    // explanation instead of a signin wall — replaced by the real public
    // Labs directory in Phase B (docs/front-door-plan.md §3/§4).
    const t = await getT();
    return (
      <main className="xidig-front">
        <section className="xidig-front__hero">
          <h1>{t('marketing.labsTeaserTitle')}</h1>
          <p>{t('marketing.labsTeaserBody')}</p>
          <p>{t('marketing.labsTeaserNote')}</p>
          <div className="xidig-front__cta-row">
            <Link href="/waitlist?from=labs" className="xidig-button xidig-button--primary">
              {t('marketing.requestAccess')}
            </Link>
          </div>
        </section>
      </main>
    );
  }
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const params = await searchParams;
  const requested = params.filter;
  const filter: Filter = FILTERS.find((f) => f === requested) ?? 'all';
  const mode = filter === 'clubs' ? 'club' : filter === 'labs' ? 'lab' : undefined;

  const t = await getT();
  const litePrefs = await getLitePrefs();

  // Tab counts under the CALLER's RLS (same helper GET /api/labs serves) —
  // the numbers can never reveal a Space this member cannot read.
  const admin = getSupabaseAdmin();
  const counts = await fetchLabCounts(
    ctx.supabase,
    await fetchLabMembershipIds(admin, ctx.appUser.id),
  );

  return (
    <main className="xidig-section">
      <div className="xidig-card__header">
        <h1 className="xidig-auth__title">{t('lab.listTitle')}</h1>
        <Link className="xidig-button xidig-button--primary" href="/labs/new">
          {t('lab.createCta')}
        </Link>
      </div>
      <p className="xidig-card__body">{t('lab.listSubtitle')}</p>

      {/* Maal entry (§12: Maal has no bottom tab — it lives here). /capital is
          the Maal index since F2 §5, so the pitch is maal.indexSubtitle and the
          glyph is the canon xidhmo sheaf: ruling 8 upholds the finance-imagery
          ban, and the rising-chart line this card used to carry was exactly
          that. The trust-orange treatment is unchanged and is flagged (F10) —
          DESIGN.md §2 still enumerates "Capital entry" as sanctioned orange,
          which predates the reframe from funding board to work organisation. */}
      <Link href="/capital" className="xidig-capital-entry">
        <span className="xidig-capital-entry__icon" aria-hidden="true">
          <XidigIcon name="maal" size={22} />
        </span>
        <span className="xidig-capital-entry__text">
          <span className="xidig-capital-entry__title">{t('capital.indexTitle')}</span>
          <span className="xidig-capital-entry__pitch">{t('maal.indexSubtitle')}</span>
        </span>
        <span className="xidig-capital-entry__cta">{t('capital.labsEntryLink')} →</span>
      </Link>

      <div className="xidig-tabs">
        <Link className="xidig-tabs__tab" href="/labs" aria-current={filter === 'all' ? 'page' : undefined}>
          {t('lab.tabWithCount', { label: t('lab.filterAll'), count: counts.all })}
        </Link>
        <Link
          className="xidig-tabs__tab"
          href="/labs?filter=clubs"
          aria-current={filter === 'clubs' ? 'page' : undefined}
        >
          {t('lab.tabWithCount', { label: t('lab.filterClubs'), count: counts.clubs })}
        </Link>
        <Link
          className="xidig-tabs__tab"
          href="/labs?filter=labs"
          aria-current={filter === 'labs' ? 'page' : undefined}
        >
          {t('lab.tabWithCount', { label: t('lab.filterLabs'), count: counts.labs })}
        </Link>
        <Link
          className="xidig-tabs__tab"
          href="/labs?filter=mine"
          aria-current={filter === 'mine' ? 'page' : undefined}
        >
          {t('lab.tabWithCount', { label: t('lab.filterMine'), count: counts.mine })}
        </Link>
      </div>

      <LabsFeed mode={mode} mine={filter === 'mine'} prefs={litePrefs} />
    </main>
  );
}
