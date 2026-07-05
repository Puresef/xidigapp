'use client';

import Link from 'next/link';

import { useT } from '@xidig/i18n/react';

import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';

/**
 * Renders an API PlainError verbatim (§27: server-resolved copy + CTA).
 * Offline/proxy failures arrive with an empty message — fall back to the
 * generic §27 server error in the client locale.
 */
export function PlainErrorBanner({ error }: { error: PlainError }) {
  const t = useT();
  return (
    <Banner kind="error">
      {error.message || t('error.server')}
      {error.cta ? (
        <>
          {' '}
          <Link href={error.cta.href}>{error.cta.label} →</Link>
        </>
      ) : null}
    </Banner>
  );
}
