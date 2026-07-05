import Link from 'next/link';

import { Banner } from '@/components/banner';
import { isErrorCode, resolveError } from '@/lib/errors';
import { getT } from '@/lib/locale';

/**
 * Terminal auth errors that arrive by redirect (expired/invalid links,
 * suspended accounts) — §27 copy + the resolution CTA. ?from=recovery swaps
 * the CTA to the reset flow so an expired reset link leads back to a fresh
 * one, not to a magic link.
 */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getT();

  const reason = typeof params.reason === 'string' ? params.reason : 'magic_link_expired';
  const from = typeof params.from === 'string' ? params.from : undefined;

  const error = resolveError(isErrorCode(reason) ? reason : 'magic_link_expired', t);
  const cta =
    from === 'recovery' && reason === 'magic_link_expired'
      ? { label: t('action.resetPassword'), href: '/reset-password' }
      : error.cta;

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('auth.errorTitle')}</h1>
      <Banner kind="error">{error.message}</Banner>
      <div className="xidig-auth__meta">
        {cta ? <Link href={cta.href}>{cta.label} →</Link> : null}
        <Link href="/">{t('action.goHome')} →</Link>
      </div>
    </main>
  );
}
