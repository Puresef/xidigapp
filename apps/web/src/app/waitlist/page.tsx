import Link from 'next/link';

import { WaitlistForm } from '@/components/auth/waitlist-form';
import { FOUNDING_MEMBER_CAP } from '@/lib/auth/constants';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

// Live Founding Member counter — always current, never cached.
export const dynamic = 'force-dynamic';

/**
 * Waitlist page (§9 beta gating + §20 Founding Member moment): live counter
 * of the 500 founding spots, the join form, and the invite-code path for
 * members who already hold a code.
 */
export default async function WaitlistPage() {
  const t = await getT();

  let foundingSpotsLeft: number | null = null;
  try {
    const admin = getSupabaseAdmin();
    const { count } = await admin.from('users').select('id', { count: 'exact', head: true });
    foundingSpotsLeft = Math.max(0, FOUNDING_MEMBER_CAP - (count ?? 0));
  } catch {
    // Counter is a nice-to-have — the form must render even if the DB briefly
    // isn't reachable.
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
      <WaitlistForm />
      <div className="xidig-auth__meta">
        <span>
          {t('waitlist.haveCode')} <Link href="/signup">{t('action.createAccount')} →</Link>
        </span>
        <Link href="/signin">{t('auth.haveAccount')} →</Link>
      </div>
    </main>
  );
}
