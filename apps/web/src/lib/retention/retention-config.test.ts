import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MEDIA_KINDS, RETENTION_WINDOW_DAYS, RETENTION_WINDOWS } from '@xidig/db/retention';

import { DM_REQUEST_TTL_DAYS } from '@/lib/dm/constants';
import { DELETION_GRACE_DAYS, RECORDING_RETENTION_MONTHS } from '@/lib/moderation/constants';

/**
 * The retention class map (@xidig/db/retention, R1a) must describe what the
 * app ACTUALLY does. packages/db cannot import the web app, so this side checks
 * that the map's windows and media purge scope match the live app constants.
 */

describe('retention config matches the app', () => {
  it('the restricted-metadata window is 365 days, longer than the deletion grace', () => {
    expect(RETENTION_WINDOW_DAYS).toBe(365);
    expect(RETENTION_WINDOW_DAYS).toBeGreaterThan(DELETION_GRACE_DAYS);
  });

  it('declared windows equal the constants that enforce them', () => {
    expect(RETENTION_WINDOWS.deletionGrace.days).toBe(DELETION_GRACE_DAYS);
    expect(RETENTION_WINDOWS.dmRequestTtl.days).toBe(DM_REQUEST_TTL_DAYS);
    expect(RETENTION_WINDOWS.verificationRecordings.days).toBe(RECORDING_RETENTION_MONTHS * 30);
  });

  it('the media kinds marked purged are exactly the lifecycle purge scope', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../lifecycle/media-cleanup.ts', import.meta.url)),
      'utf8',
    );
    const match = /const IDENTITY_KINDS = \[([^\]]*)\]/.exec(src);
    expect(match).not.toBeNull();
    const inCode = [...match![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const purged = Object.entries(MEDIA_KINDS)
      .filter(([, k]) => k.purgedOnDeletion)
      .map(([kind]) => kind)
      .sort();
    expect(purged).toEqual(inCode);
  });
});
