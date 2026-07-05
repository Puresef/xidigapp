import { describe, expect, it } from 'vitest';

import { safeNextPath } from './links';

/**
 * Open-redirect guard: ?next= flows straight into auth redirects, so
 * anything that could escape the origin must collapse to '/'.
 */
describe('safeNextPath', () => {
  it('allows same-origin relative paths', () => {
    expect(safeNextPath('/onboarding')).toBe('/onboarding');
    expect(safeNextPath('/settings/account?tab=security')).toBe('/settings/account?tab=security');
  });

  it('defaults to / for empty values', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath('')).toBe('/');
  });

  it('blocks absolute URLs', () => {
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('http://evil.example/phish')).toBe('/');
  });

  it('blocks protocol-relative URLs', () => {
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('//evil.example/path')).toBe('/');
  });

  it('blocks backslash tricks (browsers normalise \\ to /)', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('\\\\evil.example')).toBe('/');
    expect(safeNextPath('/a\\b')).toBe('/');
  });

  it('blocks scheme smuggling', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe('/');
    expect(safeNextPath('mailto:x@y.z')).toBe('/');
  });
});
