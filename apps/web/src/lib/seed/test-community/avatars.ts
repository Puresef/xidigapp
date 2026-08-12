import sharp from 'sharp';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { encode as encodeBlurhash } from '@/lib/media/blurhash';
import { derivedThumbPath, ensureMediaBucket } from '@/lib/media/storage';
import { MEDIA_BUCKET } from '@/lib/plaza/constants';

/**
 * Deterministic, persona-matched placeholder art for the test community.
 *
 * The repo has no image-generation pipeline, so we follow the fixture rule:
 * generate SVG locally (symbolic motifs — never faces, never real people),
 * transcode to WebP with sharp (the app's own pipeline format), upload through
 * the same media/storage path the app expects, and register a media_uploads
 * row with the pipeline's `_thumb.webp` low-bandwidth pair. Everything is a
 * pure function of the handle, so re-runs overwrite identical assets.
 *
 * Avatars: square, gradient disc + a white motif glyph matched to the persona
 * (code brackets for the engineer, sorghum for the farmer, waves for the
 * fisherman, ...) + initials. Banners: wide scene tied to the persona's story
 * (farm rows, harbour, market awning, classroom board, football pitch, ...).
 */

type Palette = [string, string];

const PALETTES: Palette[] = [
  ['#1d4ed8', '#0ea5e9'],
  ['#0f766e', '#34d399'],
  ['#b45309', '#f59e0b'],
  ['#7c3aed', '#c084fc'],
  ['#be123c', '#fb7185'],
  ['#166534', '#4ade80'],
  ['#0e7490', '#67e8f9'],
  ['#92400e', '#fbbf24'],
  ['#334155', '#94a3b8'],
  ['#9d174d', '#f472b6'],
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function palette(handle: string): Palette {
  return PALETTES[hashCode(handle) % PALETTES.length]!;
}

function initials(displayName: string): string {
  const parts = displayName.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Motif glyphs, drawn white inside a 100×100 box centred on (50,46).
 * Purely geometric/symbolic — no faces, no likenesses.
 */
const GLYPHS: Record<string, string> = {
  star: '<path d="M50 16 L58 38 L82 38 L63 52 L70 76 L50 62 L30 76 L37 52 L18 38 L42 38 Z" fill="#fff" fill-opacity="0.95"/>',
  gavel:
    '<rect x="28" y="24" width="26" height="12" rx="3" transform="rotate(40 41 30)" fill="#fff"/><rect x="44" y="42" width="30" height="8" rx="4" transform="rotate(40 59 46)" fill="#fff" fill-opacity="0.85"/>',
  shieldCheck:
    '<path d="M50 14 L76 24 V46 C76 62 64 74 50 80 C36 74 24 62 24 46 V24 Z" fill="none" stroke="#fff" stroke-width="5"/><path d="M38 46 L47 55 L64 36" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  scale:
    '<path d="M50 18 V70 M30 28 H70" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M30 28 L22 46 H38 Z M70 28 L62 46 H78 Z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M38 74 H62" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  code: '<path d="M36 28 L18 46 L36 64 M64 28 L82 46 L64 64" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M56 22 L44 72" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  chart:
    '<path d="M22 74 H80" stroke="#fff" stroke-width="5" stroke-linecap="round"/><rect x="28" y="50" width="10" height="20" fill="#fff"/><rect x="45" y="36" width="10" height="34" fill="#fff"/><rect x="62" y="24" width="10" height="46" fill="#fff"/>',
  penTool:
    '<circle cx="50" cy="30" r="9" fill="none" stroke="#fff" stroke-width="5"/><path d="M50 39 L38 66 L50 78 L62 66 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>',
  server:
    '<rect x="26" y="22" width="48" height="16" rx="4" fill="none" stroke="#fff" stroke-width="5"/><rect x="26" y="46" width="48" height="16" rx="4" fill="none" stroke="#fff" stroke-width="5"/><circle cx="35" cy="30" r="3" fill="#fff"/><circle cx="35" cy="54" r="3" fill="#fff"/><path d="M50 62 V76 M38 76 H62" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  waveform:
    '<path d="M20 46 H30 M36 46 V30 M36 46 V62 M48 46 V20 M48 46 V72 M60 46 V32 M60 46 V60 M72 46 V40 M72 46 V52 M78 46 H82" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  bug: '<circle cx="50" cy="50" r="16" fill="none" stroke="#fff" stroke-width="5"/><path d="M50 34 V24 M38 40 L28 32 M62 40 L72 32 M34 52 H22 M66 52 H78 M40 64 L32 74 M60 64 L68 74" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  sorghum:
    '<path d="M50 80 V34" stroke="#fff" stroke-width="5" stroke-linecap="round"/><g fill="#fff"><circle cx="50" cy="24" r="5"/><circle cx="41" cy="31" r="4.5"/><circle cx="59" cy="31" r="4.5"/><circle cx="37" cy="41" r="4"/><circle cx="63" cy="41" r="4"/><circle cx="45" cy="36" r="4"/><circle cx="55" cy="36" r="4"/></g><path d="M50 58 C40 56 36 48 35 44 M50 66 C60 64 64 56 65 52" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>',
  waterDrop:
    '<path d="M50 16 C62 34 72 46 72 58 A22 22 0 1 1 28 58 C28 46 38 34 50 16 Z" fill="none" stroke="#fff" stroke-width="5"/><path d="M42 58 A10 10 0 0 0 50 70" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  horns:
    '<path d="M30 70 C22 52 24 34 38 24 M70 70 C78 52 76 34 62 24" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="62" r="10" fill="none" stroke="#fff" stroke-width="5"/>',
  sprout:
    '<path d="M50 78 V48" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M50 52 C50 38 38 30 26 32 C28 46 38 54 50 52 Z M50 44 C50 32 60 24 74 26 C72 40 62 48 50 44 Z" fill="#fff" fill-opacity="0.92"/>',
  fish: '<path d="M22 46 C34 32 52 28 66 38 L80 28 L76 46 L80 64 L66 54 C52 64 34 60 22 46 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><circle cx="60" cy="42" r="3" fill="#fff"/>',
  tomato:
    '<circle cx="50" cy="52" r="22" fill="none" stroke="#fff" stroke-width="5"/><path d="M50 30 C46 22 40 20 36 20 M50 30 C54 22 60 20 64 20 M50 30 L50 22" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>',
  needle:
    '<path d="M28 72 C40 60 60 40 72 28" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="72" cy="28" r="5" fill="none" stroke="#fff" stroke-width="4"/><path d="M28 72 C36 74 44 70 40 62" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  paisley:
    '<path d="M56 20 C74 28 76 52 62 66 C52 76 36 76 30 66 C24 56 30 46 40 46 C50 46 54 56 48 62" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="42" cy="56" r="3" fill="#fff"/><circle cx="58" cy="36" r="3" fill="#fff"/>',
  cupcake:
    '<path d="M30 48 H70 L64 76 H36 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M30 48 C26 30 42 22 50 30 C58 18 76 30 70 48" fill="none" stroke="#fff" stroke-width="5"/><path d="M44 58 V66 M56 58 V66" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  ledger:
    '<path d="M50 26 C42 20 30 20 24 24 V72 C30 68 42 68 50 74 C58 68 70 68 76 72 V24 C70 20 58 20 50 26 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M50 26 V74 M32 34 H42 M32 44 H42 M58 34 H68 M58 44 H68" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  coins:
    '<ellipse cx="50" cy="34" rx="20" ry="8" fill="none" stroke="#fff" stroke-width="5"/><path d="M30 34 V58 C30 62 39 66 50 66 C61 66 70 62 70 58 V34" fill="none" stroke="#fff" stroke-width="5"/><path d="M30 46 C30 50 39 54 50 54 C61 54 70 50 70 46" fill="none" stroke="#fff" stroke-width="4"/>',
  containers:
    '<rect x="22" y="52" width="26" height="18" fill="none" stroke="#fff" stroke-width="4"/><rect x="52" y="52" width="26" height="18" fill="none" stroke="#fff" stroke-width="4"/><rect x="37" y="30" width="26" height="18" fill="none" stroke="#fff" stroke-width="4"/><path d="M26 61 H44 M56 61 H74 M41 39 H59" stroke="#fff" stroke-width="3"/>',
  fabric:
    '<path d="M26 30 H62 C70 30 74 36 74 42 C74 48 70 54 62 54 H30" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M26 30 V70 M34 54 V70 M42 54 V70 M50 54 V70 M58 54 V70" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  medCross:
    '<circle cx="50" cy="46" r="26" fill="none" stroke="#fff" stroke-width="5"/><path d="M50 34 V58 M38 46 H62" stroke="#fff" stroke-width="7" stroke-linecap="round"/>',
  pill: '<rect x="24" y="38" width="52" height="20" rx="10" transform="rotate(-24 50 48)" fill="none" stroke="#fff" stroke-width="5"/><path d="M42 56 L58 40" stroke="#fff" stroke-width="4"/>',
  lamp: '<path d="M50 20 C56 30 66 34 66 46 A16 16 0 1 1 34 46 C34 34 44 30 50 20 Z" fill="none" stroke="#fff" stroke-width="5"/><path d="M40 72 H60 M44 80 H56" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  chalkboard:
    '<rect x="22" y="24" width="56" height="38" rx="3" fill="none" stroke="#fff" stroke-width="5"/><path d="M30 36 H54 M30 46 L46 46 M60 36 L70 46 M70 36 L60 46" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M42 62 L38 76 M58 62 L62 76" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  gradCap:
    '<path d="M50 26 L82 40 L50 54 L18 40 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M34 48 V62 C34 68 66 68 66 62 V48" fill="none" stroke="#fff" stroke-width="5"/><path d="M76 42 V58" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="76" cy="62" r="3" fill="#fff"/>',
  bookOpen:
    '<path d="M50 28 C42 22 30 22 24 26 V70 C30 66 42 66 50 72 C58 66 70 66 76 70 V26 C70 22 58 22 50 28 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M50 28 V72" stroke="#fff" stroke-width="4"/>',
  playLesson:
    '<rect x="24" y="26" width="52" height="36" rx="6" fill="none" stroke="#fff" stroke-width="5"/><path d="M45 36 L59 44 L45 52 Z" fill="#fff"/><path d="M38 70 H62" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  wrench:
    '<path d="M62 22 A16 16 0 1 0 74 40 L58 56 A10 10 0 1 1 44 42 L60 26 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M40 60 L26 74" stroke="#fff" stroke-width="6" stroke-linecap="round"/>',
  truck:
    '<rect x="20" y="34" width="34" height="24" fill="none" stroke="#fff" stroke-width="5"/><path d="M54 42 H70 L78 52 V58 H54 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><circle cx="34" cy="64" r="6" fill="none" stroke="#fff" stroke-width="4"/><circle cx="64" cy="64" r="6" fill="none" stroke="#fff" stroke-width="4"/>',
  basket:
    '<path d="M26 42 H74 L68 72 H32 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M38 42 C38 26 62 26 62 42" fill="none" stroke="#fff" stroke-width="5"/><path d="M40 50 L42 64 M50 50 V64 M60 50 L58 64" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  sparkBurst:
    '<circle cx="50" cy="50" r="7" fill="#fff"/><path d="M50 24 V36 M50 64 V76 M24 50 H36 M64 50 H76 M32 32 L40 40 M68 32 L60 40 M32 68 L40 60 M68 68 L60 60" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  crane:
    '<path d="M30 76 V28 L70 40 M30 40 L54 33" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M62 38 V52" stroke="#fff" stroke-width="4"/><rect x="56" y="52" width="12" height="10" fill="none" stroke="#fff" stroke-width="4"/><path d="M22 76 H58" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  quill:
    '<path d="M68 20 C48 24 34 40 30 62 L28 74 L40 70 C60 62 70 44 68 20 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M32 70 C44 52 54 40 64 30" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>',
  mic: '<rect x="42" y="20" width="16" height="30" rx="8" fill="none" stroke="#fff" stroke-width="5"/><path d="M32 44 C32 58 68 58 68 44 M50 58 V72 M40 72 H60" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  camera:
    '<rect x="22" y="34" width="56" height="36" rx="6" fill="none" stroke="#fff" stroke-width="5"/><circle cx="50" cy="52" r="11" fill="none" stroke="#fff" stroke-width="5"/><path d="M38 34 L44 26 H56 L62 34" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>',
  dome: '<path d="M50 18 C50 26 34 30 34 46 A16 16 0 0 0 66 46 C66 30 50 26 50 18 Z" fill="none" stroke="#fff" stroke-width="5"/><path d="M28 70 H72 M34 70 V58 A4 4 0 0 1 42 58 V70 M58 70 V58 A4 4 0 0 1 66 58 V70" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>',
  megaphone:
    '<path d="M24 44 V56 L36 58 L64 70 V30 L36 42 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M40 60 L44 74" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M70 40 C76 44 76 56 70 60" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  football:
    '<circle cx="50" cy="48" r="26" fill="none" stroke="#fff" stroke-width="5"/><path d="M50 34 L62 43 L58 58 H42 L38 43 Z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M50 34 V22 M62 43 L74 40 M58 58 L66 70 M42 58 L34 70 M38 43 L26 40" stroke="#fff" stroke-width="3"/>',
  magnifier:
    '<circle cx="44" cy="42" r="18" fill="none" stroke="#fff" stroke-width="5"/><path d="M57 55 L74 72" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M38 42 A6 6 0 0 1 44 36" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>',
  teacup:
    '<path d="M28 38 H66 V52 A18 18 0 0 1 30 52 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M66 40 C76 40 76 52 65 53" fill="none" stroke="#fff" stroke-width="4"/><path d="M38 30 C36 26 40 24 38 20 M50 30 C48 26 52 24 50 20" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M30 68 H64" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  crescent:
    '<path d="M60 20 A28 28 0 1 0 60 76 A22 22 0 1 1 60 20 Z" fill="#fff" fill-opacity="0.95"/><path d="M66 40 L69 47 L76 47 L71 52 L73 59 L66 55 L59 59 L61 52 L56 47 L63 47 Z" fill="#fff"/>',
  spice:
    '<path d="M28 70 L40 40 L52 70 Z M48 70 L60 34 L72 70 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M22 70 H78" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  eyeWatch:
    '<path d="M22 48 C34 32 66 32 78 48 C66 64 34 64 22 48 Z" fill="none" stroke="#fff" stroke-width="5"/><circle cx="50" cy="48" r="8" fill="#fff"/>',
  botStar:
    '<path d="M50 18 L56 38 L76 44 L56 50 L50 70 L44 50 L24 44 L44 38 Z" fill="#fff" fill-opacity="0.95"/><circle cx="26" cy="24" r="4" fill="none" stroke="#fff" stroke-width="3"/><circle cx="74" cy="66" r="4" fill="none" stroke="#fff" stroke-width="3"/><path d="M29 27 L42 38 M71 63 L58 51" stroke="#fff" stroke-width="3"/>',
  coopCircle:
    '<circle cx="50" cy="46" r="24" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/><g fill="#fff"><circle cx="50" cy="20" r="6"/><circle cx="73" cy="33" r="6"/><circle cx="73" cy="59" r="6"/><circle cx="50" cy="72" r="6"/><circle cx="27" cy="59" r="6"/><circle cx="27" cy="33" r="6"/></g><circle cx="50" cy="46" r="7" fill="none" stroke="#fff" stroke-width="4"/>',
};

/** Banner scenes: white translucent line-art over the gradient, 1200×400. */
const SCENES: Record<string, string> = {
  fields:
    '<path d="M0 260 H1200" stroke="#fff" stroke-opacity="0.5" stroke-width="3"/><path d="M100 400 L560 260 M300 400 L600 260 M500 400 L640 260 M700 400 L680 260 M900 400 L720 260 M1100 400 L760 260" stroke="#fff" stroke-opacity="0.35" stroke-width="3"/><circle cx="980" cy="120" r="56" fill="#fff" fill-opacity="0.25"/><path d="M120 200 C140 170 160 170 180 200 M170 220 C190 190 210 190 230 220" stroke="#fff" stroke-opacity="0.4" stroke-width="4" fill="none"/>',
  river:
    '<path d="M0 300 C200 260 300 340 500 300 C700 260 800 340 1200 290 L1200 400 L0 400 Z" fill="#fff" fill-opacity="0.18"/><path d="M0 310 C200 270 300 350 500 310 C700 270 800 350 1200 300" stroke="#fff" stroke-opacity="0.5" stroke-width="3" fill="none"/><path d="M150 180 V240 M150 180 C130 160 120 140 124 120 C150 130 158 154 150 180 M150 180 C170 160 180 140 176 120 C150 130 142 154 150 180" stroke="#fff" stroke-opacity="0.4" stroke-width="4" fill="none"/>',
  waves:
    '<path d="M0 280 Q100 260 200 280 T400 280 T600 280 T800 280 T1000 280 T1200 280 M0 320 Q100 300 200 320 T400 320 T600 320 T800 320 T1000 320 T1200 320" stroke="#fff" stroke-opacity="0.45" stroke-width="4" fill="none"/><path d="M760 250 L840 250 L810 210 Z M810 210 V250" stroke="#fff" stroke-opacity="0.6" stroke-width="4" fill="none" stroke-linejoin="round"/><circle cx="220" cy="110" r="44" fill="#fff" fill-opacity="0.2"/>',
  skyline:
    '<g fill="#fff" fill-opacity="0.22"><rect x="120" y="180" width="90" height="220"/><rect x="240" y="120" width="70" height="280"/><rect x="340" y="220" width="110" height="180"/><rect x="760" y="160" width="80" height="240"/><rect x="870" y="230" width="120" height="170"/><rect x="1020" y="140" width="70" height="260"/></g><g fill="#fff" fill-opacity="0.45"><rect x="256" y="140" width="10" height="10"/><rect x="278" y="140" width="10" height="10"/><rect x="256" y="164" width="10" height="10"/><rect x="782" y="180" width="10" height="10"/><rect x="804" y="180" width="10" height="10"/><rect x="782" y="204" width="10" height="10"/></g><circle cx="600" cy="110" r="40" fill="#fff" fill-opacity="0.3"/>',
  market:
    '<path d="M80 160 H1120" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><g fill="#fff" fill-opacity="0.3"><path d="M100 160 L130 220 H70 Z M180 160 L210 220 H150 Z M260 160 L290 220 H230 Z M340 160 L370 220 H310 Z"/></g><g fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="3"><rect x="760" y="240" width="120" height="90"/><rect x="920" y="240" width="120" height="90"/><path d="M780 265 H860 M780 290 H860 M940 265 H1020 M940 290 H1020"/></g>',
  board:
    '<rect x="120" y="80" width="600" height="240" rx="8" fill="#fff" fill-opacity="0.12" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><path d="M160 140 H420 M160 190 H360 M160 240 L300 240 M480 140 L560 220 M560 140 L480 220" stroke="#fff" stroke-opacity="0.45" stroke-width="5" stroke-linecap="round"/><path d="M880 320 C920 260 1000 260 1040 320" stroke="#fff" stroke-opacity="0.35" stroke-width="4" fill="none"/><circle cx="960" cy="220" r="36" fill="#fff" fill-opacity="0.25"/>',
  code: '<rect x="140" y="90" width="560" height="230" rx="10" fill="#fff" fill-opacity="0.12" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><circle cx="170" cy="115" r="6" fill="#fff" fill-opacity="0.6"/><circle cx="192" cy="115" r="6" fill="#fff" fill-opacity="0.45"/><circle cx="214" cy="115" r="6" fill="#fff" fill-opacity="0.3"/><path d="M180 160 H420 M180 190 H360 M210 220 H480 M210 250 H400 M180 280 H300" stroke="#fff" stroke-opacity="0.4" stroke-width="7" stroke-linecap="round"/><path d="M840 160 L800 210 L840 260 M940 160 L980 210 L940 260" stroke="#fff" stroke-opacity="0.45" stroke-width="6" fill="none" stroke-linecap="round"/>',
  pitch:
    '<rect x="140" y="80" width="920" height="260" rx="10" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><path d="M600 80 V340" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><circle cx="600" cy="210" r="50" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><rect x="140" y="150" width="90" height="120" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="3"/><rect x="970" y="150" width="90" height="120" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="3"/><circle cx="380" cy="180" r="10" fill="#fff" fill-opacity="0.5"/>',
  port: '<g fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="4"><rect x="700" y="280" width="110" height="60"/><rect x="820" y="280" width="110" height="60"/><rect x="760" y="215" width="110" height="60"/><path d="M180 340 V120 L420 180 M180 200 L330 155"/><path d="M390 172 V240 M370 240 H410 V270 H370 Z"/></g><path d="M0 345 H1200" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/>',
  workshop:
    '<g fill="#fff" fill-opacity="0.35"><circle cx="160" cy="120" r="5"/><circle cx="220" cy="120" r="5"/><circle cx="280" cy="120" r="5"/><circle cx="160" cy="180" r="5"/><circle cx="220" cy="180" r="5"/><circle cx="280" cy="180" r="5"/></g><path d="M840 140 A40 40 0 1 0 900 190 L1000 290 L970 320 L870 220 A40 40 0 0 1 840 140 Z" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="5" stroke-linejoin="round"/><path d="M120 300 H520" stroke="#fff" stroke-opacity="0.5" stroke-width="5" stroke-linecap="round"/><path d="M300 240 L340 300 M380 250 L400 300" stroke="#fff" stroke-opacity="0.35" stroke-width="4"/>',
  road: '<path d="M0 400 L520 140 M1200 400 L680 140 M520 140 H680" stroke="#fff" stroke-opacity="0.45" stroke-width="4" fill="none"/><path d="M600 400 V360 M600 330 V290 M600 260 V230 M600 205 V180" stroke="#fff" stroke-opacity="0.6" stroke-width="6" stroke-linecap="round"/><circle cx="950" cy="110" r="42" fill="#fff" fill-opacity="0.22"/>',
  shelves:
    '<path d="M140 140 H620 M140 230 H620 M140 320 H620" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><g fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="3"><rect x="170" y="100" width="40" height="40"/><rect x="230" y="110" width="34" height="30"/><rect x="290" y="95" width="44" height="45"/><rect x="380" y="105" width="36" height="35"/><rect x="170" y="190" width="36" height="40"/><rect x="240" y="200" width="44" height="30"/><rect x="320" y="185" width="38" height="45"/></g><circle cx="920" cy="210" r="70" fill="#fff" fill-opacity="0.18"/><path d="M880 210 C900 180 940 180 960 210" stroke="#fff" stroke-opacity="0.4" stroke-width="4" fill="none"/>',
  stage:
    '<path d="M120 90 C160 200 160 250 120 340 M1080 90 C1040 200 1040 250 1080 340" stroke="#fff" stroke-opacity="0.4" stroke-width="5" fill="none"/><rect x="560" y="170" width="18" height="60" rx="9" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="4"/><path d="M545 205 C545 240 593 240 593 205 M569 240 V280 M545 280 H593" stroke="#fff" stroke-opacity="0.55" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="850" cy="140" r="30" fill="#fff" fill-opacity="0.2"/>',
  courtyard:
    '<path d="M300 340 V240 A40 40 0 0 1 380 240 V340 M500 340 V240 A40 40 0 0 1 580 240 V340 M700 340 V240 A40 40 0 0 1 780 240 V340" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="4"/><path d="M540 150 C540 120 500 115 500 90 C520 98 530 110 540 90 C550 110 560 98 580 90 C580 115 540 120 540 150" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><path d="M0 340 H1200" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><path d="M940 120 A26 26 0 1 0 966 160 A20 20 0 1 1 940 120" fill="#fff" fill-opacity="0.4"/>',
  circleMeet:
    '<circle cx="600" cy="230" r="110" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round"/><g fill="#fff" fill-opacity="0.5"><circle cx="600" cy="120" r="14"/><circle cx="700" cy="165" r="14"/><circle cx="710" cy="290" r="14"/><circle cx="600" cy="340" r="14"/><circle cx="490" cy="290" r="14"/><circle cx="500" cy="165" r="14"/></g><path d="M240 140 C260 110 280 110 300 140 M940 300 C960 270 980 270 1000 300" stroke="#fff" stroke-opacity="0.3" stroke-width="4" fill="none"/>',
  library:
    '<g fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="4"><path d="M160 320 V120 H240 V320 M240 140 H320 V320 M320 160 H400 V320"/><path d="M160 320 H1040"/></g><path d="M700 140 C740 120 800 120 840 140 V300 C800 280 740 280 700 300 Z" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="4"/><path d="M770 135 V292" stroke="#fff" stroke-opacity="0.4" stroke-width="3"/>',
  clinic:
    '<path d="M0 330 H1200" stroke="#fff" stroke-opacity="0.5" stroke-width="4"/><rect x="200" y="160" width="240" height="170" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="4"/><path d="M300 200 V280 M260 240 H340" stroke="#fff" stroke-opacity="0.55" stroke-width="8" stroke-linecap="round"/><path d="M760 260 Q790 200 820 260 T880 260" stroke="#fff" stroke-opacity="0.45" stroke-width="4" fill="none"/><path d="M700 260 H960" stroke="#fff" stroke-opacity="0.4" stroke-width="3"/>',
  abstract:
    '<circle cx="260" cy="140" r="90" fill="#fff" fill-opacity="0.14"/><circle cx="940" cy="280" r="120" fill="#fff" fill-opacity="0.12"/><path d="M0 320 Q300 260 600 300 T1200 280" stroke="#fff" stroke-opacity="0.35" stroke-width="4" fill="none"/>',
};

/** Persona handle → [avatar glyph, banner scene]. Fallback: abstract. */
const THEMES: Record<string, [glyph: keyof typeof GLYPHS, scene: keyof typeof SCENES]> = {
  warsame_admin: ['gavel', 'skyline'],
  hodan_mod: ['shieldCheck', 'market'],
  cumar_mod: ['shieldCheck', 'pitch'],
  leyla_verifier: ['scale', 'skyline'],
  ayaan_dev: ['code', 'code'],
  khalid_codes: ['code', 'code'],
  nasra_sec: ['shieldCheck', 'code'],
  liibaan_data: ['chart', 'skyline'],
  sagal_ux: ['penTool', 'board'],
  daauud_devops: ['server', 'skyline'],
  zakariye_ml: ['waveform', 'library'],
  faadumo_qa: ['bug', 'code'],
  xasan_beero: ['sorghum', 'fields'],
  amina_biyo: ['waterDrop', 'river'],
  geedi_xoolo: ['horns', 'fields'],
  hamdi_agritech: ['sprout', 'fields'],
  kalluun_kismayo: ['fish', 'waves'],
  ubax_beerta: ['tomato', 'fields'],
  khadra_coop: ['coopCircle', 'circleMeet'],
  hibo_dhar: ['needle', 'market'],
  sahra_xinne: ['paisley', 'market'],
  muna_macaan: ['cupcake', 'market'],
  fartuun_forsa: ['ledger', 'circleMeet'],
  abshir_maal: ['coins', 'skyline'],
  deeqa_dirham: ['containers', 'port'],
  yusuf_xawilaad: ['ledger', 'market'],
  ifrah_invest: ['coins', 'skyline'],
  tahliil_textile: ['fabric', 'market'],
  asli_cijaar: ['ledger', 'skyline'],
  maryan_kalkaal: ['medCross', 'clinic'],
  cabdi_daawo: ['pill', 'shelves'],
  nimco_caafimaad: ['lamp', 'road'],
  axmed_caafi: ['medCross', 'library'],
  cali_macalin: ['chalkboard', 'board'],
  hafsa_dugsi: ['gradCap', 'library'],
  arday_hargeisa: ['bookOpen', 'board'],
  zamzam_dugsiga: ['bookOpen', 'courtyard'],
  bashiir_baro: ['playLesson', 'board'],
  saciid_makaanik: ['wrench', 'workshop'],
  faarax_gaadiid: ['truck', 'road'],
  luul_dukaan: ['basket', 'shelves'],
  jamaal_bir: ['sparkBurst', 'workshop'],
  cawo_cargo: ['containers', 'port'],
  guuleed_dhismo: ['crane', 'skyline'],
  warda_gabay: ['quill', 'stage'],
  abwaan_dhool: ['quill', 'courtyard'],
  idil_warbaahin: ['mic', 'skyline'],
  samatar_sawir: ['camera', 'stage'],
  nuur_samafal: ['dome', 'courtyard'],
  deeq_organiser: ['megaphone', 'circleMeet'],
  koos_kubad: ['football', 'pitch'],
  dalmar_dood: ['magnifier', 'library'],
  xaliimo_hooyo: ['teacup', 'circleMeet'],
  guhaad_ganax: ['coins', 'abstract'],
  burhaan_qaylo: ['megaphone', 'abstract'],
  xaawo_hadal: ['megaphone', 'market'],
  qali_qarsoon: ['spice', 'market'],
  tuute_cusub: ['star', 'abstract'],
  daahir_maqan: ['eyeWatch', 'abstract'],
  safiya_aragto: ['eyeWatch', 'library'],
  caawiye_ai: ['botStar', 'abstract'],
  warshad_ai: ['botStar', 'code'],
};

function theme(handle: string): [string, string] {
  const t = THEMES[handle];
  if (!t) return ['star', 'abstract'];
  const glyph = GLYPHS[t[0]] ? t[0] : 'star';
  return [glyph, t[1]];
}

/** Darken a #rrggbb hex toward black by `amt` (0–1) — for gradient depth. */
function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const ch = (i: number) =>
    Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - amt))));
  return `#${[ch(0), ch(2), ch(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Shared depth layers (3-stop gradient + soft top-left light + vignette). */
function depthDefs(from: string, to: string): string {
  return `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/>
    <stop offset="0.55" stop-color="${to}"/>
    <stop offset="1" stop-color="${shade(to, 0.32)}"/>
  </linearGradient>
  <radialGradient id="hi" cx="0.3" cy="0.2" r="0.9">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/>
    <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="vg" cx="0.5" cy="0.62" r="0.78">
    <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.24"/>
  </radialGradient>`;
}

function svgAvatar(handle: string, displayName: string): string {
  const [from, to] = palette(handle);
  const [glyphKey] = theme(handle);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 100 100">
  <defs>${depthDefs(from, to)}</defs>
  <rect width="100" height="100" fill="url(#g)"/>
  <rect width="100" height="100" fill="url(#hi)"/>
  <rect width="100" height="100" fill="url(#vg)"/>
  ${GLYPHS[glyphKey]}
  <text x="50" y="93" font-family="Arial, sans-serif" font-size="13" font-weight="700"
        fill="#ffffff" fill-opacity="0.9" text-anchor="middle" letter-spacing="2">${initials(displayName)}</text>
</svg>`;
}

/** Wide scene (banner / post image) with gradient depth, accent glow, the
 *  line-art scene, and a bottom fade for legibility + polish. The line-art is
 *  authored in a 1200×400 viewBox; the output canvas (banner 3:1, post 16:9)
 *  slice-crops it so one scene set serves both. */
function svgScene(seedKey: string, sceneKey: string, offset: number, outW = 1200, outH = 400): string {
  const [from, to] = palette(seedKey);
  const accent = PALETTES[(hashCode(seedKey) + offset) % PALETTES.length]![0];
  const glowX = 240 + (hashCode(seedKey) % 720);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="0.55" stop-color="${to}"/>
      <stop offset="1" stop-color="${shade(to, 0.3)}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${(glowX / 1200).toFixed(2)}" cy="0.1" r="0.75">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.4"/>
      <stop offset="0.6" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0.35" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.22"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="400" fill="url(#g)"/>
  <rect width="1200" height="400" fill="url(#glow)"/>
  ${SCENES[sceneKey] ?? SCENES.abstract}
  <rect width="1200" height="400" fill="url(#fade)"/>
</svg>`;
}

function svgBanner(handle: string): string {
  const [, sceneKey] = theme(handle);
  return svgScene(handle, sceneKey, 4);
}

async function renderWebp(
  svg: string,
  thumbWidth: number,
): Promise<{
  data: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  blurhash: string | null;
}> {
  const data = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  const meta = await sharp(data).metadata();
  const thumb = await sharp(data).resize({ width: thumbWidth }).webp({ quality: 55 }).toBuffer();

  let blurhash: string | null = null;
  try {
    const small = await sharp(data).resize(32, 32, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    blurhash = encodeBlurhash(new Uint8ClampedArray(small), 32, 32, 4, 4);
  } catch {
    blurhash = null; // cosmetic — never fail seeding over a placeholder hash
  }
  return { data, thumb, width: meta.width ?? 0, height: meta.height ?? 0, blurhash };
}

export interface UploadedMedia {
  path: string;
  blurhash: string | null;
}

function svgPostImage(seedKey: string, scene: string): string {
  return svgScene(seedKey, scene, 6, 1200, 675); // 16:9 for feed cards
}

/**
 * Render + upload a deterministic post image (16:9 scene, full + thumb) and
 * register the media_uploads row against the post. Returns the STORAGE PATH
 * (what `posts.image_urls` holds — the plaza view builder resolves it to a URL
 * via publicMediaUrl and joins media_uploads by storage_path for the thumb +
 * blurhash + alt). Null (with a warning) when storage is unavailable.
 */
export async function uploadPostImage(
  admin: SupabaseClient<Database>,
  input: { userId: string; postId: string; threadKey: string; scene: string; alt: string },
): Promise<string | null> {
  try {
    await ensureMediaBucket(admin);
    const { data, thumb, width, height, blurhash } = await renderWebp(
      svgPostImage(input.threadKey, input.scene),
      480,
    );
    const path = `${input.userId}/test-post-${input.threadKey}.webp`;
    const thumbPath = derivedThumbPath(path);
    const upload = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, data, { contentType: 'image/webp', upsert: true });
    if (upload.error) throw new Error(upload.error.message);
    const thumbUpload = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(thumbPath, thumb, { contentType: 'image/webp', upsert: true });
    if (thumbUpload.error) throw new Error(thumbUpload.error.message);

    const row = await admin.from('media_uploads').upsert(
      {
        owner_user_id: input.userId,
        bucket: MEDIA_BUCKET,
        storage_path: path,
        thumb_path: thumbPath,
        mime_type: 'image/webp',
        bytes: data.byteLength,
        width,
        height,
        kind: 'post',
        alt_text: input.alt,
        blurhash,
        scan_status: 'skipped',
        scan_verdict: { seeded: 'test-community' },
        post_id: input.postId,
      },
      { onConflict: 'storage_path' },
    );
    if (row.error) throw new Error(row.error.message);
    return path;
  } catch (error) {
    console.warn(
      `[test-community] post image skipped for ${input.threadKey}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Render + upload one avatar or cover (full + `_thumb.webp` low-bandwidth
 * pair) and register the media_uploads row. Deterministic per handle; re-runs
 * overwrite the same objects. Returns null (with a warning) when storage is
 * unavailable so seeding proceeds without images.
 */
export async function uploadPersonaMedia(
  admin: SupabaseClient<Database>,
  input: {
    userId: string;
    handle: string;
    displayName: string;
    kind: 'avatar' | 'cover';
  },
): Promise<UploadedMedia | null> {
  try {
    await ensureMediaBucket(admin);
    const svg =
      input.kind === 'avatar' ? svgAvatar(input.handle, input.displayName) : svgBanner(input.handle);
    const { data, thumb, width, height, blurhash } = await renderWebp(
      svg,
      input.kind === 'avatar' ? 64 : 320,
    );

    const path = `${input.userId}/test-${input.kind}-${input.handle}.webp`;
    const thumbPath = derivedThumbPath(path);
    const upload = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, data, { contentType: 'image/webp', upsert: true });
    if (upload.error) throw new Error(upload.error.message);
    const thumbUpload = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(thumbPath, thumb, { contentType: 'image/webp', upsert: true });
    if (thumbUpload.error) throw new Error(thumbUpload.error.message);

    const row = await admin
      .from('media_uploads')
      .upsert(
        {
          owner_user_id: input.userId,
          bucket: MEDIA_BUCKET,
          storage_path: path,
          thumb_path: thumbPath,
          mime_type: 'image/webp',
          bytes: data.byteLength,
          width,
          height,
          kind: input.kind,
          alt_text: `${input.displayName} — generated test ${input.kind}`,
          blurhash,
          scan_status: 'skipped',
          scan_verdict: { seeded: 'test-community' },
        },
        { onConflict: 'storage_path' },
      )
      .select('id')
      .single();
    if (row.error) throw new Error(row.error.message);

    return { path, blurhash };
  } catch (error) {
    console.warn(
      `[test-community] ${input.kind} upload skipped for ${input.handle}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
