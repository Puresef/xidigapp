import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Aniga v3 — modular profile (migration 20260811000000).
 *
 * These are the acceptance criteria that only a database can answer. Every one
 * of them exists because the corresponding UI rule is unenforceable in the
 * client: a toggle the owner is not allowed to flip has to be *rejected* by the
 * server, a verification badge has to be unwritable by the member wearing it,
 * and a distinct-endorser count has to be a constraint rather than a SELECT
 * DISTINCT someone can forget.
 *
 * Read alongside the acceptance table in ANIGA-SPEC §0: A3 (flag-gated metrics,
 * owner toggle rejected), A7 (verified only via completed link-back), A8
 * (endorsement counts are distinct endorsers), A12 (no event, no badge).
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

/** Flip a platform flag the way an admin/service-role operator would. */
async function setFlag(key: string, enabled: boolean): Promise<void> {
  await db.admin.query(`update feature_flags set enabled = $2 where key = $1`, [key, enabled]);
}

/** The manager's save path: the RPC the API calls with the service role. */
async function saveModules(
  userId: string,
  modules: ReadonlyArray<{ module_id: string; position: number; visible: boolean }>,
): Promise<void> {
  await db.withRole('service_role', null, (tx) =>
    tx.query(`select set_profile_modules($1, $2::jsonb)`, [userId, JSON.stringify(modules)]),
  );
}

describe('feature flags', () => {
  it('seeds the metrics module flag OFF (ruling 7: a platform decision, not a setting)', async () => {
    const row = await db.admin.query(
      `select enabled from feature_flags where key = 'profile_metrics_module'`,
    );
    expect(row.rowCount).toBe(1);
    expect((row.rows[0] as { enabled: boolean }).enabled).toBe(false);
  });

  it('answers one boolean and never exposes the roster', async () => {
    const member = await seedMember(db, 'flag_reader');

    // The reader is the only path in: members can call it...
    const answer = await db.asUser(member, (tx) =>
      tx.query(`select is_feature_enabled('profile_metrics_module') as enabled`),
    );
    expect((answer.rows[0] as { enabled: boolean }).enabled).toBe(false);

    // ...but the table itself is closed, so nobody can enumerate what exists
    // or read a flag the platform has not chosen to answer for.
    await expect(
      db.asUser(member, (tx) => tx.query(`select key from feature_flags`)),
    ).rejects.toThrow(/permission denied/i);
  });

  it('resolves an unknown flag to false rather than null', async () => {
    // Fail-closed: a typo in a requires_flag must lock the module, not open it.
    const answer = await db.admin.query(`select is_feature_enabled('no_such_flag') as enabled`);
    expect((answer.rows[0] as { enabled: boolean }).enabled).toBe(false);
  });
});

describe('module registry', () => {
  it('seeds all eight modules with metrics last, hidden and flag-gated', async () => {
    const rows = await db.admin.query(
      `select id, default_position, default_visible, requires_flag
       from profile_module_kinds order by default_position`,
    );
    expect(rows.rows.map((r) => (r as { id: string }).id)).toEqual([
      'showcase',
      'skills',
      'links',
      'looking_for',
      'spaces',
      'helper',
      'suuq',
      'metrics',
    ]);

    const metrics = rows.rows.at(-1) as { default_visible: boolean; requires_flag: string };
    expect(metrics.default_visible).toBe(false);
    expect(metrics.requires_flag).toBe('profile_metrics_module');
  });

  it('lets a member read the registry but never write it', async () => {
    const member = await seedMember(db, 'mod_reader');
    const read = await db.asUser(member, (tx) => tx.query(`select id from profile_module_kinds`));
    expect(read.rowCount).toBe(8);

    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into profile_module_kinds (id, default_position) values ('rogue', 99)`),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('treats absence as defaults — a pre-migration profile stores no rows', async () => {
    const member = await seedMember(db, 'mod_defaults');
    const rows = await db.admin.query(`select 1 from profile_modules where user_id = $1`, [member]);
    expect(rows.rowCount).toBe(0);
  });
});

describe('flag-gated modules (A3 — the owner toggle is rejected, not hidden)', () => {
  it('raises on a direct insert that publishes metrics while the flag is off', async () => {
    const member = await seedMember(db, 'flag_direct');
    await expect(
      db.admin.query(
        `insert into profile_modules (user_id, module_id, position, visible)
         values ($1, 'metrics', 8, true)`,
        [member],
      ),
    ).rejects.toThrow(/module_flag_disabled/);
  });

  it('accepts the same row hidden — hiding a locked module is not the rejected act', async () => {
    const member = await seedMember(db, 'flag_hidden');
    await db.admin.query(
      `insert into profile_modules (user_id, module_id, position, visible)
       values ($1, 'metrics', 8, false)`,
      [member],
    );
    const rows = await db.admin.query(
      `select visible from profile_modules where user_id = $1 and module_id = 'metrics'`,
      [member],
    );
    expect((rows.rows[0] as { visible: boolean }).visible).toBe(false);
  });

  it('rejects an UPDATE that flips a locked module on', async () => {
    const member = await seedMember(db, 'flag_update');
    await db.admin.query(
      `insert into profile_modules (user_id, module_id, position, visible)
       values ($1, 'metrics', 8, false)`,
      [member],
    );
    // The trigger fires BEFORE UPDATE too — otherwise "insert hidden, then
    // update visible" would be a two-step bypass of the whole rule.
    await expect(
      db.admin.query(
        `update profile_modules set visible = true where user_id = $1 and module_id = 'metrics'`,
        [member],
      ),
    ).rejects.toThrow(/module_flag_disabled/);
  });

  it('rejects the RPC path the API uses — the manager cannot save it either', async () => {
    const member = await seedMember(db, 'flag_rpc');
    await expect(
      saveModules(member, [
        { module_id: 'showcase', position: 1, visible: true },
        { module_id: 'metrics', position: 2, visible: true },
      ]),
    ).rejects.toThrow(/module_flag_disabled/);

    // And the rejection is atomic: the RPC deletes-then-reinserts, so a
    // partially applied save would have stranded this member with no modules
    // at all. The whole statement rolls back.
    const rows = await db.admin.query(`select 1 from profile_modules where user_id = $1`, [member]);
    expect(rows.rowCount).toBe(0);
  });

  it('accepts the same save once the platform flips the flag on', async () => {
    const member = await seedMember(db, 'flag_on');
    await setFlag('profile_metrics_module', true);
    try {
      await saveModules(member, [
        { module_id: 'showcase', position: 1, visible: true },
        { module_id: 'metrics', position: 2, visible: true },
      ]);
      const rows = await db.admin.query(
        `select visible from profile_modules where user_id = $1 and module_id = 'metrics'`,
        [member],
      );
      expect((rows.rows[0] as { visible: boolean }).visible).toBe(true);
    } finally {
      await setFlag('profile_metrics_module', false);
    }
  });

  it('keeps module writes API-only — a member cannot write their own row', async () => {
    const member = await seedMember(db, 'mod_write');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into profile_modules (user_id, module_id, position, visible)
           values ($1, 'showcase', 1, true)`,
          [member],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('reserves the save RPC for the service role', async () => {
    const member = await seedMember(db, 'mod_rpc_denied');
    await expect(
      db.asUser(member, (tx) => tx.query(`select set_profile_modules($1, '[]'::jsonb)`, [member])),
    ).rejects.toThrow(/permission denied/i);
  });

  it('reorders a whole set in one statement (deferred position uniqueness)', async () => {
    const member = await seedMember(db, 'mod_reorder');
    await saveModules(member, [
      { module_id: 'showcase', position: 1, visible: true },
      { module_id: 'skills', position: 2, visible: true },
    ]);
    // Swapping two positions transiently duplicates one — only a DEFERRABLE
    // constraint survives that inside a single statement.
    await saveModules(member, [
      { module_id: 'skills', position: 1, visible: true },
      { module_id: 'showcase', position: 2, visible: false },
    ]);

    const rows = await db.admin.query(
      `select module_id, visible from profile_modules where user_id = $1 order by position`,
      [member],
    );
    expect(rows.rows).toEqual([
      { module_id: 'skills', visible: true },
      { module_id: 'showcase', visible: false },
    ]);
  });
});

describe('endorsement counts are distinct endorsers (A8)', () => {
  it('refuses a second endorsement of the same skill by the same endorser', async () => {
    const endorsee = await seedMember(db, 'end_subject');
    const endorser = await seedMember(db, 'end_author');

    const insert = () =>
      db.asUser(endorser, (tx) =>
        tx.query(
          `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill)
           values ($1, $2, 'react')`,
          [endorser, endorsee],
        ),
      );

    await insert();
    await expect(insert()).rejects.toThrow(/skill_endorsements_unique|duplicate key/i);

    // The count the profile renders is therefore structurally "distinct
    // endorsers" — no DISTINCT in the read path can be forgotten.
    const count = await db.admin.query(
      `select count(*)::int as n from skill_endorsements where endorsee_user_id = $1 and skill = 'react'`,
      [endorsee],
    );
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });

  it('counts two different endorsers as two', async () => {
    const endorsee = await seedMember(db, 'end_subject2');
    const a = await seedMember(db, 'end_a');
    const b = await seedMember(db, 'end_b');

    for (const endorser of [a, b]) {
      await db.asUser(endorser, (tx) =>
        tx.query(
          `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill)
           values ($1, $2, 'rust')`,
          [endorser, endorsee],
        ),
      );
    }

    const count = await db.admin.query(
      `select count(*)::int as n from skill_endorsements where endorsee_user_id = $1 and skill = 'rust'`,
      [endorsee],
    );
    expect((count.rows[0] as { n: number }).n).toBe(2);
  });

  it('refuses a self-endorsement', async () => {
    const member = await seedMember(db, 'end_self');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill)
           values ($1, $1, 'react')`,
          [member],
        ),
      ),
    ).rejects.toThrow(/skill_endorsements_no_self/);
  });

  it('indexes the per-profile grouped read the module runs on every view', async () => {
    const idx = await db.admin.query(
      `select indexdef from pg_indexes
       where tablename = 'skill_endorsements' and indexname = 'skill_endorsements_endorsee_skill_idx'`,
    );
    expect(idx.rowCount).toBe(1);
  });
});

describe('link-back verification ladder (A7)', () => {
  it('refuses verified without a moment, and a moment without verified', async () => {
    const member = await seedMember(db, 'link_gate');

    await expect(
      db.admin.query(
        `insert into profile_link_meta (user_id, url_key, verification_status)
         values ($1, 'hodan.dev', 'verified')`,
        [member],
      ),
    ).rejects.toThrow(/profile_link_meta_verified_at_consistent/);

    // The constraint is an equivalence, not an implication: an unverified row
    // cannot carry a verified_at either, so the timestamp can never outlive a
    // revocation and re-read as a badge.
    await expect(
      db.admin.query(
        `insert into profile_link_meta (user_id, url_key, verification_status, verified_at)
         values ($1, 'hodan.dev', 'unverified', now())`,
        [member],
      ),
    ).rejects.toThrow(/profile_link_meta_verified_at_consistent/);
  });

  it('accepts the pair the checker writes together', async () => {
    const member = await seedMember(db, 'link_ok');
    await db.admin.query(
      `insert into profile_link_meta (user_id, url_key, verification_status, verified_at)
       values ($1, 'hodan.dev', 'verified', now())`,
      [member],
    );
    const row = await db.admin.query(
      `select verification_status, verified_at from profile_link_meta where user_id = $1`,
      [member],
    );
    expect((row.rows[0] as { verification_status: string }).verification_status).toBe('verified');
    expect((row.rows[0] as { verified_at: Date | null }).verified_at).not.toBeNull();
  });

  it('withholds the token from every member client, the owner included', async () => {
    const owner = await seedMember(db, 'link_owner');
    const visitor = await seedMember(db, 'link_visitor');
    await db.admin.query(
      `insert into profile_link_meta (user_id, url_key, verification_status, verified_at)
       values ($1, 'hodan.dev', 'verified', now())`,
      [owner],
    );

    // Status is readable by any member — that is the whole point of the badge.
    for (const viewer of [owner, visitor]) {
      const row = await db.asUser(viewer, (tx) =>
        tx.query(`select verification_status from profile_link_meta where user_id = $1`, [owner]),
      );
      expect((row.rows[0] as { verification_status: string }).verification_status).toBe('verified');
    }

    // The nonce is not. A visitor who could read it could plant it on their own
    // page; the owner reads it through the API, which uses the service role.
    for (const viewer of [owner, visitor]) {
      await expect(
        db.asUser(viewer, (tx) =>
          tx.query(`select verification_token from profile_link_meta where user_id = $1`, [owner]),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('never lets a member write their own verification status', async () => {
    const member = await seedMember(db, 'link_selfassert');
    await db.admin.query(
      `insert into profile_link_meta (user_id, url_key) values ($1, 'hodan.dev')`,
      [member],
    );
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `update profile_link_meta set verification_status = 'verified', verified_at = now()
           where user_id = $1`,
          [member],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('issues a distinct token per row and defaults the ladder to its bottom rung', async () => {
    const a = await seedMember(db, 'link_tok_a');
    const b = await seedMember(db, 'link_tok_b');
    for (const member of [a, b]) {
      await db.admin.query(
        `insert into profile_link_meta (user_id, url_key) values ($1, 'hodan.dev')`,
        [member],
      );
    }
    const rows = await db.admin.query(
      `select verification_token, verification_status, og_status from profile_link_meta
       where user_id = any($1::uuid[])`,
      [[a, b]],
    );
    const tokens = rows.rows.map((r) => (r as { verification_token: string }).verification_token);
    expect(new Set(tokens).size).toBe(2);
    expect(tokens.every((t) => t.length === 32)).toBe(true);
    for (const row of rows.rows as Array<{ verification_status: string; og_status: string }>) {
      expect(row.verification_status).toBe('unverified');
      expect(row.og_status).toBe('pending');
    }
  });

  it('constrains og_status to the three the degrade path knows', async () => {
    const member = await seedMember(db, 'link_og');
    await expect(
      db.admin.query(
        `insert into profile_link_meta (user_id, url_key, og_status) values ($1, 'hodan.dev', 'maybe')`,
        [member],
      ),
    ).rejects.toThrow(/profile_link_meta_og_status/);
  });
});

describe('badge provenance — no event, no badge (A12)', () => {
  it('classifies the canon: roles neutral, identity and tenure their own class', async () => {
    const rows = await db.admin.query(
      `select slug, badge_class from badge_definitions order by slug`,
    );
    const byClass = new Map(
      rows.rows.map((r) => {
        const row = r as { slug: string; badge_class: string };
        return [row.slug, row.badge_class] as const;
      }),
    );
    expect(byClass.get('identity-verified')).toBe('identity');
    expect(byClass.get('verified-business')).toBe('identity');
    expect(byClass.get('founding-member')).toBe('tenure');
    // The one that matters most: a role must be neutral BY DATA, so a new role
    // badge is neutral by default rather than neutral by someone remembering.
    expect(byClass.get('lab-lead')).toBe('role');
    expect(byClass.get('mentor-in-residence')).toBe('role');
    expect(byClass.get('top-helper')).toBe('earned');
  });

  it('ships one garab definition, not three (ruling 10c)', async () => {
    const rows = await db.admin.query(
      `select badge_class from badge_definitions where slug like 'garab%'`,
    );
    expect(rows.rowCount).toBe(1);
    expect((rows.rows[0] as { badge_class: string }).badge_class).toBe('earned');
  });

  it('refuses an earned badge with no earning event', async () => {
    const member = await seedMember(db, 'badge_noevent');
    await expect(
      db.withRole('service_role', null, (tx) =>
        tx.query(`select award_badge($1, 'top-helper')`, [member]),
      ),
    ).rejects.toThrow(/badge_requires_earning_event/);
  });

  it('grants an earned badge that carries its event, and copies the provenance', async () => {
    const member = await seedMember(db, 'badge_event');
    const evt = await db.admin.query(
      `insert into reputation_events (user_id, event_type, points, entity_type, entity_id)
       values ($1, 'ask_credited', 5, 'post', gen_random_uuid()) returning id, entity_id`,
      [member],
    );
    const { id: eventId, entity_id: entityId } = evt.rows[0] as {
      id: string;
      entity_id: string;
    };

    // Fixture moved off garab-milestone when that badge was retired
    // (20260911001000); top-helper is the live earned badge for helper credit.
    const granted = await db.withRole('service_role', null, (tx) =>
      tx.query(`select award_badge($1, 'top-helper', '2026-08', $2) as ok`, [member, eventId]),
    );
    expect((granted.rows[0] as { ok: boolean }).ok).toBe(true);

    const row = await db.admin.query(
      `select ub.reputation_event_id, ub.source_entity_type, ub.source_entity_id, ub.context
       from user_badges ub join badge_definitions bd on bd.id = ub.badge_id
       where ub.user_id = $1 and bd.slug = 'top-helper'`,
      [member],
    );
    expect(row.rows[0]).toEqual({
      reputation_event_id: eventId,
      // Denormalized off the event so the badge stays falsifiable even if the
      // ledger row is later cascaded away by an anonymisation.
      source_entity_type: 'post',
      source_entity_id: entityId,
      context: '2026-08',
    });
  });

  it('grants an identity badge without an event — the class decides', async () => {
    const member = await seedMember(db, 'badge_identity');
    const granted = await db.withRole('service_role', null, (tx) =>
      tx.query(`select award_badge($1, 'identity-verified') as ok`, [member]),
    );
    expect((granted.rows[0] as { ok: boolean }).ok).toBe(true);
  });

  it('keeps badge granting a service-role act', async () => {
    const member = await seedMember(db, 'badge_denied');
    await expect(
      db.asUser(member, (tx) => tx.query(`select award_badge($1, 'identity-verified')`, [member])),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('showcase is member-pinned only (A5)', () => {
  it('accepts the fifth slot and refuses a sixth', async () => {
    const member = await seedMember(db, 'showcase_cap');

    // Five is the real ceiling: the sixth cell in frames 10a/10c is the owner's
    // add tile, which is chrome rather than a stored record.
    await db.admin.query(
      `insert into profile_showcase (user_id, position, entity_type, entity_id)
       values ($1, 5, 'post', gen_random_uuid())`,
      [member],
    );

    await expect(
      db.admin.query(
        `insert into profile_showcase (user_id, position, entity_type, entity_id)
         values ($1, 6, 'post', gen_random_uuid())`,
        [member],
      ),
    ).rejects.toThrow(/profile_showcase_position_range/);
  });

  it('refuses an entity type the tile cannot route to', async () => {
    const member = await seedMember(db, 'showcase_type');
    await expect(
      db.admin.query(
        `insert into profile_showcase (user_id, position, entity_type, entity_id)
         values ($1, 1, 'comment', gen_random_uuid())`,
        [member],
      ),
    ).rejects.toThrow(/profile_showcase_entity_type/);
  });

  it('refuses the same entity twice on one profile', async () => {
    const member = await seedMember(db, 'showcase_dupe');
    const entity = (await db.admin.query(`select gen_random_uuid() as id`)).rows[0] as {
      id: string;
    };
    await db.admin.query(
      `insert into profile_showcase (user_id, position, entity_type, entity_id)
       values ($1, 1, 'post', $2)`,
      [member, entity.id],
    );
    await expect(
      db.admin.query(
        `insert into profile_showcase (user_id, position, entity_type, entity_id)
         values ($1, 2, 'post', $2)`,
        [member, entity.id],
      ),
    ).rejects.toThrow(/profile_showcase_unique_entity/);
  });

  it('keeps showcase writes API-only', async () => {
    const member = await seedMember(db, 'showcase_write');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into profile_showcase (user_id, position, entity_type, entity_id)
           values ($1, 1, 'post', gen_random_uuid())`,
          [member],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('headline (ruling 23)', () => {
  it('is member-writable and bounded', async () => {
    const member = await seedMember(db, 'headline_owner');
    await db.asUser(member, (tx) =>
      tx.query(`update profiles set headline = $2 where user_id = $1`, [
        member,
        'Injineer software · London',
      ]),
    );
    const row = await db.admin.query(`select headline from profiles where user_id = $1`, [member]);
    expect((row.rows[0] as { headline: string }).headline).toBe('Injineer software · London');

    await expect(
      db.asUser(member, (tx) =>
        tx.query(`update profiles set headline = $2 where user_id = $1`, [member, 'x'.repeat(81)]),
      ),
    ).rejects.toThrow(/profiles_headline_length/);
  });

  it('rejects an empty headline — absence is null, not a blank line', async () => {
    const member = await seedMember(db, 'headline_blank');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`update profiles set headline = '' where user_id = $1`, [member]),
      ),
    ).rejects.toThrow(/profiles_headline_length/);
  });
});
