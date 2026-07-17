import { blurhashAverageColor, isBlurhashValid } from '@/lib/media/blurhash';
import type { LitePrefs } from '@/lib/lite/prefs';

/**
 * Avatar (§22 low-bandwidth identity, Phase 4.5). Server-safe (no hooks) so
 * directory cards / feeds / DMs can render it in RSC and client trees alike.
 *
 * Rendering ladder:
 *   - no `src` → 0-byte initials disc: first letters of the display name on
 *     a deterministic duotone gradient (handle hash over the 8 brand pairs
 *     below); when a blurhash exists the disc is instead a FLAT darkened
 *     average-color wash so the fallback carries the real photo's tone.
 *   - `src` + prefs.smallAvatars (or no prefs) → the image (callers pass the
 *     THUMB url — `publicMediaUrl(thumb_path)`, <8KB by the 96px pipeline).
 *   - `src` but prefs.smallAvatars === false (Lite "text only") → initials.
 */

/**
 * Duotone gradient pairs from the brand family (brand-rethink adoption,
 * 17 Jul 2026): rich by default, still zero bytes, still deterministic.
 * White initials must hold WCAG ≥ 4.5:1 against BOTH stops of every pair
 * (initials render ~15–17px semibold → normal-text threshold); enforced as a
 * regression gate in avatar.test.tsx.
 */
export const AVATAR_PALETTE = [
  { from: '#2a72ab', to: '#20598a' }, // somali blue (deepened #2E78B0)
  { from: '#0f7d6c', to: '#0d6357' }, // teal
  { from: '#5563a8', to: '#4a5591' }, // indigo / slate
  { from: '#8d4d88', to: '#7b427a' }, // plum
  { from: '#317d46', to: '#276939' }, // forest
  { from: '#8f5d1f', to: '#784b18' }, // warm amber-brown
  { from: '#a03a53', to: '#93364e' }, // burgundy
  { from: '#52708b', to: '#425c74' }, // steel
] as const;

function hashHandle(handle: string): number {
  // FNV-1a over UTF-16 code units — stable across server and client.
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

export function Avatar({
  name,
  handle,
  src,
  blurhash,
  size = 40,
  prefs,
  className,
}: {
  name: string;
  handle: string;
  /** Thumb (preferred) or full public URL; absent → initials. */
  src?: string | null | undefined;
  blurhash?: string | null | undefined;
  /** Rendered box in px (CSS pixels; the disc is always round). */
  size?: number;
  /** Viewer Lite prefs; omit on surfaces that always load avatars. */
  prefs?: LitePrefs | undefined;
  className?: string | undefined;
}) {
  const showImage = Boolean(src) && (prefs?.smallAvatars ?? true);
  const dimension = Math.max(16, Math.round(size));
  const rootClass = ['xidig-avatar', className].filter(Boolean).join(' ');

  if (showImage) {
    return (
      <span className={rootClass} style={{ width: dimension, height: dimension }}>
        <img src={src as string} alt={name} width={dimension} height={dimension} loading="lazy" />
      </span>
    );
  }

  // Deterministic duotone disc; a blurhash instead flat-tints toward the photo.
  const pair = AVATAR_PALETTE[
    hashHandle(handle) % AVATAR_PALETTE.length
  ] as (typeof AVATAR_PALETTE)[number];
  let background = `linear-gradient(135deg, ${pair.from}, ${pair.to})`;
  if (blurhash && isBlurhashValid(blurhash)) {
    const [r, g, b] = blurhashAverageColor(blurhash);
    // Darken toward AA so the white initials stay readable on light photos.
    background = `rgb(${Math.round(r * 0.6)}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.6)})`;
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={`${rootClass} xidig-avatar--initials`}
      style={{
        width: dimension,
        height: dimension,
        background,
        fontSize: Math.max(10, Math.round(dimension * 0.42)),
      }}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  );
}
