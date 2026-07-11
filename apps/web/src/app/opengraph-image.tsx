import { ImageResponse } from 'next/og';

import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Site-default OG card (§28 WhatsApp-first growth loop): the link-preview
 * image for every route that has no OG route of its own — before this file
 * existed, a shared xidig.net link rendered as a bare URL with no card at
 * all. The entity pages (/u/[handle], /labs/[slug], /l/[id], /c/[id]) keep
 * their richer per-entity OG routes, which override this default.
 *
 * Mirrors those routes' neutral brand fallback: colors are literal hex
 * mirrors of the globals.css tokens (Satori has no CSS-variable support).
 * Real brand art lands with the §26 Brand Guide.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Xidig';

const BG = '#ffffff';
const FG = '#16181d';
const MUTED = '#5c6470';

/** The brand domain is a locale-invariant mark, not translatable copy. */
const BRAND_DOMAIN = 'xidig.net';

export default async function OpengraphImage() {
  const t = await getT();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
          color: FG,
          gap: 28,
        }}
      >
        <div style={{ fontSize: 120, fontWeight: 700 }}>{t('app.name')}</div>
        <div
          style={{
            fontSize: 40,
            color: MUTED,
            textAlign: 'center',
            maxWidth: 940,
          }}
        >
          {t('app.tagline')}
        </div>
        <div style={{ fontSize: 28, color: MUTED }}>{BRAND_DOMAIN}</div>
      </div>
    ),
    size,
  );
}
