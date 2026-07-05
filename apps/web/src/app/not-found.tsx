import Link from 'next/link';

import { getT } from '../lib/locale';

// §27 "Not found": what happened · why · what to do next — in the member's
// language. Renders inside the root layout, so nav + toggle stay available.
export default async function NotFound() {
  const t = await getT();
  return (
    <main className="xidig-not-found">
      <p>{t('error.notFound')}</p>
      <Link href="/">{t('action.goHome')} →</Link>
    </main>
  );
}
