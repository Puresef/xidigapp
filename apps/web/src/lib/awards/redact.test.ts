import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '@xidig/i18n';

import { TOMBSTONE_DISPLAY_NAME } from '@/lib/retained-content';

import { renderAwardResultBody } from './publish';
import { redactDeletedWinnerAwardPosts } from './redact';

/**
 * Retained content — award results posts that baked a deleted winner's name
 * into their stored body. Pinned here: exactly the deleted-winner posts are
 * rewritten, to the publisher's own text with the tombstone name; live
 * winners, Space winners and non-system posts are untouched; a re-run is a
 * no-op; the audit row never carries the old text; a failed write is counted.
 */

const audits = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('@/lib/audit', () => ({
  writeAudit: async (_admin: unknown, entry: Record<string, unknown>) => {
    audits.push(entry);
  },
}));

type Row = Record<string, unknown>;

/** Just enough of the PostgREST builder for this module. */
class FakeDb {
  updates: Array<{ id: unknown; body: unknown }> = [];
  failUpdateFor = new Set<string>();
  constructor(public tables: Record<string, Row[]>) {}

  from(table: string) {
    const { tables, updates, failUpdateFor } = this;
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    const builder = {
      select: () => builder,
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      not: (column: string, _op: string, value: unknown) => {
        filters.push((row) => row[column] !== value);
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      update: (values: Row) => {
        patch = values;
        return builder;
      },
      then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => void) {
        const rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        if (patch) {
          for (const row of rows) {
            if (failUpdateFor.has(row.id as string)) {
              resolve({ data: null, error: { message: 'write refused' } });
              return;
            }
            Object.assign(row, patch);
            updates.push({ id: row.id, body: patch.body });
          }
          resolve({ data: rows, error: null });
          return;
        }
        resolve({ data: rows, error: null });
      },
    };
    return builder;
  }
}

const so = createTranslator('so');
const REAL_NAME = 'Hodan Real-Name';
const bodyFor = (category: 'most_helpful' | 'best_win' | 'best_lab', name: string) =>
  renderAwardResultBody(so, { category, quarter: '2026-Q3', name });

function world(): FakeDb {
  return new FakeDb({
    award_results: [
      // A deleted member won Most helpful.
      {
        quarter: '2026-Q3',
        category: 'most_helpful',
        target_type: 'user',
        target_id: 'u-deleted',
        post_id: 'p-help',
      },
      // A deleted member's (untitled) Win won Best win.
      {
        quarter: '2026-Q3',
        category: 'best_win',
        target_type: 'post',
        target_id: 'win-1',
        post_id: 'p-win',
      },
      // A Space won — never a person.
      {
        quarter: '2026-Q3',
        category: 'best_lab',
        target_type: 'lab',
        target_id: 'lab-1',
        post_id: 'p-lab',
      },
      // A live member won in an earlier cycle.
      {
        quarter: '2026-Q2',
        category: 'most_helpful',
        target_type: 'user',
        target_id: 'u-live',
        post_id: 'p-live',
      },
    ],
    users: [
      { id: 'u-deleted', status: 'deleted', is_ai: false },
      { id: 'u-author', status: 'deleted', is_ai: false },
      { id: 'u-live', status: 'active', is_ai: false },
    ],
    posts: [
      { id: 'p-help', source: 'system', body: bodyFor('most_helpful', REAL_NAME) },
      { id: 'p-win', source: 'system', body: bodyFor('best_win', REAL_NAME) },
      { id: 'p-lab', source: 'system', body: bodyFor('best_lab', 'Warshadda Kalluunka') },
      {
        id: 'p-live',
        source: 'system',
        body: renderAwardResultBody(so, {
          category: 'most_helpful',
          quarter: '2026-Q2',
          name: 'Live Winner',
        }),
      },
      { id: 'win-1', source: 'member', author_user_id: 'u-author', body: 'the winning Win' },
    ],
  });
}

const post = (db: FakeDb, id: string) => db.tables.posts!.find((p) => p.id === id)!;

beforeEach(() => {
  audits.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('redactDeletedWinnerAwardPosts', () => {
  it('rewrites exactly the deleted-winner posts to the tombstone', async () => {
    const db = world();
    const result = await redactDeletedWinnerAwardPosts(db as never);

    expect(result).toEqual({ redacted: 2, failed: 0 });
    expect(post(db, 'p-help').body).toBe(bodyFor('most_helpful', TOMBSTONE_DISPLAY_NAME));
    expect(post(db, 'p-win').body).toBe(bodyFor('best_win', TOMBSTONE_DISPLAY_NAME));
    for (const id of ['p-help', 'p-win']) expect(post(db, id).body).not.toContain(REAL_NAME);
  });

  it('leaves live winners, Space winners and the winning member post untouched', async () => {
    const db = world();
    await redactDeletedWinnerAwardPosts(db as never);
    expect(post(db, 'p-live').body).toContain('Live Winner');
    expect(post(db, 'p-lab').body).toContain('Warshadda Kalluunka');
    expect(post(db, 'win-1').body).toBe('the winning Win');
    expect(db.updates.map((u) => u.id).sort()).toEqual(['p-help', 'p-win']);
  });

  it('keeps the publisher’s exact text apart from the name (same renderer, fixed Somali)', async () => {
    const db = world();
    await redactDeletedWinnerAwardPosts(db as never);
    const before = bodyFor('most_helpful', REAL_NAME);
    expect(post(db, 'p-help').body).toBe(before.replace(REAL_NAME, TOMBSTONE_DISPLAY_NAME));
  });

  it('is idempotent — a second run rewrites nothing and audits nothing', async () => {
    const db = world();
    await redactDeletedWinnerAwardPosts(db as never);
    audits.length = 0;
    db.updates.length = 0;
    expect(await redactDeletedWinnerAwardPosts(db as never)).toEqual({ redacted: 0, failed: 0 });
    expect(db.updates).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('audits each rewrite by post and category — never the old text', async () => {
    const db = world();
    await redactDeletedWinnerAwardPosts(db as never);
    expect(audits).toHaveLength(2);
    for (const entry of audits) {
      expect(entry).toMatchObject({ action: 'award_post.winner_redacted', targetType: 'post' });
      expect(JSON.stringify(entry)).not.toContain(REAL_NAME);
    }
  });

  it('never rewrites a post that is not a system post', async () => {
    const db = world();
    post(db, 'p-help').source = 'member';
    const result = await redactDeletedWinnerAwardPosts(db as never);
    expect(post(db, 'p-help').body).toContain(REAL_NAME);
    expect(result.redacted).toBe(1);
  });

  it('counts a failed write as owed work and carries on', async () => {
    const db = world();
    db.failUpdateFor.add('p-help');
    const result = await redactDeletedWinnerAwardPosts(db as never);
    expect(result).toEqual({ redacted: 1, failed: 1 });
    expect(
      JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls),
    ).not.toContain(REAL_NAME);
  });
});

describe('the tombstone name matches the database scrub', () => {
  it('TOMBSTONE_DISPLAY_NAME is the literal anonymise_user() writes', () => {
    const sql = readFileSync(
      path.resolve(
        __dirname,
        '../../../../../packages/db/supabase/migrations/20260911000100_anonymise_user.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(new RegExp(`display_name\\s*=\\s*'${TOMBSTONE_DISPLAY_NAME}'`));
  });
});
