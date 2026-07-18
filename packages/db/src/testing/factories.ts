/**
 * Shared test fixtures / factories for the RLS negative-test suites.
 *
 * The per-phase suites (phase2..phase7) each grew their own local `seedMember /
 * seedMod / seedLab / ...` helpers. This module hoists the common ones so the
 * cross-cutting security suite (security-negative.test.ts, phase8-ai-api.test.ts)
 * can build the full cast — multiple users, roles, tiers, verifiers, Labs,
 * Candidates, content — without re-deriving the idioms.
 *
 * Every factory takes the `TestDatabase` returned by createTestDatabase() and
 * uses its service-role `admin` connection for privileged seeding (mirroring the
 * API's service-role writers) and `asUser` for the writes a real client would
 * actually perform (so RLS is exercised where it matters).
 *
 * Handles are namespaced by the caller; keep them unique per test to avoid
 * cross-test collisions on the citext-unique profiles.handle.
 */
import type { TestDatabase } from './harness';

/** A row id, as returned by `... returning id`. */
type IdRow = { id: string };

/** Active member (beta gate bypassed) with a directory profile. */
export async function seedMember(db: TestDatabase, handle: string): Promise<string> {
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

/** Member promoted to moderator (ops action — service role). */
export async function seedMod(db: TestDatabase, handle: string): Promise<string> {
  const userId = await seedMember(db, handle);
  await db.admin.query(`update users set role = 'mod' where id = $1`, [userId]);
  return userId;
}

/** Member promoted to admin. */
export async function seedAdmin(db: TestDatabase, handle: string): Promise<string> {
  const userId = await seedMember(db, handle);
  await db.admin.query(`update users set role = 'admin' where id = $1`, [userId]);
  return userId;
}

/** Member on the Supporter tier (holds create_lab / vote_candidate capabilities). */
export async function seedSupporter(db: TestDatabase, handle: string): Promise<string> {
  const userId = await seedMember(db, handle);
  await db.admin.query(`update profiles set membership_tier_id = 'supporter' where user_id = $1`, [
    userId,
  ]);
  return userId;
}

/** Member granted the verifier capability (as an admin would via the API). */
export async function seedVerifier(db: TestDatabase, handle: string): Promise<string> {
  const userId = await seedMember(db, handle);
  await db.admin.query(`insert into verifier_grants (user_id) values ($1)`, [userId]);
  return userId;
}

/** A badged AI-assistant account (§21). Never earns Helper reputation. */
export async function seedAiAccount(db: TestDatabase, handle: string): Promise<string> {
  const userId = await seedMember(db, handle);
  await db.admin.query(`update users set is_ai = true where id = $1`, [userId]);
  return userId;
}

/** Set a user's lifecycle status (active/suspended/deactivated/...). */
export async function setStatus(
  db: TestDatabase,
  userId: string,
  status: string,
): Promise<void> {
  await db.admin.query(`update users set status = $1 where id = $2`, [status, userId]);
}

/** Set a member's profile country (drives the Somalia region gate at app layer). */
export async function setProfileCountry(
  db: TestDatabase,
  userId: string,
  country: string | null,
): Promise<void> {
  await db.admin.query(`update profiles set location_country = $1 where user_id = $2`, [
    country,
    userId,
  ]);
}

/** Seed a Lab/Space with its lead's lab_members row (service-role write). */
export async function seedLab(db: TestDatabase, lead: string, slug: string): Promise<string> {
  const res = await db.admin.query(
    `insert into labs (name, slug, lead_user_id, visibility, space_mode)
     values ($1, $2, $3, 'members', 'lab') returning id`,
    [`Lab ${slug}`, slug, lead],
  );
  const labId = (res.rows[0] as IdRow).id;
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, 'lead', 'active', now())`,
    [labId, lead],
  );
  return labId;
}

/** Add an active member to a Lab/Space (service-role write). */
export async function seedMembership(
  db: TestDatabase,
  labId: string,
  userId: string,
): Promise<void> {
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, 'member', 'active', now())`,
    [labId, userId],
  );
}

/** Seed a Candidate the way the API's service role would. */
export async function seedCandidate(
  db: TestDatabase,
  labId: string,
  creator: string,
  opts: {
    status?: 'draft' | 'submitted' | 'in_review' | 'approved' | 'parked' | 'declined';
    visibility?: 'all_members' | 'reviewers_only';
    coLabId?: string;
    name?: string;
  } = {},
): Promise<string> {
  const res = await db.admin.query(
    `insert into venture_candidates
       (lab_id, co_lab_id, created_by_user_id, name, status, visibility)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      labId,
      opts.coLabId ?? null,
      creator,
      opts.name ?? 'Test Venture',
      opts.status ?? 'draft',
      opts.visibility ?? 'all_members',
    ],
  );
  return (res.rows[0] as IdRow).id;
}

/** Seed a published Plaza post authored by `authorId` (service-role write). */
export async function seedPublishedPost(
  db: TestDatabase,
  authorId: string,
  opts: { type?: string; body?: string } = {},
): Promise<string> {
  const res = await db.admin.query(
    `insert into posts (author_user_id, type, body) values ($1, $2, $3) returning id`,
    [authorId, opts.type ?? 'update', opts.body ?? 'seeded'],
  );
  return (res.rows[0] as IdRow).id;
}

/**
 * Count how many rows of `table` (matched by `idCol`, default `id`) the given
 * user can SELECT under RLS. The canonical "can wrong-user read?" probe.
 */
export async function countVisible(
  db: TestDatabase,
  userId: string,
  table: string,
  id: string,
  idCol = 'id',
): Promise<number> {
  return db.asUser(userId, async (tx) => {
    const res = await tx.query(`select 1 from ${table} where ${idCol} = $1`, [id]);
    return res.rowCount ?? 0;
  });
}

/** As `countVisible`, but for the anon (signed-out) role. */
export async function countVisibleAnon(
  db: TestDatabase,
  table: string,
  id: string,
  idCol = 'id',
): Promise<number> {
  return db.withRole('anon', null, async (tx) => {
    const res = await tx.query(`select 1 from ${table} where ${idCol} = $1`, [id]);
    return res.rowCount ?? 0;
  });
}

/** Evaluate a boolean SECURITY DEFINER helper (e.g. has_capability) as `viewer`. */
export async function callBool(
  db: TestDatabase,
  viewer: string,
  fn: string,
  arg?: string,
): Promise<boolean> {
  const rows = await db.asUser(viewer, (tx) =>
    arg === undefined
      ? tx.query(`select ${fn}() as v`)
      : tx.query(`select ${fn}($1) as v`, [arg]),
  );
  return (rows.rows[0] as { v: boolean }).v;
}
