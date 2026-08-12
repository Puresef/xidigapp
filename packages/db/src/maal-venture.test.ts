import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedLab, seedMember, seedMembership } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Maal P1 — venture workspace RLS + ledger integrity suite, covering migrations
 * 20260813000000_maal_stage_enum.sql and 20260813000100_maal_venture.sql.
 *
 * Conventions (same as phase4-labs / phase5-capital):
 *   * a policy that FILTERS rows            -> empty result set;
 *   * a REVOKED grant on write              -> /permission denied/;
 *   * an append-only immutability trigger   -> /append-only/;
 *   * content rows seeded via db.admin, mirroring the API's service-role writer.
 *
 * The ledger claims three things in member-facing copy. Each is a test here, not
 * a promise:
 *   "lifaaq-kaliya"  -> nothing can be updated or deleted, by anyone;
 *   "silsilad-hash"  -> the chain verifies, and a tamper is detectable;
 *   "saxitaanku waa dhacdo-celin cusub" -> corrections are new events.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

/** Promote a seeded Lab to a Maal the way the API's service role would. */
async function makeVenture(labId: string): Promise<void> {
  await db.admin.query(
    `update labs
        set space_mode = 'venture',
            venture_since = now(),
            goal_statement = 'Forty active businesses',
            goal_unit = 'ganacsi firfircoon',
            goal_target = 40,
            goal_progress = 23
      where id = $1`,
    [labId],
  );
}

interface EventRow {
  id: string;
  seq: string;
  prev_hash: string;
  hash: string;
  units: number;
}

/**
 * Log a contribution the way the API's service role would. `units` is derived
 * from the quantity unless a call states one — the units-vs-precision spec
 * below needs to send a units value the app computed for itself, which is
 * exactly what apps/web/src/lib/maal/service.ts does.
 */
async function logEvent(
  labId: string,
  memberId: string,
  opts: {
    type?: 'hours' | 'code' | 'design' | 'intro' | 'money';
    quantity?: number;
    weight?: number;
    units?: number;
    note?: string;
    reverses?: string;
  } = {},
): Promise<EventRow> {
  const type = opts.type ?? 'hours';
  const quantity = opts.quantity ?? 3;
  const weight = opts.weight ?? 8;
  const res = await db.admin.query(
    `insert into work_events
       (lab_id, member_user_id, event_type, quantity, unit_weight, units,
        note, occurred_at, recorded_by_user_id, reverses_event_id, prev_hash, hash)
     values ($1, $2, $3, $4::numeric, $5::int,
             coalesce($8::int, round($4::numeric * $5::int)),
             $6, now(), $2, $7, '', '')
     returning id, seq, prev_hash, hash, units`,
    [
      labId,
      memberId,
      type,
      quantity,
      weight,
      opts.note ?? null,
      opts.reverses ?? null,
      opts.units ?? null,
    ],
  );
  return res.rows[0] as EventRow;
}

/**
 * Re-promote a demoted Space, writing exactly the columns
 * `promoteToVenture()` writes (apps/web/src/lib/maal/service.ts). If that
 * function ever stops clearing the demotion bookkeeping, this helper is the
 * thing that has to change with it — and the spec below fails if it does not.
 */
async function promoteVenture(labId: string): Promise<void> {
  await db.admin.query(
    `update labs
        set space_mode = 'venture',
            venture_since = now(),
            goal_statement = 'Forty active businesses',
            demotion_warned_at = null,
            demoted_at = null,
            last_activity_at = now()
      where id = $1`,
    [labId],
  );
}

// --- the stage ---------------------------------------------------------------

describe('space_mode gains a third rung', () => {
  it('accepts venture (Maal) alongside club (Koox) and lab (Warshad)', async () => {
    const lead = await seedMember(db, 'maal_stage_lead');
    const labId = await seedLab(db, lead, 'maal-stage');
    await makeVenture(labId);
    const res = await db.admin.query(`select space_mode from labs where id = $1`, [labId]);
    expect(res.rows[0]).toMatchObject({ space_mode: 'venture' });
  });
});

// --- the ledger: append-only -------------------------------------------------

describe('work_events is append-only', () => {
  it('refuses UPDATE and DELETE for every role, including the superuser', async () => {
    const lead = await seedMember(db, 'maal_append_lead');
    const labId = await seedLab(db, lead, 'maal-append');
    await makeVenture(labId);
    const event = await logEvent(labId, lead);

    await expect(
      db.admin.query(`update work_events set note = 'edited' where id = $1`, [event.id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.admin.query(`delete from work_events where id = $1`, [event.id]),
    ).rejects.toThrow(/append-only/);
  });

  it('revokes write grants from members and from the service role', async () => {
    const lead = await seedMember(db, 'maal_grant_lead');
    const labId = await seedLab(db, lead, 'maal-grant');
    await makeVenture(labId);
    const event = await logEvent(labId, lead);

    await expect(
      db.asUser(lead, (tx) =>
        tx.query(
          `insert into work_events
             (lab_id, member_user_id, event_type, quantity, unit_weight, units,
              occurred_at, prev_hash, hash)
           values ($1, $2, 'hours', 1, 8, 8, now(), '', '')`,
          [labId, lead],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.withRole('service_role', null, (tx) =>
        tx.query(`update work_events set units = 9999 where id = $1`, [event.id]),
      ),
    ).rejects.toThrow(/permission denied|append-only/);
  });
});

// --- the ledger: hash chain --------------------------------------------------

describe('work_events hash chain', () => {
  it('assigns seq and links every event to the one before it', async () => {
    const lead = await seedMember(db, 'maal_chain_lead');
    const labId = await seedLab(db, lead, 'maal-chain');
    await makeVenture(labId);

    const first = await logEvent(labId, lead, { quantity: 2 });
    const second = await logEvent(labId, lead, { quantity: 5 });
    const third = await logEvent(labId, lead, { type: 'code', quantity: 1, weight: 12 });

    expect(first.seq).toBe('1');
    expect(second.seq).toBe('2');
    expect(third.seq).toBe('3');
    expect(first.prev_hash).toBe('genesis');
    expect(second.prev_hash).toBe(first.hash);
    expect(third.prev_hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps a separate chain per venture', async () => {
    const lead = await seedMember(db, 'maal_chain2_lead');
    const a = await seedLab(db, lead, 'maal-chain-a');
    const b = await seedLab(db, lead, 'maal-chain-b');
    await makeVenture(a);
    await makeVenture(b);

    await logEvent(a, lead);
    const firstOfB = await logEvent(b, lead);
    expect(firstOfB.seq).toBe('1');
    expect(firstOfB.prev_hash).toBe('genesis');
  });

  it('verifies clean, and reports the exact seq when history is tampered with', async () => {
    const lead = await seedMember(db, 'maal_verify_lead');
    const labId = await seedLab(db, lead, 'maal-verify');
    await makeVenture(labId);
    await logEvent(labId, lead, { quantity: 2 });
    const second = await logEvent(labId, lead, { quantity: 5 });
    await logEvent(labId, lead, { quantity: 1 });

    const clean = await db.admin.query(`select * from verify_work_chain($1)`, [labId]);
    expect(clean.rows[0]).toMatchObject({ ok: true, broken_seq: null });

    // Only a direct table rewrite could do this — the trigger refuses UPDATE, so
    // simulate the thing the chain exists to catch by disabling it first.
    await db.admin.query(`alter table work_events disable trigger work_events_immutable`);
    await db.admin.query(`update work_events set quantity = 500, units = 4000 where id = $1`, [
      second.id,
    ]);
    await db.admin.query(`alter table work_events enable trigger work_events_immutable`);

    const tampered = await db.admin.query(`select * from verify_work_chain($1)`, [labId]);
    expect(tampered.rows[0]).toMatchObject({ ok: false, broken_seq: '2' });
  });
});

// --- the ledger: corrections are events --------------------------------------

describe('corrections are reversal events, never edits', () => {
  it('records a reversal as a new negative event that leaves the original intact', async () => {
    const lead = await seedMember(db, 'maal_rev_lead');
    const labId = await seedLab(db, lead, 'maal-rev');
    await makeVenture(labId);
    const original = await logEvent(labId, lead, { quantity: 2 });

    const reversal = await logEvent(labId, lead, {
      quantity: -2,
      reverses: original.id,
      note: 'khalad qoraal',
    });

    expect(reversal.units).toBe(-16);
    expect(reversal.prev_hash).toBe(original.hash);

    const rows = await db.admin.query(
      `select coalesce(sum(units), 0)::int as net from work_events where lab_id = $1`,
      [labId],
    );
    expect(rows.rows[0]).toMatchObject({ net: 0 });

    const still = await db.admin.query(`select units from work_events where id = $1`, [
      original.id,
    ]);
    expect(still.rows[0]).toMatchObject({ units: 16 });
  });

  it('refuses a negative event that reverses nothing, and a positive "reversal"', async () => {
    const lead = await seedMember(db, 'maal_rev2_lead');
    const labId = await seedLab(db, lead, 'maal-rev2');
    await makeVenture(labId);
    const original = await logEvent(labId, lead, { quantity: 2 });

    await expect(logEvent(labId, lead, { quantity: -2 })).rejects.toThrow(
      /work_events_reversal_sign/,
    );
    await expect(logEvent(labId, lead, { quantity: 2, reverses: original.id })).rejects.toThrow(
      /work_events_reversal_sign/,
    );
  });

  it('refuses reversing twice, reversing a reversal, and reversing across ventures', async () => {
    const lead = await seedMember(db, 'maal_rev3_lead');
    const labId = await seedLab(db, lead, 'maal-rev3');
    const other = await seedLab(db, lead, 'maal-rev3-other');
    await makeVenture(labId);
    await makeVenture(other);

    const original = await logEvent(labId, lead, { quantity: 2 });
    const reversal = await logEvent(labId, lead, { quantity: -2, reverses: original.id });

    await expect(logEvent(labId, lead, { quantity: -2, reverses: original.id })).rejects.toThrow(
      /work_events_reversal_once_uq/,
    );
    await expect(logEvent(labId, lead, { quantity: -2, reverses: reversal.id })).rejects.toThrow(
      /cannot itself be reversed/,
    );
    await expect(logEvent(other, lead, { quantity: -2, reverses: original.id })).rejects.toThrow(
      /must match the original venture and member/,
    );
  });
});

// --- units follow the STORED quantity ----------------------------------------

describe('units are derived from the quantity as stored, not as sent', () => {
  it('refuses units computed from a 3-decimal quantity and accepts the rounded one', async () => {
    const lead = await seedMember(db, 'maal_units_lead');
    const labId = await seedLab(db, lead, 'maal-units');
    await makeVenture(labId);

    // `quantity` is numeric(12,2), so 1.045 lands as 1.05 and the CHECK
    // re-derives round(1.05 * 10) = 11 in exact numeric. A caller that computed
    // units from the RAW 1.045 in JS doubles gets Math.round(10.45) = 10 and a
    // constraint violation the member reads as a 500 — so the app rounds to two
    // decimals FIRST and sends the rounded quantity
    // (apps/web/src/lib/maal/service.ts, logContribution).
    await expect(
      logEvent(labId, lead, { type: 'code', quantity: 1.045, weight: 10, units: 10 }),
    ).rejects.toThrow(/work_events_units_follow_weight/);

    const ok = await logEvent(labId, lead, {
      type: 'code',
      quantity: 1.05,
      weight: 10,
      units: 11,
    });
    expect(ok.units).toBe(11);

    const stored = await db.admin.query(`select quantity from work_events where id = $1`, [ok.id]);
    expect(stored.rows[0]).toMatchObject({ quantity: '1.05' });
  });
});

// --- readability -------------------------------------------------------------

describe('ledger readability', () => {
  it('is members-only: a signed-in non-member reads nothing', async () => {
    const lead = await seedMember(db, 'maal_read_lead');
    const outsider = await seedMember(db, 'maal_read_out');
    const labId = await seedLab(db, lead, 'maal-read');
    await makeVenture(labId);
    await logEvent(labId, lead);

    const seen = await db.asUser(outsider, (tx) =>
      tx.query(`select id from work_events where lab_id = $1`, [labId]),
    );
    expect(seen.rows).toEqual([]);

    const board = await db.asUser(outsider, (tx) =>
      tx.query(`select id from venture_tasks where lab_id = $1`, [labId]),
    );
    expect(board.rows).toEqual([]);
  });

  it('hides per-member hours from ordinary members when the venture set hours to leads-only', async () => {
    const lead = await seedMember(db, 'maal_hours_lead');
    const worker = await seedMember(db, 'maal_hours_worker');
    const peer = await seedMember(db, 'maal_hours_peer');
    const labId = await seedLab(db, lead, 'maal-hours');
    await makeVenture(labId);
    await seedMembership(db, labId, worker);
    await seedMembership(db, labId, peer);
    await db.admin.query(`update labs set hours_visibility = 'leads' where id = $1`, [labId]);

    await logEvent(labId, worker, { type: 'hours', quantity: 4 });
    await logEvent(labId, peer, { type: 'hours', quantity: 1 });
    await logEvent(labId, worker, { type: 'code', quantity: 3, weight: 12 });

    // A peer sees their own hours plus every non-hours event — never someone
    // else's hours. That is exactly what the toggle's copy promises.
    const peerRows = await db.asUser(peer, (tx) =>
      tx.query(
        `select event_type, member_user_id from work_events where lab_id = $1 order by seq`,
        [labId],
      ),
    );
    expect(peerRows.rows).toEqual([
      { event_type: 'hours', member_user_id: peer },
      { event_type: 'code', member_user_id: worker },
    ]);

    const leadRows = await db.asUser(lead, (tx) =>
      tx.query(`select count(*)::int as n from work_events where lab_id = $1`, [labId]),
    );
    expect(leadRows.rows[0]).toMatchObject({ n: 3 });
  });

  it('shows every member the whole ledger when hours are members-visible', async () => {
    const lead = await seedMember(db, 'maal_open_lead');
    const peer = await seedMember(db, 'maal_open_peer');
    const labId = await seedLab(db, lead, 'maal-open');
    await makeVenture(labId);
    await seedMembership(db, labId, peer);
    await logEvent(labId, lead, { quantity: 4 });

    const rows = await db.asUser(peer, (tx) =>
      tx.query(`select count(*)::int as n from work_events where lab_id = $1`, [labId]),
    );
    expect(rows.rows[0]).toMatchObject({ n: 1 });
  });
});

// --- tally -------------------------------------------------------------------

describe('venture_contribution_tally', () => {
  it('reads share inputs out of the events, counting attested units separately', async () => {
    const lead = await seedMember(db, 'maal_tally_lead');
    const worker = await seedMember(db, 'maal_tally_worker');
    const labId = await seedLab(db, lead, 'maal-tally');
    await makeVenture(labId);
    await seedMembership(db, labId, worker);

    const attested = await logEvent(labId, worker, { type: 'hours', quantity: 10, weight: 8 });
    await logEvent(labId, worker, { type: 'code', quantity: 2, weight: 12 });
    await db.admin.query(
      `insert into work_event_attestations (work_event_id, attester_user_id) values ($1, $2)`,
      [attested.id, lead],
    );

    const res = await db.admin.query(
      `select * from venture_contribution_tally($1) where member_user_id = $2`,
      [labId, worker],
    );
    expect(res.rows[0]).toMatchObject({
      units: 104,
      verified_units: 80,
      event_count: 2,
    });
  });

  it('stops counting a reversed contribution as verified', async () => {
    const lead = await seedMember(db, 'maal_tally_rev_lead');
    const worker = await seedMember(db, 'maal_tally_rev_worker');
    const labId = await seedLab(db, lead, 'maal-tally-rev');
    await makeVenture(labId);
    await seedMembership(db, labId, worker);

    const attested = await logEvent(labId, worker, { type: 'hours', quantity: 10, weight: 8 });
    await logEvent(labId, worker, { type: 'code', quantity: 2, weight: 12 });
    await db.admin.query(
      `insert into work_event_attestations (work_event_id, attester_user_id) values ($1, $2)`,
      [attested.id, lead],
    );

    // The correction is a new row and it carries no attestation of its own, so
    // an attestation-only filter would cancel `units` and leave `verified_units`
    // standing at 80 — witnessed work that no longer exists.
    await logEvent(labId, worker, {
      type: 'hours',
      quantity: -10,
      weight: 8,
      reverses: attested.id,
    });

    const res = await db.admin.query(
      `select * from venture_contribution_tally($1) where member_user_id = $2`,
      [labId, worker],
    );
    expect(res.rows[0]).toMatchObject({ units: 24, verified_units: 0, event_count: 3 });
  });

  it('does not let an attested correction push verified units negative', async () => {
    const lead = await seedMember(db, 'maal_tally_rev2_lead');
    const worker = await seedMember(db, 'maal_tally_rev2_worker');
    const labId = await seedLab(db, lead, 'maal-tally-rev2');
    await makeVenture(labId);
    await seedMembership(db, labId, worker);

    const attested = await logEvent(labId, worker, { type: 'hours', quantity: 10, weight: 8 });
    const reversal = await logEvent(labId, worker, {
      type: 'hours',
      quantity: -10,
      weight: 8,
      reverses: attested.id,
    });
    await db.admin.query(
      `insert into work_event_attestations (work_event_id, attester_user_id)
       values ($1, $3), ($2, $3)`,
      [attested.id, reversal.id, lead],
    );

    // Both halves of a correction are out: the original because it was taken
    // back, the reversal because -80 "verified" units is a stranger claim than
    // the zero the member actually has.
    const res = await db.admin.query(
      `select * from venture_contribution_tally($1) where member_user_id = $2`,
      [labId, worker],
    );
    expect(res.rows[0]).toMatchObject({ units: 0, verified_units: 0 });
  });

  it('answers for the service role, where auth.uid() is null', async () => {
    const lead = await seedMember(db, 'maal_tally2_lead');
    const labId = await seedLab(db, lead, 'maal-tally2');
    await makeVenture(labId);
    await logEvent(labId, lead, { quantity: 1 });

    // No internal readability guard (the Phase 5 lesson: called where auth.uid()
    // is null, a guard inside zeroes every row).
    const res = await db.withRole('service_role', null, (tx) =>
      tx.query(`select units from venture_contribution_tally($1)`, [labId]),
    );
    expect(res.rows).toHaveLength(1);
  });

  it('is not callable by a signed-in member — the guard is the grant, not the body', async () => {
    const lead = await seedMember(db, 'maal_tally3_lead');
    const outsider = await seedMember(db, 'maal_tally3_out');
    const labId = await seedLab(db, lead, 'maal-tally3');
    await makeVenture(labId);
    await logEvent(labId, lead, { quantity: 1 });

    // Unguarded + granted to `authenticated` would be a direct PostgREST bypass
    // of the members-only ledger policy and the hours toggle. Members read the
    // ledger through the API, which resolves readability first.
    for (const actor of [lead, outsider]) {
      await expect(
        db.asUser(actor, (tx) =>
          tx.query(`select units from venture_contribution_tally($1)`, [labId]),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

// --- recusal -----------------------------------------------------------------

describe('task attestation recusal', () => {
  it('refuses to let the assignee witness or approve their own task', async () => {
    const lead = await seedMember(db, 'maal_recuse_lead');
    const labId = await seedLab(db, lead, 'maal-recuse');
    await makeVenture(labId);

    const task = await db.admin.query(
      `insert into venture_tasks (lab_id, title, status, assignee_user_id)
       values ($1, 'Isku xir Stripe Connect', 'submitted', $2) returning id`,
      [labId, lead],
    );
    const taskId = (task.rows[0] as { id: string }).id;

    await expect(
      db.admin.query(`update venture_tasks set attested_by_user_id = $2 where id = $1`, [
        taskId,
        lead,
      ]),
    ).rejects.toThrow(/venture_tasks_attester_recusal/);
    await expect(
      db.admin.query(`update venture_tasks set verified_by_user_id = $2 where id = $1`, [
        taskId,
        lead,
      ]),
    ).rejects.toThrow(/venture_tasks_verifier_recusal/);
  });
});

// --- demotion: the system timeout path (ruling 2) ----------------------------

// The three doctrine invariants (demotion works, is service-role-only, writes
// the public Governance Log, preserves history) are owned by
// packages/db/src/phase4-labs.test.ts, where the stage ladder lives. What is
// tested here is the part Maal F2 adds around them: nobody is demoted without
// advance notice, and any activity clears the warning.
describe('Maal -> Warshad demotion: the advance-notice gate', () => {
  it('never demotes a venture that was not warned first', async () => {
    const lead = await seedMember(db, 'maal_demote3_lead');
    const labId = await seedLab(db, lead, 'maal-demote-unwarned');
    await makeVenture(labId);
    await db.admin.query(
      `update labs set last_activity_at = now() - interval '400 days' where id = $1`,
      [labId],
    );

    const ran = await db.withRole('service_role', null, (tx) =>
      tx.query(`select demote_timed_out_ventures() as id`),
    );
    expect(ran.rows).not.toContainEqual({ id: labId });
    const still = await db.admin.query(`select space_mode from labs where id = $1`, [labId]);
    expect(still.rows[0]).toMatchObject({ space_mode: 'venture' });
  });

  it('warns before it demotes, and one update clears the warning', async () => {
    const lead = await seedMember(db, 'maal_warn_lead');
    const labId = await seedLab(db, lead, 'maal-warn');
    await makeVenture(labId);
    await db.admin.query(
      `update labs set last_activity_at = now() - interval '75 days' where id = $1`,
      [labId],
    );

    const warned = await db.withRole('service_role', null, (tx) =>
      tx.query(`select warn_timed_out_ventures() as id`),
    );
    expect(warned.rows).toContainEqual({ id: labId });

    // A single contribution revives it: the warning is cleared and the timeout
    // clock restarts, which is what the dormancy copy promises.
    await logEvent(labId, lead, { quantity: 1 });
    const revived = await db.admin.query(
      `select demotion_warned_at, dormant_since from labs where id = $1`,
      [labId],
    );
    expect(revived.rows[0]).toMatchObject({ demotion_warned_at: null, dormant_since: null });
  });

  it('gives a re-promoted venture a fresh clock instead of demoting it again the same night', async () => {
    const lead = await seedMember(db, 'maal_repromote_lead');
    const labId = await seedLab(db, lead, 'maal-repromote');
    await makeVenture(labId);
    await db.admin.query(
      `update labs
          set last_activity_at = now() - interval '120 days',
              demotion_warned_at = now() - interval '30 days'
        where id = $1`,
      [labId],
    );

    const first = await db.withRole('service_role', null, (tx) =>
      tx.query(`select demote_timed_out_ventures() as id`),
    );
    expect(first.rows).toContainEqual({ id: labId });

    // The remedy for a timeout demotion is re-promotion, so it has to actually
    // work: promoteToVenture() clears demotion_warned_at + demoted_at and
    // stamps last_activity_at. Left behind, the stale pair would satisfy the
    // sweep's own preconditions and demote the venture again with zero advance
    // notice — the one thing ruling 2 forbids.
    await promoteVenture(labId);
    const fresh = await db.admin.query(
      `select demotion_warned_at, demoted_at from labs where id = $1`,
      [labId],
    );
    expect(fresh.rows[0]).toMatchObject({ demotion_warned_at: null, demoted_at: null });

    const second = await db.withRole('service_role', null, (tx) =>
      tx.query(`select demote_timed_out_ventures() as id`),
    );
    expect(second.rows).not.toContainEqual({ id: labId });
    const still = await db.admin.query(`select space_mode from labs where id = $1`, [labId]);
    expect(still.rows[0]).toMatchObject({ space_mode: 'venture' });
  });
});

// --- demotion: what the public record may say --------------------------------

describe('the Governance Log records the stage change without outing a private Space', () => {
  it('names a listed venture and anonymises a private one', async () => {
    const lead = await seedMember(db, 'maal_gov_lead');
    const reader = await seedMember(db, 'maal_gov_reader');
    const listedId = await seedLab(db, lead, 'maal-gov-listed');
    const privateId = await seedLab(db, lead, 'maal-gov-private');
    await makeVenture(listedId);
    await makeVenture(privateId);
    await db.admin.query(
      `update labs
          set last_activity_at = now() - interval '120 days',
              demotion_warned_at = now() - interval '30 days'
        where id = any($1::uuid[])`,
      [[listedId, privateId]],
    );
    await db.admin.query(
      `update labs set visibility = 'private', is_listed = false where id = $1`,
      [privateId],
    );

    await db.withRole('service_role', null, (tx) => tx.query(`select demote_timed_out_ventures()`));

    // The listed one reads exactly as before: name in the title, slug in the
    // body, readable by an ordinary member.
    const listed = await db.asUser(reader, (tx) =>
      tx.query(
        `select title, body from governance_log_entries
          where category = 'stage_demotion' and published_at is not null
            and body like '%maal-gov-listed%'`,
      ),
    );
    expect(listed.rows).toHaveLength(1);
    expect((listed.rows[0] as { title: string }).title).toMatch(/Lab maal-gov-listed/);

    // The private one is on the record too — same sentence, same category, no
    // name and no slug. A member who could not find that Space yesterday still
    // cannot find it today.
    const leaked = await db.asUser(reader, (tx) =>
      tx.query(
        `select id from governance_log_entries
          where title like '%maal-gov-private%' or body like '%maal-gov-private%'`,
      ),
    );
    expect(leaked.rows).toEqual([]);

    const anonymous = await db.asUser(reader, (tx) =>
      tx.query(
        `select body from governance_log_entries
          where category = 'stage_demotion' and published_at is not null
            and title = 'A venture — Maal → Warshad'`,
      ),
    );
    expect(anonymous.rows).toHaveLength(1);
    expect((anonymous.rows[0] as { body: string }).body).toMatch(
      /system made this change, not a member/,
    );

    // The Space-scoped history keeps the full detail either way.
    const history = await db.admin.query(
      `select metadata from lab_events where lab_id = $1 and event_type = 'demoted_timeout'`,
      [privateId],
    );
    expect(history.rows).toHaveLength(1);
    expect((history.rows[0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      from: 'venture',
      to: 'lab',
      actor: 'system',
    });
  });
});
