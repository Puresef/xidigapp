import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { getT } from '@/lib/locale';

/**
 * State m2 — the Maal index with nothing to list.
 *
 * Teaching, not apologising: it says where ventures come from (a Warshad,
 * first), points at the one place you can act on that, and closes with the
 * honest count of Warshado working right now — followed immediately by the
 * sentence that stops the count reading as a target ("Midkoodna kuma khasbana
 * inuu Maal noqdo"). The stage is a stage, not a leaderboard.
 *
 * The mark is ALLOWED here. The Maal index is a warm surface — it is the money
 * -critical ledger and capital components that are mascot-forbidden, and this
 * is neither.
 */
export async function MaalIndexEmpty({ workingLabs }: { workingLabs: number }) {
  const t = await getT();
  return (
    <>
      <EmptyState
        titleKey="maal.emptyTitle"
        messageKey="maal.emptyBody"
        action={
          <Link href="/labs" className="xidig-button xidig-button--primary">
            {t('maal.emptyCta')}
          </Link>
        }
      />
      <p className="xidig-maal-index__law">{t('maal.emptyFooter', { count: workingLabs })}</p>
    </>
  );
}
