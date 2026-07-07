import { ImageResponse } from 'next/og';

import { getT } from '@/lib/locale';
import { getPublicProfileView } from '@/lib/profile-view';
import { HANDLE_REGEX } from '@/lib/profiles';

/**
 * Profile OG card (§28 share pages, Phase 4.5). Uses the same PUBLIC
 * projection as the login-free page — location already rounded per the
 * member's granularity setting, avatar only if one is set (initials disc
 * otherwise, same deterministic palette as components/media/avatar.tsx).
 * Colors are the globals.css brand tokens; real brand styling lands with the
 * §26 Brand Guide.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Brand tokens (globals.css :root) — inlined because ImageResponse styles
// can't read CSS variables.
const BG = '#ffffff';
const FG = '#16181d';
const MUTED = '#5c6470';
const BORDER = '#d9dee5';

// Mirrors components/media/avatar.tsx (not imported: that module pulls the
// client blurhash decoder into this edge-safe bundle for no benefit here).
const AVATAR_PALETTE = [
  '#265e52',
  '#7a4a21',
  '#414f6b',
  '#6b3a55',
  '#2f6136',
  '#585048',
  '#31596b',
  '#5f4a75',
] as const;

function hashHandle(handle: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < handle.length; i++) {
    hash ^= handle.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase() || '•';
}

/** The brand domain is a locale-invariant mark, not translatable copy. */
const BRAND_DOMAIN = 'xidig.net';

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const t = await getT();
  const brandMark = `✶ ${t('app.name')}`;
  const view = HANDLE_REGEX.test(handle) ? await getPublicProfileView(handle) : null;

  // Unknown handle → plain brand card (the page itself 404s; crawlers that
  // still ask for the image get something neutral).
  if (!view) {
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

  const { profile, media } = view;
  const location = [profile.location_city, profile.location_country].filter(Boolean).join(', ');
  const discColor = AVATAR_PALETTE[hashHandle(profile.handle) % AVATAR_PALETTE.length] as string;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          {media.avatarUrl ? (
            <img
              src={media.avatarUrl}
              width={220}
              height={220}
              style={{ borderRadius: 9999, border: `4px solid ${BORDER}`, objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 220,
                height: 220,
                borderRadius: 9999,
                background: discColor,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 96,
                fontWeight: 700,
              }}
            >
              {initialsOf(profile.display_name)}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
            <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
              {profile.display_name}
            </div>
            <div style={{ fontSize: 40, color: MUTED }}>@{profile.handle}</div>
            {location ? <div style={{ fontSize: 36, color: MUTED }}>{location}</div> : null}
          </div>
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
