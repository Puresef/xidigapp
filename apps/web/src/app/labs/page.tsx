import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LabsFeed } from '@/components/labs/labs-feed';
import { getAuthContext } from '@/lib/auth/guards';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

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
  if (!ctx) redirect('/signin?next=/labs');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const params = await searchParams;
  const requested = params.filter;
  const filter: Filter = FILTERS.find((f) => f === requested) ?? 'all';
  const mode = filter === 'clubs' ? 'club' : filter === 'labs' ? 'lab' : undefined;

  const t = await getT();
  const litePrefs = await getLitePrefs();

  return (
    <main className="xidig-section">
      <div className="xidig-card__header">
        <h1 className="xidig-auth__title">{t('lab.listTitle')}</h1>
        <Link className="xidig-button xidig-button--primary" href="/labs/new">
          {t('lab.createCta')}
        </Link>
      </div>
      <p className="xidig-card__body">{t('lab.listSubtitle')}</p>

      {/* Capital / Maal entry (§12: Capital has no bottom tab — it lives here). */}
      <p className="xidig-card__meta">
        <Link href="/capital">{t('capital.labsEntryLink')} →</Link>
      </p>

      <div className="xidig-tabs">
        <Link className="xidig-tabs__tab" href="/labs" aria-current={filter === 'all' ? 'page' : undefined}>
          {t('lab.filterAll')}
        </Link>
        <Link
          className="xidig-tabs__tab"
          href="/labs?filter=clubs"
          aria-current={filter === 'clubs' ? 'page' : undefined}
        >
          {t('lab.filterClubs')}
        </Link>
        <Link
          className="xidig-tabs__tab"
          href="/labs?filter=labs"
          aria-current={filter === 'labs' ? 'page' : undefined}
        >
          {t('lab.filterLabs')}
        </Link>
        <Link
          className="xidig-tabs__tab"
          href="/labs?filter=mine"
          aria-current={filter === 'mine' ? 'page' : undefined}
        >
          {t('lab.filterMine')}
        </Link>
      </div>

      <LabsFeed mode={mode} mine={filter === 'mine'} prefs={litePrefs} />
    </main>
  );
}
