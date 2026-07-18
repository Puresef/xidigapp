import { ImageResponse } from 'next/og';

import { createTranslator } from '@xidig/i18n';

/**
 * Site-default OG card (§28 WhatsApp-first growth loop): the link-preview
 * image for every route that has no OG route of its own. The entity pages
 * (/u/[handle], /labs/[slug], /l/[id], /c/[id]) keep their richer per-entity
 * OG routes, which override this default.
 *
 * Build-time static + bilingual (front-door standard §2 F33): no request
 * APIs, so Next renders this ONCE at build — preview bots never pay the
 * dynamic-origin TTFB, and URL-keyed preview caches can't freeze a stale
 * language variant because both locales ship stacked on the one card
 * (Somali first — the default locale). Strings come from the locked
 * dictionaries via locale-pinned translators, never from the request.
 * No live numbers here, ever: preview caches freeze them into fakes.
 *
 * Mirrors the entity routes' neutral brand fallback: colors are literal hex
 * mirrors of the globals.css tokens (Satori has no CSS-variable support).
 * Real brand art lands with the §26 Brand Guide.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Xidig';

const BG = '#ffffff';
const FG = '#131c2e';
const MUTED = '#556075';

/** The brand domain is a locale-invariant mark, not translatable copy. */
const BRAND_DOMAIN = 'xidig.net';

// Locale-pinned translators — a static import of both dictionaries' locked
// strings, resolved with zero request context.
const tSo = createTranslator('so');
const tEn = createTranslator('en');

export default function OpengraphImage() {
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
          gap: 30,
        }}
      >
        <div style={{ fontSize: 116, fontWeight: 700 }}>{tSo('app.name')}</div>
        <div
          style={{
            fontSize: 38,
            color: MUTED,
            textAlign: 'center',
            maxWidth: 1000,
          }}
        >
          {tSo('app.tagline')}
        </div>
        <div
          style={{
            fontSize: 30,
            color: MUTED,
            textAlign: 'center',
            maxWidth: 1000,
          }}
        >
          {tEn('app.tagline')}
        </div>
        <div style={{ fontSize: 26, color: MUTED }}>{BRAND_DOMAIN}</div>
      </div>
    ),
    size,
  );
}
