import { describe, expect, it } from 'vitest';

import { deepMergePreferences, settingsViewFromRow, USER_SETTINGS_DEFAULTS } from './model';

describe('settingsViewFromRow', () => {
  it('returns the lazy-creation defaults for a missing row', () => {
    expect(settingsViewFromRow(null)).toEqual(USER_SETTINGS_DEFAULTS);
  });
});

describe('deepMergePreferences', () => {
  it('merges nested plain objects without clobbering siblings', () => {
    const base = {
      lite: { images: false, embeds: false },
      appearance: { theme: 'dark', textSize: 'm' },
    };
    const merged = deepMergePreferences(base, { appearance: { theme: 'light' } });
    expect(merged).toEqual({
      lite: { images: false, embeds: false },
      appearance: { theme: 'light', textSize: 'm' },
    });
  });

  it('overwrites scalars, arrays, and null', () => {
    const merged = deepMergePreferences(
      { a: { b: 1 }, list: [1, 2] },
      { a: null, list: [3] },
    );
    expect(merged).toEqual({ a: null, list: [3] });
  });

  it('does not mutate the base object', () => {
    const base = { appearance: { theme: 'dark' } };
    deepMergePreferences(base, { appearance: { theme: 'light' } });
    expect(base.appearance.theme).toBe('dark');
  });
});
