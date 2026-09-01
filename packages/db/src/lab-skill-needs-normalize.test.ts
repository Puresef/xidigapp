import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedLab, seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * lab_skill_needs canonicalization (migration 20260901000100). Proves the
 * "looking for" side of the skill vocabulary now folds like every other skill
 * surface: a need entered as "React" is stored as the canonical token, so the
 * case-sensitive matcher join and the partial open-need unique index behave.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('lab_skill_needs normalization', () => {
  it('folds skill to btrim(lower()) on insert — "React" need matches a "react" member token', async () => {
    const lead = await seedMember(db, 'lsn_lead');
    const labId = await seedLab(db, lead, 'lsn-lab');

    await db.admin.query(`insert into lab_skill_needs (lab_id, skill) values ($1, 'React')`, [
      labId,
    ]);

    // The matcher joins member-side canonical tokens (always lowercase, per
    // 20260718200000) against this column with case-sensitive equality —
    // exactly this query shape.
    const match = await db.admin.query(
      `select skill from lab_skill_needs
        where skill in ('react') and filled_at is null and lab_id = $1`,
      [labId],
    );
    expect(match.rowCount).toBe(1);
    expect((match.rows[0] as { skill: string }).skill).toBe('react');
  });

  it('case/spacing variants of an open need collide on the unique index instead of coexisting', async () => {
    const lead = await seedMember(db, 'lsn_dupe');
    const labId = await seedLab(db, lead, 'lsn-dupe-lab');

    await db.admin.query(`insert into lab_skill_needs (lab_id, skill) values ($1, 'design')`, [
      labId,
    ]);
    await expect(
      db.admin.query(`insert into lab_skill_needs (lab_id, skill) values ($1, ' Design ')`, [
        labId,
      ]),
    ).rejects.toThrow(/duplicate key|lab_skill_needs_open_uq/i);
  });

  it('normalizes on update too', async () => {
    const lead = await seedMember(db, 'lsn_upd');
    const labId = await seedLab(db, lead, 'lsn-upd-lab');

    await db.admin.query(`insert into lab_skill_needs (lab_id, skill) values ($1, 'ops')`, [labId]);
    await db.admin.query(
      `update lab_skill_needs set skill = '  Growth Marketing ' where lab_id = $1`,
      [labId],
    );
    const r = await db.admin.query(`select skill from lab_skill_needs where lab_id = $1`, [labId]);
    expect((r.rows[0] as { skill: string }).skill).toBe('growth marketing');
  });
});
