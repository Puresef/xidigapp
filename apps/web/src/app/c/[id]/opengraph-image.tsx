import { ImageResponse } from 'next/og';
import { z } from 'zod';

import { getPublicCandidateView } from '@/lib/capital/views';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Candidate OG card (§17 / §28) — the /c/[id] link preview. Mirrors the
 * u/[handle] and l/[id] OG routes (Node runtime, per-request ImageResponse).
 *
 * COMPLIANCE (locked this sprint): NO investment / returns / securities /
 * Maalgeli / "invest" language anywhere — safe globally regardless of region.
 * The ONLY source is getPublicCandidateView, the narrow build-in-public
 * projection (name + one-liner + safe pitch + lab ref; never ask/notes/votes/
 * invest). It returns null for draft / reviewers-only / non-public candidates,
 * so those resolve to the neutral brand fallback below — no private-candidate
 * leak. The card carries only name + one-liner + Lab name + branding.
 *
 * Colors are literal hex mirrors of the globals.css tokens (Satori has no
 * CSS-variable support).
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Xidig';

const idSchema = z.string().uuid();

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
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getT();
  const brandMark = `✶ ${t('app.name')}`;

  // Non-uuid OR a non-public candidate → neutral brand card (no leak, and no
  // invest language ever reaches the projection).
  const view = idSchema.safeParse(id).success
    ? await getPublicCandidateView(getSupabaseAdmin(), id)
    : null;
  if (!view) return brandFallback(brandMark);

  const name = view.name;
  const oneLiner = view.oneLiner;
  const labName = view.lab?.name ?? null;

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
          {labName ? (
            <div style={{ display: 'flex', fontSize: 34, color: MUTED, fontWeight: 700 }}>
              {labName}
            </div>
          ) : null}
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
          {oneLiner ? (
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
              {oneLiner.length > 140 ? `${oneLiner.slice(0, 137)}…` : oneLiner}
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
          <div style={{ display: 'flex', color: MUTED, fontSize: 32 }}>{BRAND_DOMAIN}</div>
        </div>
      </div>
    ),
    size,
  );
}
