import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';
import { seedLab, seedMember, seedMembership, seedMod, setStatus } from './testing/factories';

/**
 * Retained content — Space history after account deletion
 * (migration 20260911001100_retained_space_history.sql; owner ruling 11 Sep).
 *
 * A deleted member's Space updates, decisions and artifacts stay Space
 * history: readable by exactly the Space's audience (can_read_lab), no wider
 * and no narrower, attributed to the scrubbed tombstone. Suspended and
 * deactivated authors stay hidden, as before. Plaza posts keep the old rule
 * (author_is_active) — no ruling covers them in this slice.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function anonymise(userId: string): Promise<void> {
  await db.admin.query(
    `update users set status = 'pending_deletion', deletion_requested_at = now() - interval '31 days'
      where id = $1`,
    [userId],
  );
  await db.withRole('service_role', null, (tx) =>
    tx.query(`select public.anonymise_user($1)`, [userId]),
  );
}

interface History {
  lab: string;
  lead: string;
  author: string;
  reader: string;
  stranger: string;
  update: string;
  decision: string;
  artifact: string;
  post: string;
}

/**
 * A PRIVATE Space (only its own members read it — 'members' visibility means
 * every signed-in member) with one piece of each kind of history by `author`.
 */
async function seedHistory(tag: string): Promise<History> {
  const lead = await seedMember(db, `${tag}_lead`);
  const author = await seedMember(db, `${tag}_author`);
  const reader = await seedMember(db, `${tag}_reader`);
  const stranger = await seedMember(db, `${tag}_stranger`);
  const lab = await seedLab(db, lead, `${tag.replace(/_/g, '-')}-lab`);
  await db.admin.query(`update labs set visibility = 'private' where id = $1`, [lab]);
  await seedMembership(db, lab, author);
  await seedMembership(db, lab, reader);
  const one = async (sql: string, params: unknown[]) =>
    ((await db.admin.query(sql, params)).rows[0] as { id: string }).id;
  return {
    lab,
    lead,
    author,
    reader,
    stranger,
    update: await one(
      `insert into lab_updates (lab_id, author_user_id, body) values ($1, $2, 'Shipped the pilot') returning id`,
      [lab, author],
    ),
    decision: await one(
      `insert into lab_decisions (lab_id, title, decision, created_by_user_id)
       values ($1, 'Supplier', 'Go with the co-op', $2) returning id`,
      [lab, author],
    ),
    artifact: await one(
      `insert into lab_artifacts (lab_id, added_by_user_id, title, url)
       values ($1, $2, 'Budget sheet', 'https://example.com/sheet') returning id`,
      [lab, author],
    ),
    post: await one(
      `insert into posts (author_user_id, type, body, status, lab_id)
       values ($1, 'update', 'Space discussion post', 'published', $2) returning id`,
      [author, lab],
    ),
  };
}

async function sees(viewer: string, table: string, id: string): Promise<number> {
  const res = await db.asUser(viewer, (tx) =>
    tx.query(`select 1 from ${table} where id = $1`, [id]),
  );
  return res.rowCount ?? 0;
}

describe('a deleted member’s Space history stays with the same audience (private Space)', () => {
  let h: History;
  let mod: string;

  beforeAll(async () => {
    h = await seedHistory('rsh');
    mod = await seedMod(db, 'rsh_mod');
    await anonymise(h.author);
  });

  it('the author is now a scrubbed tombstone', async () => {
    const res = await db.admin.query(
      `select u.status, p.display_name, p.handle like 'deleted_%' as tombstone
         from users u join profiles p on p.user_id = u.id where u.id = $1`,
      [h.author],
    );
    expect(res.rows[0]).toEqual({
      status: 'deleted',
      display_name: 'Deleted member',
      tombstone: true,
    });
  });

  it('Space members still read the update, decision and artifact (no shrink)', async () => {
    for (const viewer of [h.reader, h.lead]) {
      expect(await sees(viewer, 'lab_updates', h.update)).toBe(1);
      expect(await sees(viewer, 'lab_decisions', h.decision)).toBe(1);
      expect(await sees(viewer, 'lab_artifacts', h.artifact)).toBe(1);
    }
    expect(await sees(mod, 'lab_updates', h.update)).toBe(1);
  });

  it('a non-member still reads none of it (no widening of a private Space)', async () => {
    expect(await sees(h.stranger, 'lab_updates', h.update)).toBe(0);
    expect(await sees(h.stranger, 'lab_decisions', h.decision)).toBe(0);
    expect(await sees(h.stranger, 'lab_artifacts', h.artifact)).toBe(0);
  });

  it('anon still reads nothing', async () => {
    const res = await db.withRole('anon', null, (tx) =>
      tx.query(`select 1 from lab_updates where id = $1`, [h.update]),
    );
    expect(res.rowCount).toBe(0);
  });

  it('attribution resolves to the tombstone, never the old identity', async () => {
    const res = await db.asUser(h.reader, (tx) =>
      tx.query(
        `select p.display_name from lab_updates u join profiles p on p.user_id = u.author_user_id
          where u.id = $1`,
        [h.update],
      ),
    );
    expect(res.rows).toEqual([{ display_name: 'Deleted member' }]);
  });

  it('Plaza posts keep the old rule: a deleted author’s Space post stays hidden (unchanged, no ruling)', async () => {
    expect(await sees(h.reader, 'posts', h.post)).toBe(0);
  });
});

describe('suspended and deactivated authors are unchanged — still hidden', () => {
  it.each(['suspended', 'deactivated'] as const)(
    '%s author’s history is hidden from members',
    async (status) => {
      const h = await seedHistory(`rs_${status.slice(0, 4)}`);
      await setStatus(db, h.author, status);
      expect(await sees(h.reader, 'lab_updates', h.update)).toBe(0);
      expect(await sees(h.reader, 'lab_decisions', h.decision)).toBe(0);
      expect(await sees(h.reader, 'lab_artifacts', h.artifact)).toBe(0);
    },
  );

  it('a live author’s history is visible (control)', async () => {
    const h = await seedHistory('rs_live');
    expect(await sees(h.reader, 'lab_updates', h.update)).toBe(1);
  });
});

describe('the predicate itself', () => {
  it('author_is_retained admits exactly active, pending_deletion and deleted', async () => {
    const cases: [string, boolean][] = [
      ['active', true],
      ['pending_deletion', true],
      ['deleted', true],
      ['suspended', false],
      ['deactivated', false],
    ];
    for (const [status, expected] of cases) {
      const user = await seedMember(db, `rsp_${status.slice(0, 6)}`);
      await setStatus(db, user, status);
      const res = await db.admin.query(`select public.author_is_retained($1) as ok`, [user]);
      expect((res.rows[0] as { ok: boolean }).ok, status).toBe(expected);
    }
  });

  it('author_is_active keeps its meaning (deleted is NOT active)', async () => {
    const user = await seedMember(db, 'rsp_contrast');
    await setStatus(db, user, 'deleted');
    const res = await db.admin.query(`select public.author_is_active($1) as ok`, [user]);
    expect((res.rows[0] as { ok: boolean }).ok).toBe(false);
  });
});

describe('PUBLIC Space: the member-authorised view the public page must never exceed', () => {
  it.each([
    ['active', 1],
    ['pending_deletion', 1],
    ['deleted', 1],
    ['suspended', 0],
    ['deactivated', 0],
  ] as const)(
    'an update by a %s author is visible to a signed-in non-member: %i',
    async (status, expected) => {
      const h = await seedHistory(`rpub_${status.slice(0, 4)}`);
      await db.admin.query(`update labs set visibility = 'public' where id = $1`, [h.lab]);
      if (status === 'deleted') await anonymise(h.author);
      else await setStatus(db, h.author, status);
      // The stranger is not a Space member — for a public Space this is the
      // widest authorised reader, i.e. exactly what the signed-out page may show
      // (apps/web/src/lib/labs/public-updates.ts applies the same rule).
      expect(await sees(h.stranger, 'lab_updates', h.update)).toBe(expected);
    },
  );
});
