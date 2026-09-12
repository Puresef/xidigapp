import { describe, expect, it } from 'vitest';

import {
  dropDeletedHostUpcoming,
  eventHostState,
  keepProjectableListings,
  listingIsPubliclyProjectable,
} from './retained-content';

/**
 * Retained-content projection rules (owner rulings, 11 Sep). The pure
 * decisions are pinned exhaustively; the two list filters run against a tiny
 * fake admin whose `users` answers are the account statuses.
 */

function fakeAdmin(
  users: Array<{ id: string; status: string; is_ai?: boolean; is_test?: boolean }>,
) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const admin = {
    from(table: string) {
      const chain = {
        select: (...args: unknown[]) => (calls.push({ table, method: 'select', args }), chain),
        in: (...args: unknown[]) => (calls.push({ table, method: 'in', args }), chain),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === 'users' ? users.map((u) => ({ is_ai: false, is_test: false, ...u })) : [],
            error: null,
          }).then(resolve),
      };
      return chain;
    },
  };
  return { admin: admin as never, calls };
}

describe('listingIsPubliclyProjectable', () => {
  it.each([
    ['active', true],
    ['pending_deletion', true],
    ['deleted', false],
    ['suspended', false],
    ['deactivated', false],
  ] as const)('owner %s → %s', (status, expected) => {
    expect(listingIsPubliclyProjectable('owner-1', { status, isTest: false })).toBe(expected);
  });

  it('an owner-less (seeded, unclaimed) listing is always projectable', () => {
    expect(listingIsPubliclyProjectable(null, null)).toBe(true);
  });

  it('fails closed when the owner is unknown', () => {
    expect(listingIsPubliclyProjectable('owner-1', undefined)).toBe(false);
  });

  it('a quarantined test owner is never projectable, even while active', () => {
    for (const status of ['active', 'pending_deletion'] as const) {
      expect(listingIsPubliclyProjectable('owner-1', { status, isTest: true }), status).toBe(false);
    }
  });
});

describe('eventHostState', () => {
  it('only DELETION changes an event; suspension and the grace are unchanged', () => {
    for (const status of ['active', 'pending_deletion', 'suspended', 'deactivated'] as const) {
      expect(eventHostState(status, false, false), status).toBe('host_present');
      expect(eventHostState(status, true, false), status).toBe('host_present');
    }
  });

  it('a deleted host: upcoming is no longer running, past is history', () => {
    expect(eventHostState('deleted', false, false)).toBe('host_deleted_upcoming');
    expect(eventHostState('deleted', true, false)).toBe('host_deleted_past');
  });

  it('a Space-hosted event belongs to the Space and keeps running', () => {
    expect(eventHostState('deleted', false, true)).toBe('host_present');
    expect(eventHostState('deleted', true, true)).toBe('host_present');
  });

  it('an unknown host is treated as present (the rule acts only on a confirmed deletion)', () => {
    expect(eventHostState(undefined, false, false)).toBe('host_present');
  });
});

describe('keepProjectableListings', () => {
  it('drops non-live owners, keeps live owners and owner-less rows, preserves order', async () => {
    const { admin } = fakeAdmin([
      { id: 'live', status: 'active' },
      { id: 'grace', status: 'pending_deletion' },
      { id: 'gone', status: 'deleted' },
      { id: 'paused', status: 'suspended' },
    ]);
    const rows = [
      { id: 'a', owner_user_id: 'live' },
      { id: 'b', owner_user_id: 'gone' },
      { id: 'c', owner_user_id: null },
      { id: 'd', owner_user_id: 'grace' },
      { id: 'e', owner_user_id: 'paused' },
      { id: 'f', owner_user_id: 'missing' },
    ];
    const kept = await keepProjectableListings(admin, rows);
    expect(kept.map((row) => row.id)).toEqual(['a', 'c', 'd']);
  });

  it('drops a test-owned listing; an owner-less listing still projects', async () => {
    const { admin } = fakeAdmin([
      { id: 'real', status: 'active' },
      { id: 'persona', status: 'active', is_test: true },
    ]);
    const rows = [
      { id: 'real-shop', owner_user_id: 'real' },
      { id: 'persona-shop', owner_user_id: 'persona' },
      { id: 'unclaimed', owner_user_id: null },
    ];
    const kept = await keepProjectableListings(admin, rows);
    expect(kept.map((row) => row.id)).toEqual(['real-shop', 'unclaimed']);
  });
});

describe('dropDeletedHostUpcoming', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  const row = (id: string, host: string, startsAt: string, labId: string | null = null) => ({
    id,
    host_user_id: host,
    lab_id: labId,
    starts_at: startsAt,
    ends_at: null,
  });

  it('drops a deleted host’s upcoming member-hosted event; keeps past, Space-hosted and live-host rows', async () => {
    const { admin } = fakeAdmin([
      { id: 'gone', status: 'deleted' },
      { id: 'live', status: 'active' },
      { id: 'paused', status: 'suspended' },
    ]);
    const kept = await dropDeletedHostUpcoming(
      admin,
      [
        row('upcoming-gone', 'gone', '2026-09-20T10:00:00Z'),
        row('past-gone', 'gone', '2026-09-01T10:00:00Z'),
        row('space-gone', 'gone', '2026-09-20T10:00:00Z', 'lab-1'),
        row('upcoming-live', 'live', '2026-09-20T10:00:00Z'),
        row('upcoming-suspended', 'paused', '2026-09-20T10:00:00Z'),
      ],
      now,
    );
    expect(kept.map((r) => r.id)).toEqual([
      'past-gone',
      'space-gone',
      'upcoming-live',
      'upcoming-suspended',
    ]);
  });

  it('an event that has started but not ended (ends_at in the future) still counts as upcoming', async () => {
    const { admin } = fakeAdmin([{ id: 'gone', status: 'deleted' }]);
    const kept = await dropDeletedHostUpcoming(
      admin,
      [{ ...row('running', 'gone', '2026-09-11T10:00:00Z'), ends_at: '2026-09-11T18:00:00Z' }],
      now,
    );
    expect(kept).toEqual([]);
  });

  it('issues no account lookup for an empty list', async () => {
    const { admin, calls } = fakeAdmin([]);
    expect(await dropDeletedHostUpcoming(admin, [], now)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
