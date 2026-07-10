import Link from 'next/link';

import { WaitlistForm } from '@/components/auth/waitlist-form';
import { countFoundingSpotsLeft } from '@/lib/front/organic';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

// Live Founding Member counter — always current, never cached.
export const dynamic = 'force-dynamic';

/**
 * Waitlist page (§9 beta gating + §20 Founding Member moment): live counter
 * of the 500 founding spots, the join form, and the invite-code path for
 * members who already hold a code. Front-door CTAs land here with
 * ?from=<page> for funnel attribution (docs/front-door-plan.md §5).
 */
export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getT();

  const params = await searchParams;
  const rawFrom = params.from;
  // Same shape the API enforces — anything else is dropped, not sanitized.
  const from =
    typeof rawFrom === 'string' && /^[a-z0-9/_-]{1,64}$/.test(rawFrom) ? rawFrom : undefined;

  let foundingSpotsLeft: number | null = null;
  try {
    // Organic-proof invariant (docs/front-door-plan.md §4): founding spots
    // count real people — the shared counter excludes AI/system accounts and
    // returns null (no counter) if the DB briefly isn't reachable.
    foundingSpotsLeft = await countFoundingSpotsLeft(getSupabaseAdmin());
  } catch {
    // Counter is a nice-to-have — the form must render even without service
    // credentials.
  }

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('waitlist.title')}</h1>
      <p>{t('waitlist.subtitle')}</p>
      {foundingSpotsLeft !== null && foundingSpotsLeft > 0 ? (
        <p className="xidig-banner xidig-banner--notice">
          {t('waitlist.foundingCounter', { count: foundingSpotsLeft })}
        </p>
      ) : null}
      <WaitlistForm {...(from ? { from } : {})} />
      <div className="xidig-auth__meta">
        <span>
          {t('waitlist.haveCode')} <Link href="/signup">{t('action.createAccount')} →</Link>
        </span>
        <Link href="/signin">{t('auth.haveAccount')} →</Link>
      </div>
    </main>
  );
}
