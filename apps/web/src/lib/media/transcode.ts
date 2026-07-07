import sharp from 'sharp';

import { encode as encodeBlurhash } from '@/lib/media/blurhash';
import { IMAGE_MAX_BYTES, IMAGE_MAX_DIMENSION } from '@/lib/plaza/constants';

/**
 * Image transcode pipeline (§15 media): every accepted upload is re-encoded
 * to WebP before storage. The re-encode is the privacy boundary — sharp never
 * copies metadata unless asked (`.withMetadata()` is deliberately absent), so
 * EXIF/GPS is stripped by construction. `.rotate()` runs FIRST to bake the
 * EXIF orientation into the pixels before that orientation tag is dropped.
 *
 * Format trust: the client mime type is never consulted — sharp sniffs the
 * real container from the bytes and only jpeg/png/gif/webp pass. GIF memes
 * keep their animation (`animated: true` decodes all frames into the WebP).
 */

const SUPPORTED_FORMATS = ['jpeg', 'png', 'gif', 'webp'] as const;

export type SupportedImageFormat = (typeof SUPPORTED_FORMATS)[number];

export const WEBP_QUALITY = 82;
/** One retry at lower quality before giving up on oversized output (§15). */
export const WEBP_RETRY_QUALITY = 60;

export type TranscodeFailure = 'unsupported_format' | 'too_large';

/** Typed failure so the API route can map reasons to §27 error codes. */
export class TranscodeError extends Error {
  constructor(public readonly reason: TranscodeFailure) {
    super(`transcode failed: ${reason}`);
    this.name = 'TranscodeError';
  }
}

export interface TranscodeResult {
  /** WebP bytes, ≤ IMAGE_MAX_BYTES, metadata-free. */
  data: Buffer;
  width: number | null;
  height: number | null;
}

/** Pure check over sharp's sniffed format string — never trust client mime. */
export function sniffImageFormat(format: string | null | undefined): SupportedImageFormat | null {
  return (SUPPORTED_FORMATS as readonly string[]).includes(format ?? '')
    ? (format as SupportedImageFormat)
    : null;
}

interface ResizeSpec {
  width: number;
  height: number;
  fit: 'inside' | 'cover';
}

function encodeWithSpec(
  input: Buffer,
  quality: number,
  spec: ResizeSpec,
  animated: boolean,
): Promise<Buffer> {
  return (
    sharp(input, { animated })
      // Bake EXIF orientation into pixels BEFORE the tag is dropped.
      .rotate()
      .resize({
        width: spec.width,
        height: spec.height,
        fit: spec.fit,
        // 'inside' never upscales; 'cover' kinds (square avatars/icons) may,
        // so a small source still yields the promised square.
        withoutEnlargement: spec.fit === 'inside',
      })
      .webp({ quality, effort: 4 })
      .toBuffer()
  );
}

function encode(input: Buffer, quality: number): Promise<Buffer> {
  return encodeWithSpec(
    input,
    quality,
    { width: IMAGE_MAX_DIMENSION, height: IMAGE_MAX_DIMENSION, fit: 'inside' },
    true,
  );
}

/**
 * Buffer in → WebP buffer out. Throws TranscodeError('unsupported_format')
 * for non-image / unsupported / corrupt payloads and
 * TranscodeError('too_large') when even the quality-60 retry exceeds
 * IMAGE_MAX_BYTES.
 */
export async function transcodeToWebp(input: Buffer): Promise<TranscodeResult> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(input).metadata());
  } catch {
    throw new TranscodeError('unsupported_format');
  }
  if (!sniffImageFormat(format)) throw new TranscodeError('unsupported_format');

  let data: Buffer;
  try {
    data = await encode(input, WEBP_QUALITY);
    if (data.byteLength > IMAGE_MAX_BYTES) {
      data = await encode(input, WEBP_RETRY_QUALITY);
    }
  } catch {
    // Sniff passed but decode failed → truncated/corrupt image data.
    throw new TranscodeError('unsupported_format');
  }
  if (data.byteLength > IMAGE_MAX_BYTES) throw new TranscodeError('too_large');

  // Read dimensions from the OUTPUT: for animated input the pre-resize input
  // metadata reports the concatenated frame stack, not the display size.
  const output = await sharp(data).metadata();
  return { data, width: output.width ?? null, height: output.height ?? null };
}

// ============================================================================
// Phase 4.5 — per-kind pipeline (media_kinds lookup): main WebP + small thumb
// + blurhash. docs/lite-mode.md carries the size table.
// ============================================================================

/** Mirrors the media_kinds lookup seeds (migration 20260706300000). */
export const MEDIA_KINDS = [
  'post',
  'avatar',
  'cover',
  'listing_photo',
  'space_icon',
  'space_cover',
  'candidate_logo',
  'candidate_cover',
  'block',
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export function isMediaKind(value: string): value is MediaKind {
  return (MEDIA_KINDS as readonly string[]).includes(value);
}

const SQUARE_ICON = {
  main: { width: 512, height: 512, fit: 'cover' },
  thumb: { width: 96, height: 96, fit: 'cover' },
} as const satisfies { main: ResizeSpec; thumb: ResizeSpec };

const WIDE_COVER = {
  main: { width: 1600, height: 600, fit: 'inside' },
  thumb: { width: 480, height: 480, fit: 'inside' },
} as const satisfies { main: ResizeSpec; thumb: ResizeSpec };

const CONTENT_IMAGE = {
  main: { width: IMAGE_MAX_DIMENSION, height: IMAGE_MAX_DIMENSION, fit: 'inside' },
  thumb: { width: 480, height: 480, fit: 'inside' },
} as const satisfies { main: ResizeSpec; thumb: ResizeSpec };

const KIND_SPECS: Record<MediaKind, { main: ResizeSpec; thumb: ResizeSpec }> = {
  post: CONTENT_IMAGE,
  avatar: SQUARE_ICON,
  cover: WIDE_COVER,
  listing_photo: CONTENT_IMAGE,
  space_icon: SQUARE_ICON,
  space_cover: WIDE_COVER,
  candidate_logo: SQUARE_ICON,
  candidate_cover: WIDE_COVER,
  block: CONTENT_IMAGE,
};

/** Only content images keep GIF animation; identity/cover art is stills. */
const ANIMATED_KINDS: ReadonlySet<MediaKind> = new Set(['post', 'block']);

export const THUMB_WEBP_QUALITY = 70;

export interface KindTranscodeResult {
  /** Main WebP, ≤ IMAGE_MAX_BYTES, metadata-free. */
  buffer: Buffer;
  /** Small WebP variant (stored at `{userId}/{uuid}_thumb.webp`). */
  thumbBuffer: Buffer;
  /** Blurhash of the main output; null when the encode fails (fail-soft). */
  blurhash: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Blurhash from raw pixels at ≤32px (§22 Lite placeholders). Fail-soft: a
 * blurhash is decoration — its absence must never block an upload.
 */
async function blurhashOf(mainWebp: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(mainWebp)
      .resize({ width: 32, height: 32, fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return encodeBlurhash(new Uint8Array(data), info.width, info.height, 4, 3);
  } catch (error) {
    console.error('[media] blurhash encode failed:', error);
    return null;
  }
}

/**
 * Buffer in → per-kind `{ buffer, thumbBuffer, blurhash, width, height }`.
 * Same trust boundary as transcodeToWebp: sniffed format only, re-encode
 * strips EXIF/GPS, TranscodeError maps to the §27 error codes. The thumb and
 * blurhash derive from the MAIN OUTPUT (already sanitized; for animated
 * WebP sharp reads the first frame, which is exactly what a thumb wants).
 */
export async function transcodeMediaKind(
  input: Buffer,
  kind: MediaKind,
): Promise<KindTranscodeResult> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(input).metadata());
  } catch {
    throw new TranscodeError('unsupported_format');
  }
  if (!sniffImageFormat(format)) throw new TranscodeError('unsupported_format');

  const spec = KIND_SPECS[kind];
  const animated = ANIMATED_KINDS.has(kind);

  let data: Buffer;
  try {
    data = await encodeWithSpec(input, WEBP_QUALITY, spec.main, animated);
    if (data.byteLength > IMAGE_MAX_BYTES) {
      data = await encodeWithSpec(input, WEBP_RETRY_QUALITY, spec.main, animated);
    }
  } catch {
    // Sniff passed but decode failed → truncated/corrupt image data.
    throw new TranscodeError('unsupported_format');
  }
  if (data.byteLength > IMAGE_MAX_BYTES) throw new TranscodeError('too_large');

  let thumbBuffer: Buffer;
  try {
    thumbBuffer = await sharp(data)
      .resize({
        width: spec.thumb.width,
        height: spec.thumb.height,
        fit: spec.thumb.fit,
        withoutEnlargement: spec.thumb.fit === 'inside',
      })
      .webp({ quality: THUMB_WEBP_QUALITY, effort: 4 })
      .toBuffer();
  } catch {
    throw new TranscodeError('unsupported_format');
  }

  const [blurhash, output] = await Promise.all([blurhashOf(data), sharp(data).metadata()]);
  return {
    buffer: data,
    thumbBuffer,
    blurhash,
    width: output.width ?? null,
    height: output.height ?? null,
  };
}
