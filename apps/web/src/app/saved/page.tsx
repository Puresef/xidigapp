import Link from 'next/link';
import { redirect } from 'next/navigation';

import type { MessageKey } from '@xidig/i18n';

import { SavedList } from '@/components/social/saved-list';
import { getAuthContext } from '@/lib/auth/guards';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';
import type { BookmarkEntityType } from '@/lib/social/entities';

export const dynamic = 'force-dynamic';

/**
 * Saved (Phase 4.5): everything the member bookmarked, tabbed by entity type.
 * Tabs are links (?tab=) like the Plaza filters — shareable URLs, no JS needed
 * to switch. Candidate bookmarks exist at the API level but get no tab until
 * the Phase 5 Candidate UI ships.
 */

const TABS: ReadonlyArray<{ param: string; entity: BookmarkEntityType; labelKey: MessageKey }> = [
  { param: 'posts', entity: 'post', labelKey: 'saved.tabPosts' },
  { param: 'businesses', entity: 'listing', labelKey: 'saved.tabListings' },
  { param: 'spaces', entity: 'lab', labelKey: 'saved.tabLabs' },
];

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/saved');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const params = await searchParams;
  const active = TABS.find((tab) => tab.param === params.tab) ?? TABS[0]!;

  const t = await getT();
  const prefs = await getLitePrefs();

  return (
    <main className="xidig-section">
      <h1 className="xidig-auth__title">{t('saved.title')}</h1>

      <div className="xidig-tabs">
        {TABS.map((tab) => (
          <Link
            key={tab.param}
            className="xidig-tabs__tab"
            href={tab.param === 'posts' ? '/saved' : `/saved?tab=${tab.param}`}
            aria-current={tab.param === active.param ? 'page' : undefined}
          >
            {t(tab.labelKey)}
          </Link>
        ))}
      </div>

      <SavedList
        key={active.entity}
        type={active.entity}
        viewerId={ctx.appUser.id}
        prefs={prefs}
      />
    </main>
  );
}
