/**
 * Integration tests for 20260704200000_phase1_auth.sql against a real
 * Postgres 17 with the Supabase environment stubbed (see harness.ts).
 *
 * These are the PRD's "RLS negative tests": prove user A cannot read or
 * write user B's rows, that beta signup is impossible without a
 * server-issued grant, and that no client role can escalate itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startHarness, type TestHarness } from './harness';

let h: TestHarness;

beforeAll(async () => {
  h = await startHarness();
}, 240_000);

afterAll(async () => {
  await h?.stop();
});

/** Insert an auth.users row as GoTrue would (superuser context). */
async function createAuthUser(opts: {
  email?: string;
  phone?: string; // GoTrue-style: digits, NO leading '+'
  password?: string;
  bypassGate?: boolean;
}): Promise<string> {
  const meta = opts.bypassGate ? { xidig_gate_bypass: 'true' } : {};
  const res = await h.root.query(
    `insert into auth.users (email, phone, encrypted_password, raw_app_meta_data)
     values ($1, $2, $3, $4) returning id`,
    [opts.email ?? null, opts.phone ?? null, opts.password ?? null, JSON.stringify(meta)],
  );
  return res.rows[0].id as string;
}

/** Issue a signup grant the way the API layer does (service context). */
async function issueGrant(opts: {
  email?: string;
  phone?: string; // E.164 WITH '+'
  inviteId?: string;
  waitlistEntryId?: string;
  expiresInMinutes?: number;
}): Promise<string> {
  const res = await h.root.query(
    `insert into signup_grants (email, phone, invite_id, waitlist_entry_id, expires_at)
     values ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval) returning id`,
    [
      opts.email ?? null,
      opts.phone ?? null,
      opts.inviteId ?? null,
      opts.waitlistEntryId ?? null,
      String(opts.expiresInMinutes ?? 15),
    ],
  );
  return res.rows[0].id as string;
}

describe('beta signup gate (auth.users insert trigger)', () => {
  it('blocks signup without a grant', async () => {
    await expect(createAuthUser({ email: 'nogrant@example.com' })).rejects.toThrow(
      /XIDIG_SIGNUP_NOT_ALLOWED/,
    );
  });

  it('blocks signup with an expired grant', async () => {
    await issueGrant({ email: 'expired@example.com', expiresInMinutes: -5 });
    await expect(createAuthUser({ email: 'expired@example.com' })).rejects.toThrow(
      /XIDIG_SIGNUP_NOT_ALLOWED/,
    );
  });

  it('allows signup with a valid grant, consumes it, and creates public.users', async () => {
    const grantId = await issueGrant({ email: 'alice@example.com' });
    const uid = await createAuthUser({ email: 'alice@example.com' });

    const grant = await h.root.query('select * from signup_grants where id = $1', [grantId]);
    expect(grant.rows[0].consumed_at).not.toBeNull();
    expect(grant.rows[0].consumed_by_user_id).toBe(uid);

    const user = await h.root.query('select * from users where id = $1', [uid]);
    expect(user.rowCount).toBe(1);
    expect(user.rows[0].email).toBe('alice@example.com');
    expect(user.rows[0].role).toBe('member');
    expect(user.rows[0].status).toBe('active');
  });

  it('matches grant emails case-insensitively (citext)', async () => {
    await issueGrant({ email: 'Case@Example.com' });
    const uid = await createAuthUser({ email: 'case@example.com' });
    const user = await h.root.query('select id from users where id = $1', [uid]);
    expect(user.rowCount).toBe(1);
  });

  it('normalises GoTrue phone (no +) to E.164 (+) in public.users', async () => {
    await issueGrant({ phone: '+252612345678' });
    const uid = await createAuthUser({ phone: '252612345678' });
    const user = await h.root.query('select phone from users where id = $1', [uid]);
    expect(user.rows[0].phone).toBe('+252612345678');
  });

  it('only one open grant may exist per identifier (partial unique)', async () => {
    await issueGrant({ email: 'unique@example.com' });
    await expect(issueGrant({ email: 'unique@example.com' })).rejects.toThrow(/duplicate key/);
    // once consumed, a fresh grant for the same identifier is allowed again
    await createAuthUser({ email: 'unique@example.com' });
    await expect(issueGrant({ email: 'unique@example.com' })).resolves.toBeTruthy();
  });

  it('marks the invite redeemed when the grant came from an invite', async () => {
    const invite = await h.root.query(
      `insert into invites (code) values ('XIDIG-TEST-0001') returning id`,
    );
    const inviteId = invite.rows[0].id as string;
    await issueGrant({ email: 'invited@example.com', inviteId });
    const uid = await createAuthUser({ email: 'invited@example.com' });

    const after = await h.root.query('select * from invites where id = $1', [inviteId]);
    expect(after.rows[0].redeemed_by_user_id).toBe(uid);
    expect(after.rows[0].redeemed_at).not.toBeNull();
  });

  it('marks the waitlist entry joined when the grant came from the waitlist', async () => {
    const wl = await h.root.query(
      `insert into waitlist_entries (email, status, invited_at)
       values ('waitlisted@example.com', 'invited', now()) returning id`,
    );
    const wlId = wl.rows[0].id as string;
    await issueGrant({ email: 'waitlisted@example.com', waitlistEntryId: wlId });
    await createAuthUser({ email: 'waitlisted@example.com' });

    const after = await h.root.query('select status from waitlist_entries where id = $1', [wlId]);
    expect(after.rows[0].status).toBe('joined');
  });

  it('service-key bypass flag skips the gate (ops/seed escape hatch)', async () => {
    const uid = await createAuthUser({ email: 'ops@example.com', bypassGate: true });
    const user = await h.root.query('select id from users where id = $1', [uid]);
    expect(user.rowCount).toBe(1);
  });
});

describe('auth.users → public.users mirroring', () => {
  it('mirrors email and phone changes (with + normalisation)', async () => {
    await issueGrant({ email: 'mirror@example.com' });
    const uid = await createAuthUser({ email: 'mirror@example.com' });

    await h.root.query(
      `update auth.users set email = 'mirror-new@example.com', phone = '252698765432' where id = $1`,
      [uid],
    );
    const user = await h.root.query('select email, phone from users where id = $1', [uid]);
    expect(user.rows[0].email).toBe('mirror-new@example.com');
    expect(user.rows[0].phone).toBe('+252698765432');
  });
});

describe('RLS: users table', () => {
  let alice: string;
  let bob: string;
  let admin: string;

  beforeAll(async () => {
    await issueGrant({ email: 'rls-alice@example.com' });
    alice = await createAuthUser({ email: 'rls-alice@example.com' });
    await issueGrant({ email: 'rls-bob@example.com' });
    bob = await createAuthUser({ email: 'rls-bob@example.com' });
    admin = await createAuthUser({ email: 'rls-admin@example.com', bypassGate: true });
    await h.root.query(`update users set role = 'admin' where id = $1`, [admin]);
  });

  it('a member reads only their own row', async () => {
    const rows = await h.as('authenticated', alice, async (q) => {
      const r = await q('select id from users');
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(alice);
  });

  it('anon reads nothing', async () => {
    const r = await h.as('anon', null, (q) => q('select id from users'));
    expect(r.rowCount).toBe(0);
  });

  it('an admin reads all rows', async () => {
    const r = await h.as('authenticated', admin, (q) => q('select id from users'));
    expect(r.rowCount).toBeGreaterThanOrEqual(3);
  });

  it('a member cannot escalate their own role (column grant)', async () => {
    await expect(
      h.as('authenticated', alice, (q) =>
        q(`update users set role = 'admin' where id = $1`, [alice]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a member cannot un-suspend themselves (status column locked)', async () => {
    await expect(
      h.as('authenticated', alice, (q) =>
        q(`update users set status = 'active' where id = $1`, [alice]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a member CAN update their own self-service columns', async () => {
    const r = await h.as('authenticated', alice, (q) =>
      q(
        `update users set preferred_language = 'so', onboarding_state = '{"passwordNudgeDismissed":true}' where id = $1`,
        [alice],
      ),
    );
    expect(r.rowCount).toBe(1);
  });

  it("a member cannot update another member's row (0 rows affected)", async () => {
    const r = await h.as('authenticated', alice, (q) =>
      q(`update users set preferred_language = 'so' where id = $1`, [bob]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('a member cannot insert users rows', async () => {
    await expect(
      h.as('authenticated', alice, (q) =>
        q(`insert into users (id, email) values (gen_random_uuid(), 'x@example.com')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a suspended admin loses admin reads', async () => {
    await h.root.query(`update users set status = 'suspended' where id = $1`, [admin]);
    const r = await h.as('authenticated', admin, (q) => q('select id from users'));
    // only the self-row remains visible
    expect(r.rowCount).toBe(1);
    await h.root.query(`update users set status = 'active' where id = $1`, [admin]);
  });
});

describe('RLS: profiles', () => {
  let carol: string;
  let dave: string;

  beforeAll(async () => {
    await issueGrant({ email: 'carol@example.com' });
    carol = await createAuthUser({ email: 'carol@example.com' });
    await issueGrant({ email: 'dave@example.com' });
    dave = await createAuthUser({ email: 'dave@example.com' });
  });

  it('a member can create their own profile with self-service columns', async () => {
    const r = await h.as('authenticated', carol, (q) =>
      q(
        `insert into profiles (user_id, display_name, handle, skills)
         values ($1, 'Carol', 'carol', '{fintech}')`,
        [carol],
      ),
    );
    expect(r.rowCount).toBe(1);
  });

  it('a member cannot create a profile for someone else', async () => {
    await expect(
      h.as('authenticated', carol, (q) =>
        q(`insert into profiles (user_id, display_name, handle) values ($1, 'Fake Dave', 'dave')`, [
          dave,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('members can read each other’s profiles (directory layer)', async () => {
    const r = await h.as('authenticated', dave, (q) =>
      q('select handle from profiles where user_id = $1', [carol]),
    );
    expect(r.rowCount).toBe(1);
  });

  it('anon cannot read profiles', async () => {
    const r = await h.as('anon', null, (q) => q('select handle from profiles'));
    expect(r.rowCount).toBe(0);
  });

  it('a member cannot set their own membership tier (column grant)', async () => {
    await expect(
      h.as('authenticated', carol, (q) =>
        q(`update profiles set membership_tier_id = 'supporter' where user_id = $1`, [carol]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a member cannot set their own verification status', async () => {
    await expect(
      h.as('authenticated', carol, (q) =>
        q(`update profiles set verification_status = 'identity_verified' where user_id = $1`, [
          carol,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("a member cannot update someone else's profile (0 rows)", async () => {
    const r = await h.as('authenticated', dave, (q) =>
      q(`update profiles set bio = 'hijacked' where user_id = $1`, [carol]),
    );
    expect(r.rowCount).toBe(0);
  });
});

describe('RLS: membership tiers stay locked; capability gate works', () => {
  let erin: string;

  beforeAll(async () => {
    await issueGrant({ email: 'erin@example.com' });
    erin = await createAuthUser({ email: 'erin@example.com' });
    await h.root.query(
      `insert into profiles (user_id, display_name, handle) values ($1, 'Erin', 'erin')`,
      [erin],
    );
  });

  it('authenticated reads zero rows from membership_tiers and tier_capabilities', async () => {
    const tiers = await h.as('authenticated', erin, (q) => q('select * from membership_tiers'));
    const caps = await h.as('authenticated', erin, (q) => q('select * from tier_capabilities'));
    expect(tiers.rowCount).toBe(0);
    expect(caps.rowCount).toBe(0);
  });

  it('free member lacks create_lab; supporter has it', async () => {
    const before = await h.as('authenticated', erin, (q) =>
      q(`select public.has_capability('create_lab') as ok`),
    );
    expect(before.rows[0].ok).toBe(false);

    await h.root.query(`update profiles set membership_tier_id = 'supporter' where user_id = $1`, [
      erin,
    ]);
    const after = await h.as('authenticated', erin, (q) =>
      q(`select public.has_capability('create_lab') as ok`),
    );
    expect(after.rows[0].ok).toBe(true);
  });

  it('revoking the capability from the tier revokes it from the member', async () => {
    await h.root.query(
      `delete from tier_capabilities where tier_id = 'supporter' and capability = 'create_lab'`,
    );
    const r = await h.as('authenticated', erin, (q) =>
      q(`select public.has_capability('create_lab') as ok`),
    );
    expect(r.rows[0].ok).toBe(false);
    await h.root.query(
      `insert into tier_capabilities (tier_id, capability) values ('supporter', 'create_lab')`,
    );
  });

  it('a retired tier keeps capabilities (grandfathering) but leaves the catalog', async () => {
    await h.root.query(`update membership_tiers set is_active = false where id = 'supporter'`);

    const cap = await h.as('authenticated', erin, (q) =>
      q(`select public.has_capability('create_lab') as ok`),
    );
    expect(cap.rows[0].ok).toBe(true);

    const catalog = await h.as('anon', null, (q) => q('select * from public.list_visible_tiers()'));
    expect(catalog.rows.map((r) => r.id)).not.toContain('supporter');

    await h.root.query(`update membership_tiers set is_active = true where id = 'supporter'`);
  });

  it('a suspended supporter fails capability gates', async () => {
    await h.root.query(`update users set status = 'suspended' where id = $1`, [erin]);
    const r = await h.as('authenticated', erin, (q) =>
      q(`select public.has_capability('create_lab') as ok`),
    );
    expect(r.rows[0].ok).toBe(false);
    await h.root.query(`update users set status = 'active' where id = $1`, [erin]);
  });

  it('anon cannot call has_capability at all', async () => {
    await expect(
      h.as('anon', null, (q) => q(`select public.has_capability('create_lab')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('auth helpers', () => {
  it('has_password reflects auth.users.encrypted_password', async () => {
    await issueGrant({ email: 'pw@example.com' });
    const uid = await createAuthUser({ email: 'pw@example.com' });

    let r = await h.as('authenticated', uid, (q) => q('select public.has_password() as ok'));
    expect(r.rows[0].ok).toBe(false);

    await h.root.query(`update auth.users set encrypted_password = '' where id = $1`, [uid]);
    r = await h.as('authenticated', uid, (q) => q('select public.has_password() as ok'));
    expect(r.rows[0].ok).toBe(false);

    await h.root.query(`update auth.users set encrypted_password = '$2a$10$hash' where id = $1`, [
      uid,
    ]);
    r = await h.as('authenticated', uid, (q) => q('select public.has_password() as ok'));
    expect(r.rows[0].ok).toBe(true);
  });

  it('anon cannot call has_password', async () => {
    await expect(h.as('anon', null, (q) => q('select public.has_password()'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('get_signup_mode works for anon and follows app_settings', async () => {
    let r = await h.as('anon', null, (q) => q('select public.get_signup_mode() as mode'));
    expect(r.rows[0].mode).toBe('invite_only');

    await h.root.query(
      `update app_settings set value = to_jsonb('waitlist'::text) where key = 'signup_mode'`,
    );
    r = await h.as('anon', null, (q) => q('select public.get_signup_mode() as mode'));
    expect(r.rows[0].mode).toBe('waitlist');

    await h.root.query(
      `update app_settings set value = to_jsonb('invite_only'::text) where key = 'signup_mode'`,
    );
  });

  it('suspended mods/admins are not mods/admins', async () => {
    const uid = await createAuthUser({ email: 'modcheck@example.com', bypassGate: true });
    await h.root.query(`update users set role = 'mod' where id = $1`, [uid]);

    let r = await h.as('authenticated', uid, (q) => q('select public.is_mod() as ok'));
    expect(r.rows[0].ok).toBe(true);

    await h.root.query(`update users set status = 'suspended' where id = $1`, [uid]);
    r = await h.as('authenticated', uid, (q) => q('select public.is_mod() as ok'));
    expect(r.rows[0].ok).toBe(false);
  });
});

describe('RLS: locked auth tables', () => {
  let frank: string;

  beforeAll(async () => {
    await issueGrant({ email: 'frank@example.com' });
    frank = await createAuthUser({ email: 'frank@example.com' });
  });

  it.each(['app_settings', 'signup_grants', 'auth_email_tokens', 'waitlist_entries'])(
    '%s: authenticated reads zero rows and cannot insert',
    async (table) => {
      const r = await h.as('authenticated', frank, (q) => q(`select * from ${table}`));
      expect(r.rowCount).toBe(0);
      await expect(
        h.as('authenticated', frank, (q) =>
          q(`insert into ${table} default values`).catch((e) => {
            throw e;
          }),
        ),
      ).rejects.toThrow(/row-level security|permission denied|null value/);
    },
  );

  it('service_role (BYPASSRLS) can read grants — the API depends on it', async () => {
    const r = await h.as('service_role', null, (q) => q('select count(*)::int as n from signup_grants'));
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});

describe('RLS: invites', () => {
  let grace: string;
  let heidi: string;
  let inviteId: string;

  beforeAll(async () => {
    await issueGrant({ email: 'grace@example.com' });
    grace = await createAuthUser({ email: 'grace@example.com' });
    await issueGrant({ email: 'heidi@example.com' });
    heidi = await createAuthUser({ email: 'heidi@example.com' });
    const r = await h.root.query(
      `insert into invites (code, created_by_user_id) values ('XIDIG-GRACE-01', $1) returning id`,
      [grace],
    );
    inviteId = r.rows[0].id as string;
  });

  it('the creator sees their invite (tracked referrals)', async () => {
    const r = await h.as('authenticated', grace, (q) => q('select id from invites'));
    expect(r.rows.map((x) => x.id)).toContain(inviteId);
  });

  it('an unrelated member does not see it', async () => {
    const r = await h.as('authenticated', heidi, (q) =>
      q('select id from invites where id = $1', [inviteId]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('members cannot insert invite codes directly (API-only)', async () => {
    await expect(
      h.as('authenticated', grace, (q) =>
        q(`insert into invites (code, created_by_user_id) values ('HAX', $1)`, [grace]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('members cannot mark invites redeemed themselves', async () => {
    await expect(
      h.as('authenticated', grace, (q) =>
        q(`update invites set redeemed_by_user_id = $1 where id = $2`, [grace, inviteId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('RLS: consent_records', () => {
  let ivan: string;
  let judy: string;

  beforeAll(async () => {
    await issueGrant({ email: 'ivan@example.com' });
    ivan = await createAuthUser({ email: 'ivan@example.com' });
    await issueGrant({ email: 'judy@example.com' });
    judy = await createAuthUser({ email: 'judy@example.com' });
  });

  it('a member records and reads their own consent', async () => {
    await h.as('authenticated', ivan, (q) =>
      q(
        `insert into consent_records (user_id, consent_type, version, method)
         values ($1, 'terms_of_service', '2026-07-01', 'signup'),
                ($1, 'analytics', '2026-07-01', 'cookie_banner')`,
        [ivan],
      ),
    );
    const r = await h.as('authenticated', ivan, (q) => q('select * from consent_records'));
    expect(r.rowCount).toBe(2);
  });

  it("a member cannot read another member's consent", async () => {
    const r = await h.as('authenticated', judy, (q) => q('select * from consent_records'));
    expect(r.rowCount).toBe(0);
  });

  it('analytics consent is withdrawable; ToS acceptance is not', async () => {
    const withdrawn = await h.as('authenticated', ivan, (q) =>
      q(`update consent_records set withdrawn_at = now() where consent_type = 'analytics'`),
    );
    expect(withdrawn.rowCount).toBe(1);

    const tos = await h.as('authenticated', ivan, (q) =>
      q(`update consent_records set withdrawn_at = now() where consent_type = 'terms_of_service'`),
    );
    expect(tos.rowCount).toBe(0);
  });

  it('a member cannot record consent for someone else', async () => {
    await expect(
      h.as('authenticated', judy, (q) =>
        q(
          `insert into consent_records (user_id, consent_type, version) values ($1, 'cookies', 'v1')`,
          [ivan],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('RLS: audit_logs immutability', () => {
  let mallory: string;
  let auditAdmin: string;

  beforeAll(async () => {
    await issueGrant({ email: 'mallory@example.com' });
    mallory = await createAuthUser({ email: 'mallory@example.com' });
    auditAdmin = await createAuthUser({ email: 'audit-admin@example.com', bypassGate: true });
    await h.root.query(`update users set role = 'admin' where id = $1`, [auditAdmin]);
    await h.root.query(
      `insert into audit_logs (actor_user_id, action, metadata) values ($1, 'settings.update', '{}')`,
      [auditAdmin],
    );
  });

  it('members read nothing; admins read the trail', async () => {
    const member = await h.as('authenticated', mallory, (q) => q('select * from audit_logs'));
    expect(member.rowCount).toBe(0);

    const admin = await h.as('authenticated', auditAdmin, (q) => q('select * from audit_logs'));
    expect(admin.rowCount).toBeGreaterThan(0);
  });

  it('clients cannot write audit rows', async () => {
    await expect(
      h.as('authenticated', mallory, (q) =>
        q(`insert into audit_logs (action) values ('forged')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('even service_role cannot update or delete audit rows', async () => {
    await expect(
      h.as('service_role', null, (q) => q(`update audit_logs set action = 'tampered'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      h.as('service_role', null, (q) => q(`delete from audit_logs`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('RLS: later-phase tables are locked by default', () => {
  it.each(['posts', 'labs', 'messages', 'conversations', 'business_listings', 'notifications'])(
    '%s: authenticated reads zero rows',
    async (table) => {
      await issueGrant({ email: `reader-${table}@example.com` });
      const uid = await createAuthUser({ email: `reader-${table}@example.com` });
      const r = await h.as('authenticated', uid, (q) => q(`select * from ${table}`));
      expect(r.rowCount).toBe(0);
    },
  );
});
