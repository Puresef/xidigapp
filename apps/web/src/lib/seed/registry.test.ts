import { describe, expect, it, vi } from 'vitest';

import { createSeededEntity } from './registry';

/**
 * Seed/external idempotency (PRD §21 "safe to re-run, no duplicates"). An
 * in-memory `seed_entities` table enforcing the real unique (entity_type,
 * dedup_key) constraint proves: (1) the first call creates once, (2) a re-run
 * with the same dedup key is a no-op that returns the SAME entity, (3) the
 * content-create callback runs exactly once.
 */

/** Fake service client backing a single seed_entities table. */
function makeFakeAdmin() {
  const rows: Array<Record<string, unknown>> = [];
  let seq = 0;

  function query() {
    const filters: Record<string, unknown> = {};
    let insertPayload: Record<string, unknown> | null = null;
    let updatePayload: Record<string, unknown> | null = null;

    const matches = (row: Record<string, unknown>) =>
      Object.entries(filters).every(([k, v]) => row[k] === v);

    async function resolve() {
      if (updatePayload) {
        const targets = rows.filter(matches);
        for (const r of targets) Object.assign(r, updatePayload);
        return { data: targets.map((r) => ({ id: r.id })), error: null };
      }
      if (insertPayload) {
        const dup = rows.find(
          (r) =>
            r.entity_type === insertPayload!.entity_type && r.dedup_key === insertPayload!.dedup_key,
        );
        if (dup) return { data: null, error: { code: '23505', message: 'duplicate' } };
        const row = { id: `e${++seq}`, entity_id: null, ...insertPayload };
        rows.push(row);
        return { data: { id: row.id }, error: null };
      }
      const found = rows.find(matches) ?? null;
      return {
        data: found ? { id: found.id, entity_id: found.entity_id } : null,
        error: null,
      };
    }

    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, val: unknown) => ((filters[col] = val), q),
      is: (col: string, val: unknown) => ((filters[col] = val), q),
      insert: (payload: Record<string, unknown>) => ((insertPayload = payload), q),
      update: (payload: Record<string, unknown>) => ((updatePayload = payload), q),
      maybeSingle: () => resolve(),
      single: () => resolve(),
      then: (onF: (v: unknown) => unknown) => resolve().then(onF),
    };
    return q;
  }

  return { admin: { from: () => query() }, rows };
}

describe('createSeededEntity idempotency', () => {
  it('creates once, then returns the same entity on re-run', async () => {
    const { admin, rows } = makeFakeAdmin();
    const create = vi.fn(async () => 'content-1');

    const first = await createSeededEntity(admin as never, {
      dedupKey: 'seed:launch:post:welcome',
      entityType: 'post',
      source: 'seed',
      create,
    });
    expect(first).toEqual({ entityId: 'content-1', created: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entity_id).toBe('content-1');

    const second = await createSeededEntity(admin as never, {
      dedupKey: 'seed:launch:post:welcome',
      entityType: 'post',
      source: 'seed',
      create,
    });
    expect(second).toEqual({ entityId: 'content-1', created: false });
    // The content callback did NOT run again — no duplicate content.
    expect(create).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  it('different dedup keys create distinct entities', async () => {
    const { admin, rows } = makeFakeAdmin();
    await createSeededEntity(admin as never, {
      dedupKey: 'seed:launch:post:a',
      entityType: 'post',
      source: 'seed',
      create: async () => 'a',
    });
    await createSeededEntity(admin as never, {
      dedupKey: 'seed:launch:post:b',
      entityType: 'post',
      source: 'ai',
      create: async () => 'b',
    });
    expect(rows).toHaveLength(2);
  });

  it('same dedup key under a different entity_type is independent', async () => {
    const { admin, rows } = makeFakeAdmin();
    await createSeededEntity(admin as never, {
      dedupKey: 'k1',
      entityType: 'post',
      source: 'seed',
      create: async () => 'p',
    });
    await createSeededEntity(admin as never, {
      dedupKey: 'k1',
      entityType: 'listing',
      source: 'seed',
      create: async () => 'l',
    });
    expect(rows).toHaveLength(2);
  });
});
