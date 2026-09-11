import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isRetainedAuthorStatus } from '@/lib/retained-content';

import { listPublicSpaceUpdates } from './public-updates';

/**
 * Retained content — the signed-out public Space page must never show more
 * than a signed-in member sees. Members read lab_updates under RLS with
 * author_is_retained() (live or deleted); the public page reads through the
 * service role and applies the same rule here.
 */

const ALL_STATUSES = ['active', 'pending_deletion', 'suspended', 'deactivated', 'deleted'] as const;

type Row = Record<string, unknown>;

function fakeAdmin(updates: Row[], users: Row[]) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let limit = Infinity;
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => {
          filters.push((r) => r[c] === v);
          return builder;
        },
        in: (c: string, vs: unknown[]) => {
          filters.push((r) => vs.includes(r[c]));
          return builder;
        },
        order: () => builder,
        limit: (n: number) => {
          limit = n;
          return builder;
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          const source = table === 'lab_updates' ? updates : table === 'users' ? users : [];
          resolve({
            data: source.filter((r) => filters.every((f) => f(r))).slice(0, limit),
            error: null,
          });
        },
      };
      return builder;
    },
  };
}

const update = (id: string, author: string | null) => ({
  id,
  title: null,
  body: `update ${id}`,
  created_at: '2026-09-01T00:00:00Z',
  author_user_id: author,
  lab_id: 'lab',
  status: 'published',
});

describe('listPublicSpaceUpdates', () => {
  const users = ALL_STATUSES.map((status) => ({ id: `u-${status}`, status, is_ai: false }));
  const updates = [
    ...ALL_STATUSES.map((status) => update(`by-${status}`, `u-${status}`)),
    update('no-author', null),
  ];

  it('shows live and deleted authors’ updates, hides suspended and deactivated (no inversion)', async () => {
    const shown = await listPublicSpaceUpdates(fakeAdmin(updates, users) as never, 'lab');
    expect(shown.map((u) => u.id).sort()).toEqual(
      ['by-active', 'by-deleted', 'by-pending_deletion', 'no-author'].sort(),
    );
  });

  it('never ships the author id to the page', async () => {
    const shown = await listPublicSpaceUpdates(fakeAdmin(updates, users) as never, 'lab');
    for (const row of shown)
      expect(Object.keys(row).sort()).toEqual(['body', 'created_at', 'id', 'title']);
  });

  it('an unknown author fails closed (hidden)', async () => {
    const shown = await listPublicSpaceUpdates(
      fakeAdmin([update('ghost', 'u-missing')], users) as never,
      'lab',
    );
    expect(shown).toEqual([]);
  });

  it('still fills the page when hidden rows drop out', async () => {
    const many = [
      ...Array.from({ length: 5 }, (_, i) => update(`hidden-${i}`, 'u-suspended')),
      ...Array.from({ length: 5 }, (_, i) => update(`live-${i}`, 'u-active')),
    ];
    const shown = await listPublicSpaceUpdates(fakeAdmin(many, users) as never, 'lab', 3);
    expect(shown).toHaveLength(3);
    expect(shown.every((u) => u.id.startsWith('live-'))).toBe(true);
  });
});

describe('isRetainedAuthorStatus is the SQL author_is_retained(), status for status', () => {
  it('matches the status list in migration 20260911001100 exactly', () => {
    const sql = readFileSync(
      path.resolve(
        __dirname,
        '../../../../../packages/db/supabase/migrations/20260911001100_retained_space_history.sql',
      ),
      'utf8',
    );
    const match = /u\.status in \(([^)]*)\)/.exec(sql);
    expect(match, 'status list not found in the migration').not.toBeNull();
    const sqlStatuses = match![1]!
      .split(',')
      .map((s) => s.trim().replace(/'/g, ''))
      .sort();
    const tsStatuses = ALL_STATUSES.filter((s) => isRetainedAuthorStatus(s)).sort();
    expect(tsStatuses).toEqual(sqlStatuses);
  });
});
