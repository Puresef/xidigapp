import { describe, expect, it } from 'vitest';

import {
  assertSeedTargetAllowed,
  classifySupabaseUrl,
  decideSeedTarget,
  NON_PRODUCTION_PROJECT_REFS,
  PRODUCTION_PROJECT_REFS,
  SeedTargetRefused,
} from './target-guard';

/**
 * The seed-target guard decides from the DATABASE target, not the process
 * mode. The 12 Sep 2026 audit found the test community on the live production
 * database because the only guard was NODE_ENV — which a local dev server
 * pointed at production passes. These pins make that impossible to repeat.
 */

const PROD = 'https://tbdryvhxxiqadseuxclm.supabase.co';

describe('classifySupabaseUrl', () => {
  it('extracts a hosted project ref', () => {
    expect(classifySupabaseUrl(PROD)).toEqual({ kind: 'hosted', ref: 'tbdryvhxxiqadseuxclm' });
    expect(classifySupabaseUrl('https://TBDRYVHXXIQADSEUXCLM.supabase.co/rest/v1')).toEqual({
      kind: 'hosted',
      ref: 'tbdryvhxxiqadseuxclm',
    });
  });

  it('recognises loopback stacks', () => {
    expect(classifySupabaseUrl('http://127.0.0.1:54321').kind).toBe('loopback');
    expect(classifySupabaseUrl('http://localhost:54321').kind).toBe('loopback');
  });

  it('treats missing, empty or unparseable URLs as unknown', () => {
    for (const url of [undefined, null, '', '   ', 'not a url', 'ftp://x.supabase.co']) {
      expect(classifySupabaseUrl(url).kind).toBe('unknown');
    }
  });

  it('does not trust nested or look-alike hosts', () => {
    expect(classifySupabaseUrl('https://evil.tbdryvhxxiqadseuxclm.supabase.co').kind).toBe('other');
    expect(classifySupabaseUrl('https://tbdryvhxxiqadseuxclm.supabase.co.evil.test').kind).toBe(
      'other',
    );
  });
});

describe('decideSeedTarget', () => {
  it('the production project is listed, and the non-production allowlist is empty', () => {
    expect(PRODUCTION_PROJECT_REFS).toContain('tbdryvhxxiqadseuxclm');
    // No non-production rehearsal project is verified today; Staging is paused
    // and unverified. Adding one is a reviewed, owner-approved change.
    expect(NON_PRODUCTION_PROJECT_REFS).toEqual([]);
    expect(NON_PRODUCTION_PROJECT_REFS).not.toContain('sbeotgaaxwbhnchyuvdp');
  });

  it('refuses the production project ref (whatever NODE_ENV the process runs with)', () => {
    const decision = decideSeedTarget([PROD]);
    expect(decision).toMatchObject({ allowed: false, reason: 'target_production' });
  });

  it('refuses when either configured URL points at production', () => {
    expect(decideSeedTarget(['http://127.0.0.1:54321', PROD])).toMatchObject({
      allowed: false,
      reason: 'target_production',
    });
    expect(decideSeedTarget([PROD, undefined])).toMatchObject({ allowed: false });
  });

  it('fails closed when the target cannot be determined', () => {
    expect(decideSeedTarget([])).toMatchObject({ allowed: false, reason: 'target_unknown' });
    expect(decideSeedTarget([undefined, ''])).toMatchObject({
      allowed: false,
      reason: 'target_unknown',
    });
    expect(decideSeedTarget(['garbage'])).toMatchObject({ allowed: false, reason: 'target_unknown' });
  });

  it('refuses a hosted project that is not on the allowlist (incl. the unverified Staging ref)', () => {
    expect(decideSeedTarget(['https://sbeotgaaxwbhnchyuvdp.supabase.co'])).toMatchObject({
      allowed: false,
      reason: 'target_not_allowlisted',
    });
    expect(decideSeedTarget(['https://db.example.org'])).toMatchObject({
      allowed: false,
      reason: 'target_not_allowlisted',
    });
  });

  it('allows a loopback stack', () => {
    expect(decideSeedTarget(['http://127.0.0.1:54321'])).toMatchObject({ allowed: true });
    expect(decideSeedTarget(['http://127.0.0.1:54321', 'http://127.0.0.1:54321'])).toMatchObject({
      allowed: true,
    });
  });

  it('refuses two allowed-looking URLs that disagree', () => {
    expect(decideSeedTarget(['http://127.0.0.1:54321', 'http://localhost:54321'])).toMatchObject({
      allowed: false,
      reason: 'target_mismatch',
    });
  });
});

describe('assertSeedTargetAllowed', () => {
  it('throws SeedTargetRefused for production', () => {
    expect(() => assertSeedTargetAllowed([PROD])).toThrow(SeedTargetRefused);
    expect(() => assertSeedTargetAllowed([PROD])).toThrow(/PRODUCTION/);
  });

  it('returns the target description when allowed', () => {
    expect(assertSeedTargetAllowed(['http://localhost:54321'])).toMatch(/local stack/);
  });
});
