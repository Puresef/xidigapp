import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';

import { resolveInterstitialTarget } from '@/lib/embeds';
import { resolveError } from '@/lib/errors';
import { getT } from '@/lib/locale';

/**
 * Unknown-link warning interstitial (§15; PRD Relook §8 — an unsupported
 * embed must remain a usable link). Post links to non-allowlisted domains
 * arrive here through interstitialHref(). The member sees where the link goes
 * and chooses to continue: this page never redirects on its own. A `url` that
 * isn't an absolute http(s) link to another site gets §27 copy and no
 * outbound link at all.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    // Absolute: the "— Xidig" template suffix would read "You're leaving Xidig — Xidig".
    title: { absolute: t('plaza.interstitialTitle') },
    robots: { index: false, follow: false },
  };
}

export default async function OutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [t, params, requestHeaders] = await Promise.all([getT(), searchParams, headers()]);
  // A repeated ?url= is ambiguous — treat it like a missing one.
  const raw = typeof params.url === 'string' ? params.url : null;
  const target = resolveInterstitialTarget(raw, requestHeaders.get('host'));

  if (!target) {
    const error = resolveError('link_invalid', t);
    return (
      <main className="xidig-auth">
        <p>{error.message}</p>
        {error.cta ? <Link href={error.cta.href}>{error.cta.label} →</Link> : null}
      </main>
    );
  }

  return (
    <main className="xidig-auth xidig-interstitial">
      <h1 className="xidig-auth__title">{t('plaza.interstitialTitle')}</h1>
      <p className="xidig-interstitial__host">{target.host}</p>
      <p>{t('plaza.interstitialBody', { host: target.host })}</p>
      <p className="xidig-interstitial__url">{target.href}</p>
      <div className="xidig-interstitial__actions">
        <a
          className="xidig-button xidig-button--primary"
          href={target.href}
          rel="nofollow noopener noreferrer"
        >
          {t('plaza.interstitialContinue', { host: target.host })}
        </a>
        <Link className="xidig-button xidig-button--secondary" href="/plaza">
          {t('action.back')}
        </Link>
      </div>
    </main>
  );
}
