import { blurhashAverageColor, isBlurhashValid } from '@/lib/media/blurhash';
import type { LitePrefs } from '@/lib/lite/prefs';

/**
 * Avatar (§22 low-bandwidth identity, Phase 4.5). Server-safe (no hooks) so
 * directory cards / feeds / DMs can render it in RSC and client trees alike.
 *
 * Rendering ladder:
 *   - no `src` → 0-byte initials disc: first letters of the display name on
 *     a deterministic background (handle hash over a small brand-token
 *     palette, tinted by the blurhash average color when one exists).
 *   - `src` + prefs.smallAvatars (or no prefs) → the image (callers pass the
 *     THUMB url — `publicMediaUrl(thumb_path)`, <8KB by the 96px pipeline).
 *   - `src` but prefs.smallAvatars === false (Lite "text only") → initials.
 */

/** Muted, AA-contrast-with-white discs; real brand palette lands with §26. */
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

  // Deterministic disc color; a blurhash tints it toward the real photo.
  let background: string = AVATAR_PALETTE[hashHandle(handle) % AVATAR_PALETTE.length] as string;
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
