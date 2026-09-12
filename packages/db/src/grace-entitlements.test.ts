import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ACTIVE_ONLY_CAPABILITIES, ORDINARY_ENTITLEMENTS } from './entitlements';
import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Paid entitlements through the §19 deletion grace (migration 20260911000600).
 *
 * Owner ruling (11 Sep): grace ('pending_deletion') is ordinary membership
 * until final deletion, so a Supporter's existing paid resource/convenience
 * entitlements continue; governance, capital and consequential powers stay
 * active-only. Before this migration both kinds rode has_capability() /
 * is_supporter(), which are active-only, so a grace Supporter fell back to
 * free quotas and lost Supporter-only Spaces along with the vote.
 *
 * Pinned here, for a Supporter in every status and for free members:
 *   ORDINARY entitlements (has_entitlement, is_supporter, Supporter-only Space
 *     reads) — active + pending_deletion; never suspended/deactivated/deleted;
 *     never a free member, grace or not;
 *   ACTIVE-ONLY capabilities (has_capability) — active only;
 *   has_entitlement() answers false for every ACTIVE-ONLY capability, even
 *     for an active Supporter — it cannot be used as a back door;
 *   every enum value is classified exactly once.
 */

let db: TestDatabase;

const STATUSES = ['active', 'pending_deletion', 'suspended', 'deactivated', 'deleted'] as const;
type Status = (typeof STATUSES)[number];
const ORDINARY_STATUS: readonly Status[] = ['active', 'pending_deletion'];

const supporter = {} as Record<Status, string>;
let freeActive: string;
let freeGrace: string;
let supporterSpace: string;

async function setStatus(id: string, status: Status): Promise<void> {
  if (status === 'active') return;
  if (status === 'deleted') {
    await db.admin.query(
      `update users set status = 'pending_deletion', deletion_requested_at = now() - interval '31 days' where id = $1`,
      [id],
    );
    await db.withRole('service_role', null, (tx) =>
      tx.query(`select public.anonymise_user($1)`, [id]),
    );
    return;
  }
  await db.admin.query(
    `update users set status = $2::account_status,
       deletion_requested_at = case when $2 = 'pending_deletion' then now() else null end
     where id = $1`,
    [id, status],
  );
}

async function bool(userId: string, sql: string, params: unknown[] = []): Promise<boolean> {
  const res = await db.asUser(userId, (tx) => tx.query(sql, params));
  return (res.rows[0] as { v: boolean }).v;
}

const hasEntitlement = (userId: string, cap: string) =>
  bool(userId, `select public.has_entitlement($1::membership_capability) as v`, [cap]);
const hasCapability = (userId: string, cap: string) =>
  bool(userId, `select public.has_capability($1::membership_capability) as v`, [cap]);
const isSupporter = (userId: string) => bool(userId, `select public.is_supporter() as v`);

async function readsSupporterSpace(userId: string): Promise<boolean> {
  const res = await db.asUser(userId, (tx) =>
    tx.query(`select 1 from labs where id = $1`, [supporterSpace]),
  );
  return (res.rowCount ?? 0) === 1;
}

beforeAll(async () => {
  db = await createTestDatabase();
  const lead = await seedMember(db, 'ge_lead');
  supporterSpace = (
    await db.admin.query(
      `insert into labs (name, slug, lead_user_id, visibility, space_mode, is_supporter_only)
       values ('Supporters', 'ge-supporters', $1, 'members', 'club', true) returning id`,
      [lead],
    )
  ).rows[0].id as string;

  for (const status of STATUSES) {
    const id = await seedMember(db, `ge_sup_${status}`);
    await db.admin.query(
      `update profiles set membership_tier_id = 'supporter' where user_id = $1`,
      [id],
    );
    supporter[status] = id;
  }
  freeActive = await seedMember(db, 'ge_free_active');
  freeGrace = await seedMember(db, 'ge_free_grace');

  // Positive controls while every Supporter is still active. has_capability()
  // is exercised on a capability the paid tier still holds: since
  // 20260912100100 (Xidig Plus doctrine) it holds NO active-only capability.
  for (const status of STATUSES) {
    expect(await isSupporter(supporter[status])).toBe(true);
    expect(await hasCapability(supporter[status], 'elevated_limits')).toBe(true);
  }

  for (const status of STATUSES) await setStatus(supporter[status], status);
  await setStatus(freeGrace, 'pending_deletion');
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('classification contract', () => {
  it('every membership_capability value is classified exactly once', async () => {
    const res = await db.admin.query(
      `select unnest(enum_range(null::membership_capability))::text as cap`,
    );
    const all = res.rows.map((r) => r.cap as string).sort();
    const ordinary: readonly string[] = ORDINARY_ENTITLEMENTS;
    const activeOnly: readonly string[] = ACTIVE_ONLY_CAPABILITIES;
    expect(ordinary.filter((c) => activeOnly.includes(c))).toEqual([]);
    expect([...ordinary, ...activeOnly].sort()).toEqual(all);
  });

  it('has_entitlement is authenticated-only, like has_capability', async () => {
    const res = await db.admin.query(
      `select has_function_privilege('anon', 'public.has_entitlement(public.membership_capability)', 'EXECUTE') as anon,
              has_function_privilege('authenticated', 'public.has_entitlement(public.membership_capability)', 'EXECUTE') as authed`,
    );
    expect(res.rows[0]).toEqual({ anon: false, authed: true });
  });
});

describe.each(STATUSES)('a Supporter whose account is %s', (status) => {
  const ordinary = ORDINARY_STATUS.includes(status);

  it.each(ORDINARY_ENTITLEMENTS)(`ordinary entitlement %s: ${ordinary}`, async (cap) => {
    expect(await hasEntitlement(supporter[status], cap)).toBe(ordinary);
  });

  it(`is_supporter() and the Supporter-only Space: ${ordinary}`, async () => {
    expect(await isSupporter(supporter[status])).toBe(ordinary);
    expect(await readsSupporterSpace(supporter[status])).toBe(ordinary);
  });

  // Xidig Plus doctrine (owner, 12 Sep; migration 20260912100100): the paid
  // tier holds NONE of the active-only capabilities, in any status, so none of
  // them can be bought.
  it.each(ACTIVE_ONLY_CAPABILITIES)(
    'active-only capability %s: false (held by no tier)',
    async (cap) => {
      expect(await hasCapability(supporter[status], cap)).toBe(false);
    },
  );

  it(`has_capability stays active-only (tier join + status): ${status === 'active'}`, async () => {
    expect(await hasCapability(supporter[status], 'elevated_limits')).toBe(status === 'active');
  });

  it.each(ACTIVE_ONLY_CAPABILITIES)(
    'has_entitlement never answers for active-only %s',
    async (cap) => {
      expect(await hasEntitlement(supporter[status], cap)).toBe(false);
    },
  );
});

describe('has_entitlement cannot be a back door, even if a tier held an active-only row', () => {
  // Since 20260912100100 no tier holds any active-only capability, so the
  // per-status 'never answers' assertions above would pass even without the
  // ORDINARY allowlist inside has_entitlement(). Here, in this test's private
  // database only, the paid tier is TEMPORARILY granted one active-only row, so
  // the allowlist itself is what keeps has_entitlement false.
  it.each(ACTIVE_ONLY_CAPABILITIES)(
    '%s: has_capability sees the row; has_entitlement never does',
    async (cap) => {
      await db.admin.query(
        `insert into tier_capabilities (tier_id, capability) values ('supporter', $1)`,
        [cap],
      );
      try {
        expect(await hasCapability(supporter.active, cap)).toBe(true); // the row is live
        expect(await hasEntitlement(supporter.active, cap)).toBe(false);
        expect(await hasEntitlement(supporter.pending_deletion, cap)).toBe(false);
      } finally {
        await db.admin.query(
          `delete from tier_capabilities where tier_id = 'supporter' and capability = $1`,
          [cap],
        );
      }
    },
  );
});

describe('free members do not gain Supporter entitlements', () => {
  it.each([
    ['active', () => freeActive],
    ['pending_deletion', () => freeGrace],
  ] as const)('free %s member: no entitlement, no Supporter-only Space', async (_s, who) => {
    for (const cap of ORDINARY_ENTITLEMENTS) {
      expect(await hasEntitlement(who(), cap), cap).toBe(false);
    }
    expect(await isSupporter(who())).toBe(false);
    expect(await readsSupporterSpace(who())).toBe(false);
  });
});

describe('venture ledger — not a tier entitlement, UNCHANGED by this migration (reported)', () => {
  // The ledger is reached through Space membership/lead role, not a tier
  // capability. is_venture_lead() reads only the Lab lead column and the
  // lab_members row (whose 'active' is the MEMBERSHIP, not the account), so a
  // lead in the grace keeps full ledger reach today. Blocked statuses are
  // stopped by the client lifecycle gate on the ledger tables. Pinned so any
  // change is deliberate — the classification is an open owner question.
  it('a grace venture lead keeps is_venture_lead / ledger / hours reach', async () => {
    const lead = await seedMember(db, 'ge_venture_lead');
    const lab = (
      await db.admin.query(
        `insert into labs (name, slug, lead_user_id, visibility, space_mode, ledger_visibility, hours_visibility)
         values ('Venture', 'ge-venture', $1, 'private', 'lab', 'leads', 'leads') returning id`,
        [lead],
      )
    ).rows[0].id as string;
    await setStatus(lead, 'pending_deletion');
    expect(await bool(lead, `select public.is_venture_lead($1) as v`, [lab])).toBe(true);
    expect(await bool(lead, `select public.can_read_venture_ledger($1) as v`, [lab])).toBe(true);
    expect(await bool(lead, `select public.can_read_venture_hours($1) as v`, [lab])).toBe(true);
  });
});

describe('cancelling the grace', () => {
  it('a Supporter who cancels deletion is back to full active capability', async () => {
    const id = await seedMember(db, 'ge_sup_cancel');
    await db.admin.query(
      `update profiles set membership_tier_id = 'supporter' where user_id = $1`,
      [id],
    );
    await setStatus(id, 'pending_deletion');
    expect(await hasCapability(id, 'elevated_limits')).toBe(false);
    expect(await hasEntitlement(id, 'elevated_limits')).toBe(true);
    await db.admin.query(
      `update users set status = 'active', deletion_requested_at = null where id = $1`,
      [id],
    );
    expect(await hasCapability(id, 'elevated_limits')).toBe(true);
    expect(await hasEntitlement(id, 'elevated_limits')).toBe(true);
    // …and still no doctrine-forbidden power, active or not.
    expect(await hasCapability(id, 'vote_candidate')).toBe(false);
  });
});
