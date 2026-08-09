import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XIDIG_POST_TYPE_ICON } from './paths';

/**
 * One-map convention (docs/d3-icon-handoff): public/icons/glyphs.map.json is
 * the canon record of the D2 glyph family and the P1 dictionary migration.
 * Nothing imports it at runtime — this test keeps the record true so the next
 * design pass reads reality, not a stale snapshot.
 */

interface GlyphEntry {
  key: string;
  post_type: string | null;
  legacy_post_type?: string;
  outline: string;
  filled: string;
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

describe('glyphs.map.json — asset and code coherence', () => {
  it('every mapped SVG pair exists on disk', () => {
    for (const glyph of map.glyphs) {
      expect(existsSync(join(ICONS_DIR, glyph.outline)), glyph.outline).toBe(true);
      expect(existsSync(join(ICONS_DIR, glyph.filled)), glyph.filled).toBe(true);
    }
  });

  it('every XIDIG_POST_TYPE_ICON target is a mapped glyph', () => {
    const keys = new Set(map.glyphs.map((glyph) => glyph.key));
    for (const iconName of Object.values(XIDIG_POST_TYPE_ICON)) {
      expect(keys.has(iconName), iconName).toBe(true);
    }
  });
});
