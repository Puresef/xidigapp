import { ImageResponse } from 'next/og';

import { getPublicLabView } from '@/lib/labs-api';
import { CHROME_KEYS } from '@/lib/labs/labels';
import { LAB_SLUG_REGEX } from '@/lib/labs/schemas';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Space OG card (§28 WhatsApp-first growth loop) — what a shared /labs/[slug]
 * link shows in link previews. Mirrors the u/[handle] and l/[id] OG routes:
 * Node runtime (not edge), per-request ImageResponse, getPublicLabView as the
 * ONLY source. That projection is `visibility='public'`-only, so PRIVATE /
 * members-only Spaces resolve to null → the neutral brand fallback below;
 * private Space data can never leak into a public preview.
 *
 * Colors are literal hex mirrors of the globals.css tokens (Satori has no
 * CSS-variable support). Real brand art lands with the §26 Brand Guide.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Xidig';

const BG = '#ffffff';
const FG = '#131c2e';
const MUTED = '#556075';
const BORDER = '#d9e0ec';

/** The brand domain is a locale-invariant mark, not translatable copy. */
const BRAND_DOMAIN = 'xidig.net';

function brandFallback(brandMark: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BG,
          color: FG,
          fontSize: 96,
          fontWeight: 700,
        }}
      >
        {brandMark}
      </div>
    ),
    size,
  );
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getT();
  const brandMark = `✶ ${t('app.name')}`;

  // Non-matching slug OR a non-public Space → neutral brand card (no leak).
  const view = LAB_SLUG_REGEX.test(slug) ? await getPublicLabView(slug) : null;
  if (!view) return brandFallback(brandMark);

  const { lab, memberCount } = view;
  const name = lab.name ?? '';
  const mode = t(CHROME_KEYS[(lab.space_mode as 'club' | 'lab') ?? 'club']);
  const summary = lab.short_description ?? lab.problem_statement ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BG,
          color: FG,
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1056 }}>
          <div style={{ display: 'flex', fontSize: 34, color: MUTED, fontWeight: 700 }}>
            {mode}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: name.length > 32 ? 64 : 80,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {name}
          </div>
          {summary ? (
            <div
              style={{
                display: 'flex',
                fontSize: 38,
                color: MUTED,
                lineHeight: 1.3,
                maxHeight: 160,
                overflow: 'hidden',
              }}
            >
              {summary.length > 140 ? `${summary.slice(0, 137)}…` : summary}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: `2px solid ${BORDER}`,
            paddingTop: 32,
            fontSize: 40,
            fontWeight: 700,
          }}
        >
          <div style={{ display: 'flex' }}>{brandMark}</div>
          <div style={{ display: 'flex', color: MUTED, fontSize: 32 }}>
            {t('lab.memberCount', { count: memberCount })} · {BRAND_DOMAIN}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
