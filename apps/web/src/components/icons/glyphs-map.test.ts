import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XIDIG_ICONS, XIDIG_POST_TYPE_ICON, type XidigIconName } from './paths';

/**
 * One-map convention (docs/d3-icon-handoff): public/icons/glyphs.map.json is
 * the canon record of the D2 glyph family and the P1 dictionary migration.
 * Nothing imports it at runtime — this test keeps the record true so the next
 * design pass reads reality, not a stale snapshot.
 */

interface GlyphEntry {
  key: string;
  so?: string;
  en?: string;
  post_type: string | null;
  legacy_post_type?: string;
  /** product slug for glyphs that name a surface rather than a post type (maal) */
  product?: string;
  outline: string;
  filled: string;
  brand_check?: Record<string, string | number>;
}

interface GlyphsMap {
  version: string;
  glyphs: GlyphEntry[];
  dictionary_migration?: {
    renames: { from: string; to: string }[];
  };
}

const ICONS_DIR = join(__dirname, '../../../public/icons');
const map = JSON.parse(readFileSync(join(ICONS_DIR, 'glyphs.map.json'), 'utf8')) as GlyphsMap;

function entry(key: string): GlyphEntry {
  const found = map.glyphs.find((glyph) => glyph.key === key);
  if (!found) throw new Error(`glyph "${key}" missing from glyphs.map.json`);
  return found;
}

describe('glyphs.map.json — display labels', () => {
  it('garab records the EN display label "Show support" (Packet B) and the bare SO "Garab"', () => {
    expect(entry('garab').en).toBe('Show support');
    expect(entry('garab').so).toBe('Garab');
  });
});

describe('glyphs.map.json — P1 dictionary migration record', () => {
  it('codsi carries the new product slug with weydiin as its legacy trace', () => {
    expect(entry('codsi').post_type).toBe('codsi');
    expect(entry('codsi').legacy_post_type).toBe('weydiin');
  });

  it('salaan carries the new product slug with is-barasho as its legacy trace', () => {
    expect(entry('salaan').post_type).toBe('salaan');
    expect(entry('salaan').legacy_post_type).toBe('is-barasho');
  });

  it('records the dictionary_migration renames exactly (weydiin→codsi, is-barasho→salaan)', () => {
    const renames = map.dictionary_migration?.renames ?? [];
    expect(renames).toContainEqual(expect.objectContaining({ from: 'weydiin', to: 'codsi' }));
    expect(renames).toContainEqual(expect.objectContaining({ from: 'is-barasho', to: 'salaan' }));
    expect(renames).toHaveLength(2);
  });
});

describe('glyphs.map.json — ruling 8 maal glyph', () => {
  it('maal is a product glyph, not a post type', () => {
    expect(entry('maal').post_type).toBeNull();
    expect(entry('maal').product).toBe('maal');
  });

  it('records the brand-check verdict: outline + nav pass, filled reworked, ≤16px drops the bindings', () => {
    const check = entry('maal').brand_check ?? {};
    expect(check.ruling).toBe(8);
    expect(check.verdict).toBe('canon');
    expect(String(check.filled)).toMatch(/wedge/i);
    expect(String(check.nav_variant)).toContain('1.8/1.3');
    expect(String(check.small_size_rule)).toContain('16px');
  });
});

describe('glyphs.map.json — asset and code coherence', () => {
  it('every mapped SVG pair exists on disk', () => {
    for (const glyph of map.glyphs) {
      expect(existsSync(join(ICONS_DIR, glyph.outline)), glyph.outline).toBe(true);
      expect(existsSync(join(ICONS_DIR, glyph.filled)), glyph.filled).toBe(true);
    }
  });

  it('every mapped glyph is a registered XidigIcon name', () => {
    for (const glyph of map.glyphs) {
      expect(XIDIG_ICONS[glyph.key as XidigIconName], glyph.key).toBeDefined();
    }
  });

  it('the shipped maal SVGs carry the same geometry as paths.ts (no asset drift)', () => {
    const outline = readFileSync(join(ICONS_DIR, entry('maal').outline), 'utf8');
    for (const path of XIDIG_ICONS.maal.outline) expect(outline).toContain(path.d);
    const filled = readFileSync(join(ICONS_DIR, entry('maal').filled), 'utf8');
    expect(filled).toContain(XIDIG_ICONS.maal.filled[0]!.d);
  });

  it('every XIDIG_POST_TYPE_ICON target is a mapped glyph', () => {
    const keys = new Set(map.glyphs.map((glyph) => glyph.key));
    for (const iconName of Object.values(XIDIG_POST_TYPE_ICON)) {
      expect(keys.has(iconName), iconName).toBe(true);
    }
  });
});
