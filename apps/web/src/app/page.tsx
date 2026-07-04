import { Button } from '@xidig/ui';

import { getT } from '../lib/locale';

// Server component: strings resolve on the server via getT(). After a
// language switch, the toggle's router.refresh() re-renders this tree in the
// new locale while client components update instantly.
export default async function HomePage() {
  const t = await getT();
  return (
    <main>
      <h1>{t('home.welcome')}</h1>
      <p>{t('app.tagline')}</p>
      <p>
        {t('home.communityProof')} {t('action.garabCount', { count: 142 })}
      </p>
      <Button variant="primary">{t('action.getStarted')}</Button>
    </main>
  );
}
