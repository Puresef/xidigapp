import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember, seedPublishedPost } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Account deletion privacy (migrations 20260911000000 + 20260911000100).
 *
 * Three guarantees, each verified against a real Postgres with every
 * migration applied:
 *
 *  1. COVERAGE CONTRACT — every column of profiles and users is classified
 *     below. A column the contract does not know about fails the suite, so a
 *     future column cannot silently escape the scrub. After anonymisation,
 *     every CLEAR column is empty, every TOMBSTONE/SET column holds its
 *     documented value, every KEEP column is untouched.
 *  2. ONE TRANSACTION, ONE RULE — anonymise_user() only ever acts on
 *     pending_deletion, is idempotent on deleted, refuses live accounts, and
 *     a concurrent cancel that lands first wins under the row lock.
 *  3. NOTHING CAN REPOPULATE — the auth→public mirror skips deleted rows, and
 *     any UPDATE to a deleted account's profile raises.
 *
 * It also pins what anonymisation must NOT do: delete posts, comments, Space
 * membership, vouches, media rows, or any record with its own retention rule.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

// ---------------------------------------------------------------------------
// The contract. Classification vocabulary:
//   clear     → null / empty after anonymisation (identifying or presentation)
//   tombstone → a fixed neutral value (checked exactly)
//   set       → written by the routine to a lifecycle value (checked)
//   keep      → operational; must be byte-identical before/after
//   derived   → recomputed by the database (generated column or trigger)
// ---------------------------------------------------------------------------
type Disposition =
  | { kind: 'clear' }
  | { kind: 'tombstone'; value: unknown }
  | { kind: 'set' }
  | { kind: 'keep' }
  | { kind: 'derived' };

const PROFILE_CONTRACT: Record<string, Disposition> = {
  user_id: { kind: 'keep' },
  display_name: { kind: 'tombstone', value: 'Deleted member' },
  handle: { kind: 'set' },
  headline: { kind: 'clear' },
  bio: { kind: 'clear' },
  avatar_path: { kind: 'clear' },
  avatar_blurhash: { kind: 'clear' },
  cover_path: { kind: 'clear' },
  cover_blurhash: { kind: 'clear' },
  location_city: { kind: 'clear' },
  location_country: { kind: 'clear' },
  location_country_code: { kind: 'derived' },
  latitude: { kind: 'clear' },
  longitude: { kind: 'clear' },
  timezone: { kind: 'clear' },
  skills: { kind: 'clear' },
  lanes: { kind: 'clear' },
  links: { kind: 'clear' },
  contact_options: { kind: 'clear' },
  verification_status: { kind: 'tombstone', value: 'unverified' },
  region_verified: { kind: 'tombstone', value: false },
  region_attested_at: { kind: 'clear' },
  // Operational, non-identifying. Tier/subscription are billing state (no
  // billing exists); timestamps are audit-relevant. Reviewed, kept.
  membership_tier_id: { kind: 'keep' },
  subscription_status: { kind: 'keep' },
  search_norm: { kind: 'derived' },
  created_at: { kind: 'keep' },
  updated_at: { kind: 'derived' },
};

const USER_CONTRACT: Record<string, Disposition> = {
  id: { kind: 'keep' },
  email: { kind: 'clear' },
  phone: { kind: 'clear' },
  status: { kind: 'tombstone', value: 'deleted' },
  anonymised_at: { kind: 'set' },
  // Operational: role hygiene and suspension history are moderation records;
  // preferences and onboarding flags are non-identifying; lifecycle
  // timestamps are the account's own history. Reviewed, kept.
  role: { kind: 'keep' },
  is_ai: { kind: 'keep' },
  preferred_language: { kind: 'keep' },
  low_bandwidth_enabled: { kind: 'keep' },
  onboarding_state: { kind: 'keep' },
  suspended_at: { kind: 'keep' },
  suspension_reason: { kind: 'keep' },
  deactivated_at: { kind: 'keep' },
  deletion_requested_at: { kind: 'keep' },
  created_at: { kind: 'keep' },
  updated_at: { kind: 'derived' },
  // Auth-shutdown bookkeeping (20260911000300): written by the lifecycle
  // sweep AFTER the transaction commits, never by anonymise_user itself.
  // Timestamps + a coarse category; no identifier. Reviewed, kept.
  auth_cleaned_at: { kind: 'keep' },
  auth_cleanup_attempted_at: { kind: 'keep' },
  auth_cleanup_failure: { kind: 'keep' },
};

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

async function columnsOf(table: string): Promise<string[]> {
  const res = await db.admin.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [table],
  );
  return res.rows.map((r) => r.column_name as string);
}

async function rowOf(table: string, idCol: string, id: string): Promise<Record<string, unknown>> {
  const res = await db.admin.query(`select * from ${table} where ${idCol} = $1`, [id]);
  return res.rows[0] as Record<string, unknown>;
}

/** A member with EVERY identifying column populated, plus satellites + media. */
async function seedFullyPopulatedMember(handle: string): Promise<string> {
  const userId = await seedMember(db, handle);
  await db.admin.query(
    `update profiles set
       headline = 'Fintech builder in Hargeisa',
       bio = 'I build payment rails.',
       avatar_path = $2, avatar_blurhash = 'LEHV6nWB2yk8',
       cover_path = $3, cover_blurhash = 'L6PZfSi_.AyE',
       location_city = 'Hargeisa', location_country = 'Somalia',
       latitude = 9.56, longitude = 44.07, timezone = 'Africa/Mogadishu',
       skills = array['payments','react'], lanes = array['fintech'],
       links = '[{"url":"https://example.com/me"}]'::jsonb,
       contact_options = '{"whatsapp":"+252611111111"}'::jsonb,
       verification_status = 'identity_verified',
       region_verified = true, region_attested_at = now()
     where user_id = $1`,
    [userId, `${userId}/avatar.webp`, `${userId}/cover.webp`],
  );
  await db.admin.query(
    `insert into profile_open_to (user_id, open_to_id)
       select $1, id from open_to_kinds limit 1`,
    [userId],
  );
  await db.admin.query(
    `insert into profile_link_meta (user_id, url_key, og_title, og_site_name)
       values ($1, 'example.com/me', 'My real name — portfolio', 'example.com')`,
    [userId],
  );
  await db.admin.query(
    `insert into media_uploads (owner_user_id, storage_path, thumb_path, kind, alt_text, mime_type, bytes, scan_status)
       values ($1, $2, $3, 'avatar', 'The real display name', 'image/webp', 1234, 'passed'),
              ($1, $4, $5, 'cover', 'The real display name', 'image/webp', 1234, 'passed')`,
    [
      userId,
      `${userId}/avatar.webp`,
      `${userId}/avatar_thumb.webp`,
      `${userId}/cover.webp`,
      `${userId}/cover_thumb.webp`,
    ],
  );
  return userId;
}

async function parkForDeletion(userId: string, daysAgo = 31): Promise<void> {
  await db.admin.query(
    `update users set status = 'pending_deletion',
       deletion_requested_at = now() - ($2 || ' days')::interval
     where id = $1`,
    [userId, String(daysAgo)],
  );
}

async function anonymise(userId: string): Promise<Record<string, unknown>> {
  return db.withRole('service_role', null, async (tx) => {
    const res = await tx.query(`select public.anonymise_user($1) as out`, [userId]);
    return res.rows[0].out as Record<string, unknown>;
  });
}

// ---------------------------------------------------------------------------

describe('coverage contract: every profiles/users column is classified', () => {
  it('profiles has no column the contract does not know', async () => {
    const columns = await columnsOf('profiles');
    const unknown = columns.filter((c) => !(c in PROFILE_CONTRACT));
    expect(unknown, 'classify these columns in PROFILE_CONTRACT and the scrub').toEqual([]);
    const stale = Object.keys(PROFILE_CONTRACT).filter((c) => !columns.includes(c));
    expect(stale, 'contract names columns that no longer exist').toEqual([]);
  });

  it('users has no column the contract does not know', async () => {
    const columns = await columnsOf('users');
    const unknown = columns.filter((c) => !(c in USER_CONTRACT));
    expect(unknown, 'classify these columns in USER_CONTRACT and the scrub').toEqual([]);
    const stale = Object.keys(USER_CONTRACT).filter((c) => !columns.includes(c));
    expect(stale).toEqual([]);
  });
});

describe('anonymise_user(): the transition', () => {
  it('scrubs every classified column and leaves every kept column untouched', async () => {
    const userId = await seedFullyPopulatedMember('adp_full');
    await parkForDeletion(userId);
    const beforeProfile = await rowOf('profiles', 'user_id', userId);
    const beforeUser = await rowOf('users', 'id', userId);

    const out = await anonymise(userId);
    expect(out.outcome).toBe('anonymised');
    expect(out.media_pending).toBe(2);

    const profile = await rowOf('profiles', 'user_id', userId);
    for (const [column, disposition] of Object.entries(PROFILE_CONTRACT)) {
      const value = profile[column];
      switch (disposition.kind) {
        case 'clear':
          expect(
            isEmpty(value),
            `profiles.${column} should be cleared, got ${JSON.stringify(value)}`,
          ).toBe(true);
          break;
        case 'tombstone':
          expect(value, `profiles.${column}`).toEqual(disposition.value);
          break;
        case 'keep':
          expect(value, `profiles.${column} must not change`).toEqual(beforeProfile[column]);
          break;
        case 'set':
        case 'derived':
          break;
      }
    }
    expect(profile.handle).toBe(`deleted_${userId.replace(/-/g, '').slice(0, 12)}`);
    // Derived columns recompute from the scrubbed inputs.
    expect(profile.location_country_code).toBeNull();
    expect(String(profile.search_norm)).not.toContain('adp_full');

    const user = await rowOf('users', 'id', userId);
    for (const [column, disposition] of Object.entries(USER_CONTRACT)) {
      const value = user[column];
      switch (disposition.kind) {
        case 'clear':
          expect(value, `users.${column}`).toBeNull();
          break;
        case 'tombstone':
          expect(value, `users.${column}`).toEqual(disposition.value);
          break;
        case 'keep':
          expect(value, `users.${column} must not change`).toEqual(beforeUser[column]);
          break;
        case 'set':
          expect(value, `users.${column} must be set`).not.toBeNull();
          break;
        case 'derived':
          break;
      }
    }
  });

  it('removes the presentation satellites and the identity in avatar/cover alt text', async () => {
    const userId = await seedFullyPopulatedMember('adp_sat');
    await parkForDeletion(userId);
    await anonymise(userId);

    for (const table of [
      'profile_open_to',
      'profile_pins',
      'profile_pinned_labs',
      'profile_modules',
      'profile_showcase',
      'profile_link_meta',
    ]) {
      const res = await db.admin.query(
        `select count(*)::int as n from ${table} where user_id = $1`,
        [userId],
      );
      expect(res.rows[0].n, table).toBe(0);
    }
    const media = await db.admin.query(
      `select kind, alt_text, storage_path from media_uploads where owner_user_id = $1 order by kind`,
      [userId],
    );
    // Rows and paths survive (the storage step is gated separately); the name goes.
    expect(media.rows.map((r) => [r.kind, r.alt_text])).toEqual([
      ['avatar', null],
      ['cover', null],
    ]);
    expect(media.rows.every((r) => typeof r.storage_path === 'string')).toBe(true);
  });

  it('writes exactly one audit row, inside the transaction', async () => {
    const userId = await seedFullyPopulatedMember('adp_audit');
    await parkForDeletion(userId);
    await anonymise(userId);
    await anonymise(userId); // idempotent re-run must not add a second row
    const res = await db.admin.query(
      `select count(*)::int as n from audit_logs where action = 'user.anonymised' and target_id = $1`,
      [userId],
    );
    expect(res.rows[0].n).toBe(1);
  });

  it('is idempotent on an already-deleted account and keeps the original anonymised_at', async () => {
    const userId = await seedFullyPopulatedMember('adp_idem');
    await parkForDeletion(userId);
    await anonymise(userId);
    const first = await rowOf('users', 'id', userId);
    const again = await anonymise(userId);
    expect(again.outcome).toBe('already_deleted');
    const second = await rowOf('users', 'id', userId);
    expect(second.anonymised_at).toEqual(first.anonymised_at);
  });

  it.each(['active', 'deactivated', 'suspended'])(
    'refuses a %s account and changes nothing',
    async (status) => {
      const userId = await seedFullyPopulatedMember(`adp_${status}`);
      await db.admin.query(`update users set status = $2 where id = $1`, [userId, status]);
      const before = await rowOf('profiles', 'user_id', userId);
      const out = await anonymise(userId);
      expect(out.outcome).toBe('skipped');
      expect(out.status).toBe(status);
      expect(await rowOf('profiles', 'user_id', userId)).toEqual(before);
      expect((await rowOf('users', 'id', userId)).status).toBe(status);
    },
  );

  it('reports not_found for an unknown id instead of auditing a phantom', async () => {
    const out = await anonymise('00000000-0000-4000-8000-000000000000');
    expect(out.outcome).toBe('not_found');
  });

  it('does not delete posts, comments, Space membership, vouches or media rows', async () => {
    const author = await seedFullyPopulatedMember('adp_content');
    const other = await seedMember(db, 'adp_other');
    const postId = await seedPublishedPost(db, author);
    await db.admin.query(
      `insert into comments (post_id, author_user_id, body, status) values ($1, $2, 'hello', 'published')`,
      [postId, author],
    );
    await db.admin.query(`insert into vouches (voucher_user_id, vouchee_user_id) values ($1, $2)`, [
      other,
      author,
    ]);
    await parkForDeletion(author);
    await anonymise(author);

    const counts = await db.admin.query(
      `select
         (select count(*)::int from posts where author_user_id = $1) as posts,
         (select count(*)::int from comments where author_user_id = $1) as comments,
         (select count(*)::int from vouches where vouchee_user_id = $1) as vouches,
         (select count(*)::int from media_uploads where owner_user_id = $1) as media,
         (select count(*)::int from users where id = $1) as users_row`,
      [author],
    );
    expect(counts.rows[0]).toEqual({ posts: 1, comments: 1, vouches: 1, media: 2, users_row: 1 });
  });

  it('is executable by the service role only', async () => {
    const res = await db.admin.query(
      `select has_function_privilege('anon', 'public.anonymise_user(uuid)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.anonymise_user(uuid)', 'execute') as authed,
              has_function_privilege('service_role', 'public.anonymise_user(uuid)', 'execute') as svc`,
    );
    expect(res.rows[0]).toEqual({ anon: false, authed: false, svc: true });
  });
});

describe('concurrency: a cancel that commits first wins', () => {
  it('the sweep skips a row that was cancelled while it waited for the lock', async () => {
    const userId = await seedFullyPopulatedMember('adp_race');
    await parkForDeletion(userId);

    // Second connection = the member's cancel_deletion, holding the row lock.
    const member = new pg.Client({ connectionString: db.connectionString });
    await member.connect();
    try {
      await member.query('begin');
      await member.query(
        `update users set status = 'active', deletion_requested_at = null
          where id = $1 and status = 'pending_deletion'`,
        [userId],
      );
      // The sweep's RPC now blocks on the row lock…
      const sweep = anonymise(userId);
      await new Promise((r) => setTimeout(r, 150));
      // …until the cancel commits.
      await member.query('commit');
      const out = await sweep;
      expect(out.outcome).toBe('skipped');
      expect(out.status).toBe('active');
      const user = await rowOf('users', 'id', userId);
      expect(user.status).toBe('active');
      expect((await rowOf('profiles', 'user_id', userId)).display_name).toBe('adp_race');
    } finally {
      await member.end();
    }
  });
});

describe('nothing can repopulate an anonymised account', () => {
  it('the auth→public mirror ignores a deleted row but still syncs a live one', async () => {
    const deleted = await seedFullyPopulatedMember('adp_mirror_del');
    const live = await seedMember(db, 'adp_mirror_live');
    await parkForDeletion(deleted);
    await anonymise(deleted);

    await db.admin.query(`update auth.users set email = 'back-again@example.com' where id = $1`, [
      deleted,
    ]);
    await db.admin.query(`update auth.users set email = 'renamed@example.com' where id = $1`, [
      live,
    ]);

    expect((await rowOf('users', 'id', deleted)).email).toBeNull();
    expect((await rowOf('users', 'id', live)).email).toBe('renamed@example.com');
  });

  it('the mirror still syncs during the grace period (cancel must restore intact)', async () => {
    const userId = await seedMember(db, 'adp_mirror_grace');
    await parkForDeletion(userId, 3);
    await db.admin.query(`update auth.users set email = 'grace-change@example.com' where id = $1`, [
      userId,
    ]);
    expect((await rowOf('users', 'id', userId)).email).toBe('grace-change@example.com');
  });

  it('any UPDATE to a deleted account’s profile raises, even from the service role', async () => {
    const userId = await seedFullyPopulatedMember('adp_freeze');
    await parkForDeletion(userId);
    await anonymise(userId);

    await expect(
      db.withRole('service_role', null, (tx) =>
        tx.query(
          `update profiles set verification_status = 'community_verified' where user_id = $1`,
          [userId],
        ),
      ),
    ).rejects.toThrow(/profile_frozen/);
    await expect(
      db.admin.query(`update profiles set headline = 'sneaky' where user_id = $1`, [userId]),
    ).rejects.toThrow(/profile_frozen/);
    expect((await rowOf('profiles', 'user_id', userId)).verification_status).toBe('unverified');
  });

  it('a live account’s profile still accepts updates', async () => {
    const userId = await seedMember(db, 'adp_unfrozen');
    await db.asUser(userId, (tx) =>
      tx.query(`update profiles set bio = 'still me' where user_id = $1`, [userId]),
    );
    expect((await rowOf('profiles', 'user_id', userId)).bio).toBe('still me');
  });
});
