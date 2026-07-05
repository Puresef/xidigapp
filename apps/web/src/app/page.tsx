import Link from 'next/link';

import { FollowingFeed } from '@/components/feed/following-feed';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';

// Per-request: the page renders a member Home (Following feed, §13) or the
// public welcome depending on the session.
export const dynamic = 'force-dynamic';

// Server component: strings resolve on the server via getT(). After a
// language switch, the toggle's router.refresh() re-renders this tree in the
// new locale while client components update instantly.
export default async function HomePage() {
  const t = await getT();
  const ctx = await getAuthContext();

  if (ctx) {
    return (
      <main>
        <h1 className="xidig-auth__title">{t('nav.home')}</h1>
        <h2 className="xidig-section__title">{t('feed.title')}</h2>
        <FollowingFeed />
      </main>
    );
  }

  return (
    <main>
      <h1>{t('home.welcome')}</h1>
      <p>{t('app.tagline')}</p>
      <Link href="/signup" className="xidig-button xidig-button--primary">
        {t('action.getStarted')}
      </Link>
    </main>
  );
}
