import { describe, expect, it } from 'vitest';

import { resolveThemeDefault } from './appearance';

/**
 * Codsi fidelity pass (9 Aug): signed-in members default to the design-canon
 * dark shell; explicit choices — including system-follow — always win, and
 * the signed-out front door keeps the system default.
 */
describe('resolveThemeDefault', () => {
  it('defaults signed-in members to dark when no cookie is set', () => {
    expect(resolveThemeDefault(undefined, true)).toBe('dark');
    expect(resolveThemeDefault(null, true)).toBe('dark');
    expect(resolveThemeDefault('junk', true)).toBe('dark');
  });

  it('keeps the signed-out front door on system', () => {
    expect(resolveThemeDefault(undefined, false)).toBe('system');
  });

  it('never overrides an explicit choice', () => {
    expect(resolveThemeDefault('light', true)).toBe('light');
    expect(resolveThemeDefault('system', true)).toBe('system');
    expect(resolveThemeDefault('dark', false)).toBe('dark');
  });
});
