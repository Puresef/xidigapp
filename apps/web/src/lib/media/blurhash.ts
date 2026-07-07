/**
 * Dependency-free blurhash (§22 Lite mode — Phase 4.5 experience expansion).
 *
 * A blurhash is a ~30-character base83 string describing an image as a tiny
 * DCT: enough to paint a soft color wash placeholder for ~0 bytes while the
 * real asset stays deferred behind an explicit "Show / Muuji" tap. Pure TS,
 * no npm dependency (same ethos as the dependency-free VAPID push in
 * lib/push): `encode` runs server-side over sharp raw RGBA at ~32px,
 * `decode` runs client-side into a ≤32px canvas scaled up by CSS.
 *
 * Algorithm per the public blurhash spec (woltapp/blurhash): sRGB → linear,
 * cosine transform with `componentsX × componentsY` terms, DC stored as a
 * 24-bit sRGB int, AC terms quantised to 19 levels per channel.
 */

const B83_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

const B83_INDEX = new Map<string, number>([...B83_ALPHABET].map((char, i) => [char, i]));

function encode83(value: number, length: number): string {
  let out = '';
  for (let i = 1; i <= length; i++) {
    const digit = Math.floor(value / 83 ** (length - i)) % 83;
    out += B83_ALPHABET[digit];
  }
  return out;
}

function decode83(str: string): number {
  let value = 0;
  for (const char of str) {
    const digit = B83_INDEX.get(char);
    if (digit === undefined) throw new Error(`blurhash: invalid base83 character "${char}"`);
    value = value * 83 + digit;
  }
  return value;
}

function srgbToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  const srgb = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

function signPow(value: number, exp: number): number {
  return Math.sign(value) * Math.abs(value) ** exp;
}

export type Rgb = readonly [number, number, number];

/**
 * Encode RGBA pixels (row-major, 4 bytes per pixel — sharp `.ensureAlpha()
 * .raw()` output) into a blurhash. `componentsX/Y` must be 1–9; 4×3 is the
 * sweet spot for our thumbnail placeholders.
 */
export function encode(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  componentsX = 4,
  componentsY = 3,
): string {
  if (componentsX < 1 || componentsX > 9 || componentsY < 1 || componentsY > 9) {
    throw new Error('blurhash: components must be between 1 and 9');
  }
  if (pixels.length !== width * height * 4) {
    throw new Error('blurhash: pixel buffer does not match width*height*4');
  }

  const factors: [number, number, number][] = [];
  for (let j = 0; j < componentsY; j++) {
    for (let i = 0; i < componentsX; i++) {
      const normalisation = i === 0 && j === 0 ? 1 : 2;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const basis =
            normalisation *
            Math.cos((Math.PI * i * x) / width) *
            Math.cos((Math.PI * j * y) / height);
          const offset = (y * width + x) * 4;
          r += basis * srgbToLinear(pixels[offset] ?? 0);
          g += basis * srgbToLinear(pixels[offset + 1] ?? 0);
          b += basis * srgbToLinear(pixels[offset + 2] ?? 0);
        }
      }
      const scale = 1 / (width * height);
      factors.push([r * scale, g * scale, b * scale]);
    }
  }

  const dc = factors[0] as [number, number, number];
  const ac = factors.slice(1);

  let hash = encode83(componentsX - 1 + (componentsY - 1) * 9, 1);

  let acMax = 1;
  if (ac.length > 0) {
    const actualMax = Math.max(...ac.map((f) => Math.max(...f.map(Math.abs))));
    const quantisedMax = Math.max(0, Math.min(82, Math.floor(actualMax * 166 - 0.5)));
    acMax = (quantisedMax + 1) / 166;
    hash += encode83(quantisedMax, 1);
  } else {
    hash += encode83(0, 1);
  }

  hash += encode83(
    (linearToSrgb(dc[0]) << 16) + (linearToSrgb(dc[1]) << 8) + linearToSrgb(dc[2]),
    4,
  );

  for (const factor of ac) {
    const quantise = (value: number): number =>
      Math.max(0, Math.min(18, Math.floor(signPow(value / acMax, 0.5) * 9 + 9.5)));
    hash += encode83(
      quantise(factor[0]) * 19 * 19 + quantise(factor[1]) * 19 + quantise(factor[2]),
      2,
    );
  }

  return hash;
}

/** Structural validity check — safe to call on untrusted strings. */
export function isBlurhashValid(hash: string): boolean {
  if (hash.length < 6) return false;
  for (const char of hash) if (!B83_INDEX.has(char)) return false;
  const sizeFlag = decode83(hash[0] as string);
  const componentsX = (sizeFlag % 9) + 1;
  const componentsY = Math.floor(sizeFlag / 9) + 1;
  return hash.length === 4 + 2 * componentsX * componentsY;
}

/**
 * The DC term alone — the image's average color — read without a full
 * decode. Server-safe (no canvas): Avatar uses it for the initials disc
 * background so even the 0-byte fallback carries the photo's tone.
 */
export function blurhashAverageColor(hash: string): Rgb {
  if (!isBlurhashValid(hash)) throw new Error('blurhash: invalid hash');
  const dc = decode83(hash.slice(2, 6));
  return [dc >> 16, (dc >> 8) & 255, dc & 255];
}

/**
 * Decode into RGBA pixels (alpha always 255) for a canvas `putImageData`.
 * Keep width/height ≤32 and let CSS scale the canvas — the whole point is a
 * ~0-byte placeholder, not a faithful render.
 */
export function decode(hash: string, width: number, height: number, punch = 1): Uint8ClampedArray {
  if (!isBlurhashValid(hash)) throw new Error('blurhash: invalid hash');

  const sizeFlag = decode83(hash[0] as string);
  const componentsX = (sizeFlag % 9) + 1;
  const componentsY = Math.floor(sizeFlag / 9) + 1;
  const acMax = ((decode83(hash[1] as string) + 1) / 166) * punch;

  const colors: [number, number, number][] = [];
  const dc = decode83(hash.slice(2, 6));
  colors.push([srgbToLinear(dc >> 16), srgbToLinear((dc >> 8) & 255), srgbToLinear(dc & 255)]);
  for (let i = 1; i < componentsX * componentsY; i++) {
    const value = decode83(hash.slice(4 + i * 2, 6 + i * 2));
    colors.push([
      signPow((Math.floor(value / (19 * 19)) - 9) / 9, 2) * acMax,
      signPow(((Math.floor(value / 19) % 19) - 9) / 9, 2) * acMax,
      signPow(((value % 19) - 9) / 9, 2) * acMax,
    ]);
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < componentsY; j++) {
        for (let i = 0; i < componentsX; i++) {
          const basis = Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height);
          const color = colors[i + j * componentsX] as [number, number, number];
          r += color[0] * basis;
          g += color[1] * basis;
          b += color[2] * basis;
        }
      }
      const offset = (y * width + x) * 4;
      pixels[offset] = linearToSrgb(r);
      pixels[offset + 1] = linearToSrgb(g);
      pixels[offset + 2] = linearToSrgb(b);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
