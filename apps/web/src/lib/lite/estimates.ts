import type { EmbedProvider } from '@/lib/embeds';

/**
 * Fallback byte estimates for Lite placeholders (§22, Phase 4.5). Used when
 * the real asset weight is unknown: images usually carry their true
 * media_uploads.bytes, but embeds/maps pull in third-party payloads we can
 * only approximate. Estimates feed the "~size" label on the placeholder and
 * the savings counter — order of magnitude honesty, not billing accuracy.
 */

/** Third-party player + script weight per provider (first load, approximate). */
export const EMBED_EST_BYTES: Record<EmbedProvider, number> = {
  youtube: 900_000,
  vimeo: 700_000,
  tiktok: 1_200_000,
  x: 600_000,
  instagram: 1_000_000,
};

export const EMBED_EST_DEFAULT_BYTES = 900_000;

/** Leaflet + one screenful of raster tiles. */
export const MAP_EST_BYTES = 350_000;

/** A post image when its media_uploads.bytes is unknown (legacy rows). */
export const IMAGE_EST_FALLBACK_BYTES = 250_000;

export function estimateEmbedBytes(provider: EmbedProvider | null | undefined): number {
  return (provider && EMBED_EST_BYTES[provider]) || EMBED_EST_DEFAULT_BYTES;
}

/**
 * Human-readable size in the viewer's locale ("350 KB", "1.2 MB"). Uses
 * Intl unit formatting so the unit symbol localizes with the number; falls
 * back to a plain `KB` suffix on runtimes without unit support.
 */
export function formatBytes(bytes: number, locale: string): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const inMb = safe >= 1_000_000;
  const value = inMb ? safe / 1_000_000 : safe / 1_000;
  const rounded = inMb ? Math.round(value * 10) / 10 : Math.max(1, Math.round(value));
  try {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: inMb ? 'megabyte' : 'kilobyte',
      unitDisplay: 'short',
      maximumFractionDigits: inMb ? 1 : 0,
    }).format(rounded);
  } catch {
    return `${rounded} ${inMb ? 'MB' : 'kB'}`;
  }
}
