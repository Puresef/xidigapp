import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONSENT_VERSION } from './model';
import { getConsentChoice } from './server';

/**
 * getConsentChoice IO wiring: cookie fast path skips the DB entirely, DB rows
 * map through decideConsent, and a lookup failure resolves fail-closed (no
 * banner, no capture) instead of throwing into the layout.
 */

const db = vi.hoisted(() => ({
  rows: [] as { consent_type: string; version: string }[],
  error: null as { message: string } | null,
  calls: 0,
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            is: () => {
              db.calls += 1;
              return Promise.resolve(
                db.error ? { data: null, error: db.error } : { data: db.rows, error: null },
              );
            },
          }),
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  db.rows = [];
  db.error = null;
  db.calls = 0;
});

describe('getConsentChoice', () => {
  it('answers from a current-version cookie without querying the DB', async () => {
    db.error = { message: 'db must not be consulted' };
    const state = await getConsentChoice('user-1', `v=${CONSENT_VERSION}&a=1&e=0`);
    expect(state).toEqual({ needsPrompt: false, analytics: true, errorMonitoring: false });
    expect(db.calls).toBe(0);
  });

  it('falls back to consent_records when the cookie is absent', async () => {
    db.rows = [{ consent_type: 'error_monitoring', version: CONSENT_VERSION }];
    const state = await getConsentChoice('user-1', undefined);
    expect(state).toEqual({ needsPrompt: false, analytics: false, errorMonitoring: true });
    expect(db.calls).toBe(1);
  });

  it('re-prompts on old-version records while honoring their grants', async () => {
    db.rows = [{ consent_type: 'analytics', version: '2026-01-01' }];
    const state = await getConsentChoice('user-1', 'v=2026-01-01&a=1&e=0');
    expect(state).toEqual({ needsPrompt: true, analytics: true, errorMonitoring: false });
  });

  it('fails closed on a lookup error: no banner, nothing granted', async () => {
    db.error = { message: 'boom' };
    const state = await getConsentChoice('user-1', undefined);
    expect(state).toEqual({ needsPrompt: false, analytics: false, errorMonitoring: false });
  });
});
