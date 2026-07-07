import { describe, expect, it } from 'vitest';

import { blurhashAverageColor, decode, encode, isBlurhashValid } from './blurhash';

/**
 * Deterministic 8x8 RGBA test pattern: red ramps left→right, green ramps
 * top→bottom, blue fixed. Small enough to eyeball, structured enough that a
 * broken DCT or a flipped axis shows up in the reconstruction checks.
 */
function testPattern(size = 8): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round((x / (size - 1)) * 255);
      pixels[offset + 1] = Math.round((y / (size - 1)) * 255);
      pixels[offset + 2] = 64;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

/** Average of one channel over a decoded RGBA buffer. */
function channelMean(pixels: Uint8ClampedArray, channel: number): number {
  let sum = 0;
  for (let i = channel; i < pixels.length; i += 4) sum += pixels[i] ?? 0;
  return sum / (pixels.length / 4);
}

describe('blurhash encode', () => {
  it('produces the locked vector for the deterministic pattern', () => {
    // Locked output: any change to the encoder math breaks this on purpose.
    const hash = encode(testPattern(), 8, 8, 4, 3);
    expect(hash).toBe('LyI5Xw39a|%0uuRnfQnSf7fQfQfQ');
  });

  it('emits the documented length for the component counts', () => {
    const hash = encode(testPattern(), 8, 8, 4, 3);
    expect(hash).toHaveLength(4 + 2 * 4 * 3);
    expect(isBlurhashValid(hash)).toBe(true);
  });

  it('rejects mismatched buffer sizes and bad component counts', () => {
    expect(() => encode(testPattern(4), 8, 8)).toThrow(/pixel buffer/);
    expect(() => encode(testPattern(), 8, 8, 0, 3)).toThrow(/components/);
    expect(() => encode(testPattern(), 8, 8, 4, 10)).toThrow(/components/);
  });
});

describe('blurhash decode', () => {
  it('roughly reconstructs the encoded pattern (round trip)', () => {
    const source = testPattern();
    const hash = encode(source, 8, 8, 4, 3);
    const decoded = decode(hash, 8, 8);

    expect(decoded).toHaveLength(8 * 8 * 4);

    // Averages survive the DCT round trip within a loose tolerance.
    for (const channel of [0, 1, 2]) {
      const original = channelMean(new Uint8ClampedArray(source), channel);
      const roundTripped = channelMean(decoded, channel);
      expect(Math.abs(original - roundTripped)).toBeLessThan(24);
    }

    // Gradients survive with their direction intact: red grows left→right,
    // green grows top→bottom.
    const at = (x: number, y: number, channel: number) => decoded[(y * 8 + x) * 4 + channel] ?? 0;
    expect(at(7, 4, 0)).toBeGreaterThan(at(0, 4, 0) + 40);
    expect(at(4, 7, 1)).toBeGreaterThan(at(4, 0, 1) + 40);

    // Alpha is opaque everywhere.
    for (let i = 3; i < decoded.length; i += 4) expect(decoded[i]).toBe(255);
  });

  it('rejects malformed hashes', () => {
    expect(isBlurhashValid('')).toBe(false);
    expect(isBlurhashValid('LzLg^_')).toBe(false); // truncated for its size flag
    expect(() => decode('!!invalid!!', 8, 8)).toThrow(/invalid/);
  });
});

describe('blurhashAverageColor', () => {
  it('returns the DC term as sRGB', () => {
    const hash = encode(testPattern(), 8, 8, 4, 3);
    const [r, g, b] = blurhashAverageColor(hash);
    // The pattern averages mid-red, mid-green, blue=64 (linear-light average,
    // so the sRGB DC sits above the naive 127 midpoint).
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(200);
    expect(g).toBeGreaterThan(100);
    expect(g).toBeLessThan(200);
    expect(Math.abs(b - 64)).toBeLessThan(12);
  });
});
