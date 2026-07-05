import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * End-to-end validation of the migration chain against a real Postgres 17
 * with a Supabase-shaped environment (roles, default privileges, auth stub).
 * Covers: the beta signup gate, public.users mirroring, RBAC/membership
 * helpers, RLS policies, and column-level grants — i.e. everything the API
 * layer's security model leans on.
 *
 * Booting the cluster takes a few seconds; the whole file shares one
 * database, so tests use fresh users per block and never assume global counts.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

/** Creates an active member (bypassing the beta gate) with a profile. */
async function seedMember(handle: string): Promise<string> {
  const userId = await db.createAuthUser({ email: `${handle}@example.com`, gateBypass: true });
  await db.asUser(userId, (tx) =>
    tx.query(`insert into profiles (user_id, display_name, handle) values ($1, $2, $3)`, [
      userId,
      handle,
      handle,
    ]),
  );
  return userId;
}

describe('migration chain', () => {
  it('enables row level security on every public table', async () => {
    const result = await db.admin.query(
      `select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(result.rows).toEqual([]);
  });

  it('seeds reference data (tiers, categories, tags, badges, signup mode)', async () => {
    const tiers = await db.admin.query(`select id from membership_tiers order by position`);
    expect(tiers.rows.map((r) => r.id)).toEqual(['free', 'supporter']);

    const counts = await db.admin.query(
      `select
         (select count(*) from listing_categories) as categories,
         (select count(*) from tags) as tags,
         (select count(*) from badge_definitions) as badges,
         (select value #>> '{}' from app_settings where key = 'signup_mode') as mode`,
    );
    expect(Number(counts.rows[0].categories)).toBe(15);
    expect(Number(counts.rows[0].tags)).toBe(15);
    expect(Number(counts.rows[0].badges)).toBe(8);
    expect(counts.rows[0].mode).toBe('invite_only');
  });
});

describe('beta signup gate (on_auth_user_created)', () => {
  it('aborts a signup that has no open grant', async () => {
    await expect(db.createAuthUser({ email: 'no-grant@example.com' })).rejects.toThrow(
      /XIDIG_SIGNUP_NOT_ALLOWED/,
    );
  });

  it('allows signup with an open email grant, consumes it, and mirrors the user', async () => {
    const grantId = await db.createSignupGrant({ email: 'granted@example.com' });
    const userId = await db.createAuthUser({ email: 'granted@example.com' });

    const mirrored = await db.admin.query(`select email, role, status from users where id = $1`, [
      userId,
    ]);
    expect(mirrored.rows[0]).toMatchObject({
      email: 'granted@example.com',
      role: 'member',
      status: 'active',
    });

    const grant = await db.admin.query(
      `select consumed_at, consumed_by_user_id from signup_grants where id = $1`,
      [grantId],
    );
    expect(grant.rows[0].consumed_at).not.toBeNull();
    expect(grant.rows[0].consumed_by_user_id).toBe(userId);
  });

  it('rejects an expired grant', async () => {
    await db.createSignupGrant({ email: 'expired@example.com', expiresInMinutes: -5 });
    await expect(db.createAuthUser({ email: 'expired@example.com' })).rejects.toThrow(
      /XIDIG_SIGNUP_NOT_ALLOWED/,
    );
  });

  it('normalises GoTrue phone (no +) to E.164 and matches the grant', async () => {
    await db.createSignupGrant({ phone: '+252611234567' });
    // GoTrue stores the phone without the leading '+'.
    const userId = await db.createAuthUser({ phone: '252611234567' });

    const row = await db.admin.query(`select phone from users where id = $1`, [userId]);
    expect(row.rows[0].phone).toBe('+252611234567');
  });

  it('marks the invite redeemed when the grant came from an invite', async () => {
    const inviter = await seedMember('inviter_gate');
    const invite = await db.admin.query(
      `insert into invites (code, created_by_user_id) values ('GATE-TEST-1', $1) returning id`,
      [inviter],
    );
    await db.createSignupGrant({
      email: 'invited@example.com',
      inviteId: invite.rows[0].id as string,
    });
    const userId = await db.createAuthUser({ email: 'invited@example.com' });

    const redeemed = await db.admin.query(
      `select redeemed_by_user_id, redeemed_at from invites where id = $1`,
      [invite.rows[0].id],
    );
    expect(redeemed.rows[0].redeemed_by_user_id).toBe(userId);
    expect(redeemed.rows[0].redeemed_at).not.toBeNull();
  });

  it('marks the waitlist entry joined when the grant came from the waitlist', async () => {
    const entry = await db.admin.query(
      `insert into waitlist_entries (email, status, invited_at)
       values ('waitlisted@example.com', 'invited', now()) returning id`,
    );
    await db.createSignupGrant({
      email: 'waitlisted@example.com',
      waitlistEntryId: entry.rows[0].id as string,
    });
    await db.createAuthUser({ email: 'waitlisted@example.com' });

    const status = await db.admin.query(`select status from waitlist_entries where id = $1`, [
      entry.rows[0].id,
    ]);
    expect(status.rows[0].status).toBe('joined');
  });

  it('lets the service role bypass the gate via app_metadata', async () => {
    const userId = await db.createAuthUser({ email: 'ops-created@example.com', gateBypass: true });
    const row = await db.admin.query(`select email from users where id = $1`, [userId]);
    expect(row.rows[0].email).toBe('ops-created@example.com');
  });

  it('keeps the public.users mirror in sync on auth email change', async () => {
    const userId = await db.createAuthUser({ email: 'before@example.com', gateBypass: true });
    await db.admin.query(`update auth.users set email = 'after@example.com' where id = $1`, [
      userId,
    ]);
    const row = await db.admin.query(`select email from users where id = $1`, [userId]);
    expect(row.rows[0].email).toBe('after@example.com');
  });
});

describe('RBAC / membership helpers', () => {
  it('get_signup_mode is callable pre-auth and returns the seeded mode', async () => {
    const mode = await db.withRole('anon', null, (tx) =>
      tx.query(`select public.get_signup_mode() as mode`),
    );
    expect(mode.rows[0].mode).toBe('invite_only');
  });

  it('list_visible_tiers returns active tiers with capabilities, pre-auth', async () => {
    const tiers = await db.withRole('anon', null, (tx) =>
      tx.query(`select * from public.list_visible_tiers()`),
    );
    expect(tiers.rows.map((r: { id: string }) => r.id)).toEqual(['free', 'supporter']);
    const supporter = tiers.rows.find((r: { id: string }) => r.id === 'supporter') as {
      capabilities: string[];
    };
    expect(supporter.capabilities).toContain('create_lab');
  });

  it('membership_tiers and tier_capabilities are not directly readable', async () => {
    const user = await seedMember('tier_probe');
    const tiers = await db.asUser(user, (tx) => tx.query(`select * from membership_tiers`));
    const caps = await db.asUser(user, (tx) => tx.query(`select * from tier_capabilities`));
    expect(tiers.rows).toEqual([]);
    expect(caps.rows).toEqual([]);
  });

  it('has_capability follows the tier and requires an active account', async () => {
    const user = await seedMember('cap_check');

    const asFree = await db.asUser(user, (tx) =>
      tx.query(`select public.has_capability('create_lab') as ok`),
    );
    expect(asFree.rows[0].ok).toBe(false);

    await db.admin.query(
      `update profiles set membership_tier_id = 'supporter' where user_id = $1`,
      [user],
    );
    const asSupporter = await db.asUser(user, (tx) =>
      tx.query(`select public.has_capability('create_lab') as ok`),
    );
    expect(asSupporter.rows[0].ok).toBe(true);

    await db.admin.query(`update users set status = 'suspended' where id = $1`, [user]);
    const suspended = await db.asUser(user, (tx) =>
      tx.query(`select public.has_capability('create_lab') as ok`),
    );
    expect(suspended.rows[0].ok).toBe(false);
  });

  it('is_admin / is_mod reflect role and require an active account', async () => {
    const user = await seedMember('rbac_check');

    const asMember = await db.asUser(user, (tx) =>
      tx.query(`select public.is_admin() as is_admin, public.is_mod() as is_mod`),
    );
    expect(asMember.rows[0]).toMatchObject({ is_admin: false, is_mod: false });

    await db.admin.query(`update users set role = 'mod' where id = $1`, [user]);
    const asMod = await db.asUser(user, (tx) =>
      tx.query(`select public.is_admin() as is_admin, public.is_mod() as is_mod`),
    );
    expect(asMod.rows[0]).toMatchObject({ is_admin: false, is_mod: true });

    await db.admin.query(`update users set role = 'admin', status = 'suspended' where id = $1`, [
      user,
    ]);
    const suspendedAdmin = await db.asUser(user, (tx) =>
      tx.query(`select public.is_admin() as is_admin`),
    );
    expect(suspendedAdmin.rows[0].is_admin).toBe(false);
  });

  it('has_password reads auth.users truthfully', async () => {
    const withoutPassword = await db.createAuthUser({
      email: 'nopass@example.com',
      gateBypass: true,
    });
    const withPassword = await db.createAuthUser({
      email: 'haspass@example.com',
      password: true,
      gateBypass: true,
    });

    const no = await db.asUser(withoutPassword, (tx) =>
      tx.query(`select public.has_password() as ok`),
    );
    const yes = await db.asUser(withPassword, (tx) =>
      tx.query(`select public.has_password() as ok`),
    );
    expect(no.rows[0].ok).toBe(false);
    expect(yes.rows[0].ok).toBe(true);
  });
});

describe('users & profiles policies', () => {
  it('a member reads only their own users row', async () => {
    const alice = await seedMember('alice_users');
    await seedMember('bob_users');

    const visible = await db.asUser(alice, (tx) => tx.query(`select id from users`));
    expect(visible.rows).toEqual([{ id: alice }]);
  });

  it('a member updates own self-service columns but never role/status', async () => {
    const alice = await seedMember('alice_cols');

    await db.asUser(alice, (tx) =>
      tx.query(`update users set preferred_language = 'so' where id = $1`, [alice]),
    );
    const updated = await db.admin.query(`select preferred_language from users where id = $1`, [
      alice,
    ]);
    expect(updated.rows[0].preferred_language).toBe('so');

    await expect(
      db.asUser(alice, (tx) => tx.query(`update users set role = 'admin' where id = $1`, [alice])),
    ).rejects.toThrow(/permission denied/);
  });

  it('profiles are member-visible; writes are own-row only', async () => {
    const alice = await seedMember('alice_prof');
    const bob = await seedMember('bob_prof');

    const bobSeesAlice = await db.asUser(bob, (tx) =>
      tx.query(`select handle from profiles where user_id = $1`, [alice]),
    );
    expect(bobSeesAlice.rows).toHaveLength(1);

    await expect(
      db.asUser(bob, (tx) =>
        tx.query(
          `insert into profiles (user_id, display_name, handle) values ($1, 'Forged', 'forged_prof')`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      db.asUser(bob, (tx) =>
        tx.query(
          `update profiles set verification_status = 'identity_verified' where user_id = $1`,
          [bob],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    // Cross-user update matches zero rows rather than erroring.
    const crossUpdate = await db.asUser(bob, (tx) =>
      tx.query(`update profiles set display_name = 'Hijacked' where user_id = $1`, [alice]),
    );
    expect(crossUpdate.rowCount).toBe(0);
  });

  it('anon cannot read profiles at all (select grant revoked, not just RLS-empty)', async () => {
    await expect(
      db.withRole('anon', null, (tx) => tx.query(`select * from profiles`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('locked tables stay locked', () => {
  it('app_settings and signup_grants return zero rows to authenticated', async () => {
    const user = await seedMember('locked_probe');
    const settings = await db.asUser(user, (tx) => tx.query(`select * from app_settings`));
    const grants = await db.asUser(user, (tx) => tx.query(`select * from signup_grants`));
    expect(settings.rows).toEqual([]);
    expect(grants.rows).toEqual([]);
  });

  it('audit_logs: admin-readable, immutable even for the service role', async () => {
    const member = await seedMember('audit_member');
    const admin = await seedMember('audit_admin');
    await db.admin.query(`update users set role = 'admin' where id = $1`, [admin]);

    await db.withRole('service_role', null, (tx) =>
      tx.query(
        `insert into audit_logs (actor_user_id, action, target_type, target_id)
         values ($1, 'test.action', 'user', $1)`,
        [member],
      ),
    );

    const memberView = await db.asUser(member, (tx) => tx.query(`select * from audit_logs`));
    expect(memberView.rows).toEqual([]);

    const adminView = await db.asUser(admin, (tx) =>
      tx.query(`select action from audit_logs where action = 'test.action'`),
    );
    expect(adminView.rows).toHaveLength(1);

    await expect(
      db.withRole('service_role', null, (tx) => tx.query(`delete from audit_logs`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('phase 1 API surface policies', () => {
  it('follows: own-row insert/select/delete; forging denied', async () => {
    const alice = await seedMember('alice_follow');
    const bob = await seedMember('bob_follow');

    await db.asUser(alice, (tx) =>
      tx.query(
        `insert into follows (follower_user_id, target_type, target_id) values ($1, 'user', $2)`,
        [alice, bob],
      ),
    );

    await expect(
      db.asUser(bob, (tx) =>
        tx.query(
          `insert into follows (follower_user_id, target_type, target_id) values ($1, 'user', $2)`,
          [alice, bob],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    const aliceSees = await db.asUser(alice, (tx) => tx.query(`select target_id from follows`));
    expect(aliceSees.rows).toEqual([{ target_id: bob }]);

    const bobSees = await db.asUser(bob, (tx) => tx.query(`select * from follows`));
    expect(bobSees.rows).toEqual([]);

    const deleted = await db.asUser(alice, (tx) =>
      tx.query(`delete from follows where target_type = 'user' and target_id = $1`, [bob]),
    );
    expect(deleted.rowCount).toBe(1);
  });

  it('listings: owner-scoped writes, moderation columns protected', async () => {
    const alice = await seedMember('alice_listing');
    const bob = await seedMember('bob_listing');
    const category = await db.admin.query(
      `select id from listing_categories where slug = 'retail'`,
    );
    const categoryId = category.rows[0].id as string;

    const inserted = await db.asUser(alice, (tx) =>
      tx.query(
        `insert into business_listings (owner_user_id, business_name, category_id, city, country)
         values ($1, 'Hodan Retail', $2, 'Mogadishu', 'Somalia') returning id`,
        [alice, categoryId],
      ),
    );
    const listingId = inserted.rows[0].id as string;

    await expect(
      db.asUser(bob, (tx) =>
        tx.query(
          `insert into business_listings (owner_user_id, business_name, category_id)
           values ($1, 'Forged Listing', $2)`,
          [alice, categoryId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      db.asUser(alice, (tx) =>
        tx.query(`update business_listings set verification_status = 'verified' where id = $1`, [
          listingId,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);

    // Published listings are member-visible…
    const bobSees = await db.asUser(bob, (tx) =>
      tx.query(`select business_name from business_listings where id = $1`, [listingId]),
    );
    expect(bobSees.rows).toHaveLength(1);

    // …hidden ones only owner- and mod-visible.
    await db.admin.query(`update business_listings set status = 'hidden' where id = $1`, [
      listingId,
    ]);
    const bobSeesHidden = await db.asUser(bob, (tx) =>
      tx.query(`select id from business_listings where id = $1`, [listingId]),
    );
    expect(bobSeesHidden.rows).toEqual([]);

    const ownerSeesHidden = await db.asUser(alice, (tx) =>
      tx.query(`select id from business_listings where id = $1`, [listingId]),
    );
    expect(ownerSeesHidden.rows).toHaveLength(1);

    const mod = await seedMember('mod_listing');
    await db.admin.query(`update users set role = 'mod' where id = $1`, [mod]);
    const modSeesHidden = await db.asUser(mod, (tx) =>
      tx.query(`select id from business_listings where id = $1`, [listingId]),
    );
    expect(modSeesHidden.rows).toHaveLength(1);
  });

  it('listing claims: only unowned listings are claimable, claims are private', async () => {
    const claimant = await seedMember('claimant');
    const other = await seedMember('claim_other');
    const category = await db.admin.query(
      `select id from listing_categories where slug = 'finance'`,
    );

    const unowned = await db.admin.query(
      `insert into business_listings (owner_user_id, business_name, category_id, source)
       values (null, 'Unclaimed Exchange', $1, 'seed') returning id`,
      [category.rows[0].id],
    );
    const owned = await db.admin.query(
      `insert into business_listings (owner_user_id, business_name, category_id)
       values ($1, 'Owned Shop', $2) returning id`,
      [other, category.rows[0].id],
    );

    await db.asUser(claimant, (tx) =>
      tx.query(
        `insert into listing_claims (listing_id, claimant_user_id, evidence)
         values ($1, $2, 'It is mine — see website footer')`,
        [unowned.rows[0].id, claimant],
      ),
    );

    await expect(
      db.asUser(claimant, (tx) =>
        tx.query(`insert into listing_claims (listing_id, claimant_user_id) values ($1, $2)`, [
          owned.rows[0].id,
          claimant,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);

    const otherSees = await db.asUser(other, (tx) => tx.query(`select * from listing_claims`));
    expect(otherSees.rows).toEqual([]);
  });

  it('vouches: API-only writes, visible to both parties only', async () => {
    const voucher = await seedMember('voucher');
    const vouchee = await seedMember('vouchee');
    const outsider = await seedMember('vouch_outsider');

    await expect(
      db.asUser(voucher, (tx) =>
        tx.query(`insert into vouches (voucher_user_id, vouchee_user_id) values ($1, $2)`, [
          voucher,
          vouchee,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);

    await db.withRole('service_role', null, (tx) =>
      tx.query(`insert into vouches (voucher_user_id, vouchee_user_id) values ($1, $2)`, [
        voucher,
        vouchee,
      ]),
    );

    const voucheeSees = await db.asUser(vouchee, (tx) => tx.query(`select * from vouches`));
    expect(voucheeSees.rows).toHaveLength(1);
    const outsiderSees = await db.asUser(outsider, (tx) => tx.query(`select * from vouches`));
    expect(outsiderSees.rows).toEqual([]);
  });

  it('skill endorsements: peer-managed, self-endorsement blocked by CHECK', async () => {
    const endorser = await seedMember('endorser');
    const endorsee = await seedMember('endorsee');

    await db.asUser(endorser, (tx) =>
      tx.query(
        `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill)
         values ($1, $2, 'logistics')`,
        [endorser, endorsee],
      ),
    );

    await expect(
      db.asUser(endorser, (tx) =>
        tx.query(
          `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill)
           values ($1, $1, 'self-praise')`,
          [endorser],
        ),
      ),
    ).rejects.toThrow(/skill_endorsements_no_self/);

    const removed = await db.asUser(endorser, (tx) =>
      tx.query(`delete from skill_endorsements where endorsee_user_id = $1`, [endorsee]),
    );
    expect(removed.rowCount).toBe(1);
  });

  it('badges: catalog readable; revoked awards hidden from others, visible to holder', async () => {
    const holder = await seedMember('badge_holder');
    const viewer = await seedMember('badge_viewer');
    const badge = await db.admin.query(
      `select id from badge_definitions where slug = 'founding-member'`,
    );

    const award = await db.admin.query(
      `insert into user_badges (user_id, badge_id) values ($1, $2) returning id`,
      [holder, badge.rows[0].id],
    );

    const viewerSees = await db.asUser(viewer, (tx) =>
      tx.query(`select id from user_badges where user_id = $1`, [holder]),
    );
    expect(viewerSees.rows).toHaveLength(1);

    await db.admin.query(`update user_badges set revoked_at = now() where id = $1`, [
      award.rows[0].id,
    ]);

    const viewerSeesRevoked = await db.asUser(viewer, (tx) =>
      tx.query(`select id from user_badges where user_id = $1`, [holder]),
    );
    expect(viewerSeesRevoked.rows).toEqual([]);

    const holderSeesRevoked = await db.asUser(holder, (tx) =>
      tx.query(`select id from user_badges where user_id = $1`, [holder]),
    );
    expect(holderSeesRevoked.rows).toHaveLength(1);
  });

  it('taxonomies: readable by members, not writable', async () => {
    const user = await seedMember('taxonomy_probe');

    const tags = await db.asUser(user, (tx) => tx.query(`select count(*)::int as n from tags`));
    expect(tags.rows[0].n).toBeGreaterThan(0);

    const categories = await db.asUser(user, (tx) =>
      tx.query(`select count(*)::int as n from listing_categories`),
    );
    expect(categories.rows[0].n).toBe(15);

    await expect(
      db.asUser(user, (tx) => tx.query(`insert into tags (name) values ('rogue-tag')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('xidig_name_norm — §18 transliteration search (20260705010000)', () => {
  // Same variant groups as apps/web/src/lib/search-norm.test.ts. The SQL
  // function and the TS twin fold independently (stored vs query side), so
  // both suites also pin identical exact skeletons below.
  const variantGroups: string[][] = [
    ['Maxamed', 'Mohamed', 'Mohammed', 'Muhammad'],
    ['Axmed', 'Ahmed'],
    ['Cali', 'Ali'],
    ['Cabdullahi', 'Abdullahi', 'Abdulahi'],
    ['Khadiija', 'Khadija'],
    ['Xasan', 'Hassan', 'Hasan'],
    ['Faarax', 'Farah'],
    ['Cumar', 'Omar', 'Umar'],
  ];

  it('folds transliteration variants to a single skeleton', async () => {
    for (const group of variantGroups) {
      const result = await db.admin.query(
        `select count(distinct public.xidig_name_norm(n))::int as skeletons
         from unnest($1::text[]) as n`,
        [group],
      );
      expect(result.rows[0].skeletons).toBe(1);
    }
  });

  it('pins the exact skeletons the TS twin pins (cross-language equivalence)', async () => {
    const result = await db.admin.query(
      `select public.xidig_name_norm('Maxamed Warsame') as a,
              public.xidig_name_norm('maxamed_w') as b,
              public.xidig_name_norm('—— !!') as c`,
    );
    expect(result.rows[0].a).toBe('mahamad warsama');
    expect(result.rows[0].b).toBe('mahamad w');
    expect(result.rows[0].c).toBe('');
  });

  it('search_norm generated column is filterable by members under RLS', async () => {
    const target = await db.createAuthUser({
      email: 'mohamed.w@example.com',
      gateBypass: true,
    });
    await db.asUser(target, (tx) =>
      tx.query(`insert into profiles (user_id, display_name, handle) values ($1, $2, $3)`, [
        target,
        'Mohamed Warsame',
        'mohamed_w',
      ]),
    );
    const searcher = await seedMember('search_probe');

    // The query side folds "Maxamed" exactly like lib/search-norm.ts would.
    const found = await db.asUser(searcher, (tx) =>
      tx.query(
        `select handle from profiles
         where search_norm ilike '%' || public.xidig_name_norm('Maxamed') || '%'`,
      ),
    );
    expect(found.rows.map((r) => r.handle)).toContain('mohamed_w');
  });

  it('normalizes business listings for duplicate-adjacent search', async () => {
    const result = await db.admin.query(
      `select public.xidig_name_norm('Xidig Halal Foods') as norm`,
    );
    expect(result.rows[0].norm).toBe(
      (await db.admin.query(`select public.xidig_name_norm('Hidig Xalal Foods') as norm`))
        .rows[0].norm,
    );
  });
});

describe('following_listings view + claim idempotency (20260705020000)', () => {
  it('feed view: caller sees followed users\' published listings, not others\'', async () => {
    const follower = await seedMember('feed_follower');
    const followed = await seedMember('feed_followed');
    const stranger = await seedMember('feed_stranger');
    const category = (
      await db.admin.query(`select id from listing_categories order by position limit 1`)
    ).rows[0].id;

    // Two published listings — one by a followed user, one by a stranger.
    await db.asUser(followed, (tx) =>
      tx.query(
        `insert into business_listings (owner_user_id, business_name, category_id) values ($1, 'Followed Biz', $2)`,
        [followed, category],
      ),
    );
    await db.asUser(stranger, (tx) =>
      tx.query(
        `insert into business_listings (owner_user_id, business_name, category_id) values ($1, 'Stranger Biz', $2)`,
        [stranger, category],
      ),
    );
    await db.asUser(follower, (tx) =>
      tx.query(
        `insert into follows (follower_user_id, target_type, target_id) values ($1, 'user', $2)`,
        [follower, followed],
      ),
    );

    const feed = await db.asUser(follower, (tx) =>
      tx.query(`select business_name from public.following_listings`),
    );
    const names = feed.rows.map((r) => r.business_name);
    expect(names).toContain('Followed Biz');
    expect(names).not.toContain('Stranger Biz');
  });

  it('feed view: security_invoker keeps it empty for a user who follows nobody', async () => {
    const loner = await seedMember('feed_loner');
    const feed = await db.asUser(loner, (tx) =>
      tx.query(`select count(*)::int as n from public.following_listings`),
    );
    expect(feed.rows[0].n).toBe(0);
  });

  it('claim idempotency: a member cannot hold two pending claims on one listing', async () => {
    const claimant = await seedMember('claim_dup_claimant');
    const category = (
      await db.admin.query(`select id from listing_categories order by position limit 1`)
    ).rows[0].id;

    // An UNCLAIMED (owner_user_id null) seeded listing.
    const listingId = (
      await db.admin.query(
        `insert into business_listings (business_name, category_id, source) values ('Seed Co', $1, 'seed') returning id`,
        [category],
      )
    ).rows[0].id;

    await db.asUser(claimant, (tx) =>
      tx.query(`insert into listing_claims (listing_id, claimant_user_id) values ($1, $2)`, [
        listingId,
        claimant,
      ]),
    );
    await expect(
      db.asUser(claimant, (tx) =>
        tx.query(`insert into listing_claims (listing_id, claimant_user_id) values ($1, $2)`, [
          listingId,
          claimant,
        ]),
      ),
    ).rejects.toThrow(/duplicate key|listing_claims_one_pending_per_member/);
  });
});
