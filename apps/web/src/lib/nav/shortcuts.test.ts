import { describe, expect, it } from 'vitest';

import { shortcutFor } from './shortcuts';

/**
 * Global shortcut contract: `/` focuses search, `c` composes — but never
 * while typing in a field or holding a modifier (browser shortcuts win).
 */

describe('shortcutFor', () => {
  it('maps / to search and c to compose when idle', () => {
    expect(shortcutFor('/', { typing: false, modifier: false })).toBe('search');
    expect(shortcutFor('c', { typing: false, modifier: false })).toBe('compose');
    expect(shortcutFor('x', { typing: false, modifier: false })).toBeNull();
  });

  it('never fires while typing or with a modifier held', () => {
    expect(shortcutFor('/', { typing: true, modifier: false })).toBeNull();
    expect(shortcutFor('c', { typing: false, modifier: true })).toBeNull();
  });
});
