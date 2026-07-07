import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { isBlurhashValid } from './blurhash';
import { isMediaKind, transcodeMediaKind, TranscodeError } from './transcode';

/** A real PNG (red→blue horizontal gradient) generated in-memory via sharp. */
async function gradientPng(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      raw[offset] = Math.round((x / (width - 1)) * 255);
      raw[offset + 1] = 40;
      raw[offset + 2] = 255 - Math.round((x / (width - 1)) * 255);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

describe('isMediaKind', () => {
  it('accepts the media_kinds seeds and rejects everything else', () => {
    for (const kind of [
      'post',
      'avatar',
      'cover',
      'listing_photo',
      'space_icon',
      'space_cover',
      'candidate_logo',
      'candidate_cover',
      'block',
    ]) {
      expect(isMediaKind(kind)).toBe(true);
    }
    expect(isMediaKind('')).toBe(false);
    expect(isMediaKind('banner')).toBe(false);
  });
});

describe('transcodeMediaKind', () => {
  it('post: keeps inside-fit dimensions and yields thumb + valid blurhash', async () => {
    const input = await gradientPng(1200, 600);
    const result = await transcodeMediaKind(input, 'post');

    expect(result.width).toBe(1200);
    expect(result.height).toBe(600);
    expect(result.buffer.byteLength).toBeGreaterThan(0);
    expect(result.blurhash).not.toBeNull();
    expect(isBlurhashValid(result.blurhash as string)).toBe(true);

    const thumb = await sharp(result.thumbBuffer).metadata();
    expect(thumb.format).toBe('webp');
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBeLessThanOrEqual(480);
  });

  it('avatar: main is a 512 square cover, thumb a small 96 square', async () => {
    const input = await gradientPng(1000, 700);
    const result = await transcodeMediaKind(input, 'avatar');

    expect(result.width).toBe(512);
    expect(result.height).toBe(512);

    const thumb = await sharp(result.thumbBuffer).metadata();
    expect(thumb.width).toBe(96);
    expect(thumb.height).toBe(96);
    // The Lite contract: avatar thumbs stay tiny (<8KB).
    expect(result.thumbBuffer.byteLength).toBeLessThan(8 * 1024);
  });

  it('avatar: upscales a small source to the promised square', async () => {
    const input = await gradientPng(64, 48);
    const result = await transcodeMediaKind(input, 'avatar');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('cover: fits inside 1600x600 without enlargement', async () => {
    const large = await transcodeMediaKind(await gradientPng(3200, 2400), 'cover');
    expect(large.width).toBeLessThanOrEqual(1600);
    expect(large.height).toBeLessThanOrEqual(600);

    const small = await transcodeMediaKind(await gradientPng(800, 300), 'space_cover');
    expect(small.width).toBe(800);
    expect(small.height).toBe(300);
  });

  it('rejects non-image payloads with the typed failure', async () => {
    await expect(
      transcodeMediaKind(Buffer.from('definitely not an image'), 'post'),
    ).rejects.toBeInstanceOf(TranscodeError);
  });

  it('output stays metadata-free (EXIF dropped by re-encode)', async () => {
    const withExif = await sharp(await gradientPng(400, 300))
      .withMetadata({ exif: { IFD0: { Copyright: 'secret gps stand-in' } } })
      .jpeg()
      .toBuffer();
    const result = await transcodeMediaKind(withExif, 'listing_photo');
    const meta = await sharp(result.buffer).metadata();
    expect(meta.exif).toBeUndefined();
  });
});
