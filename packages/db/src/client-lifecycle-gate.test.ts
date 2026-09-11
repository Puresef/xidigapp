import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedCandidate, seedMember, seedMembership } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Client-API lifecycle gate (migration 20260911000400).
 *
 * An account that is no longer a member in good standing — suspended,
 * deactivated or deleted — must not keep member-level database access through
 * a token it already holds. PostgREST and Realtime validate the JWT locally
 * and never ask GoTrue, so the ban (Option A) cannot reach a token issued
 * before it; the database has to refuse instead. `asUser` below is exactly how
 * PostgREST runs such a request (SET LOCAL role authenticated + the token's
 * claims).
 *
 * The rule: public.current_account_can_use_client_api() is true only for an
 * account in 'active' or 'pending_deletion' (the cancellable §19 grace keeps
 * full access). Every table the signed-in role can touch carries a RESTRICTIVE
 * policy calling it; the RLS-bypassing RPCs that return member data call it
 * too. One exemption: a blocked account can still SELECT its OWN users row —
 * that is how the explicit, server-mediated routes (appeal, reactivate, cancel
 * deletion, sign-in state messages) learn its status. Those routes do their
 * actual work with the service role, which no policy here touches.
 *
 * Pinned: the status matrix with active and grace-period positive controls,
 * the RPC guards, the exemption, and three coverage contracts (tables, views,
 * RPCs) that fail when a new table or function is added unclassified.
 */

let db: TestDatabase;

const BLOCKED = ['suspended', 'deactivated', 'deleted'] as const;
const ALLOWED = ['active', 'pending_deletion'] as const;
const STATUSES = [...ALLOWED, ...BLOCKED] as const;
type Status = (typeof STATUSES)[number];

interface Cast {
  member: string;
  conversation: string;
  lab: string;
  ownListing: string;
}

let peer: string;
let unownedListing: string;
let peerAsk: string;
let poll: string;
let candidate: string;
const cast = {} as Record<Status, Cast>;

const LISTING_CATEGORY = `(select id from listing_categories order by position limit 1)`;

async function seedCast(status: Status): Promise<Cast> {
  const member = await seedMember(db, `gate_${status}`);
  const conversation = (
    await db.admin.query(
      `insert into conversations (initiator_user_id, recipient_user_id, status, accepted_at)
       values ($1, $2, 'accepted', now()) returning id`,
      [peer, member],
    )
  ).rows[0].id as string;
  await db.admin.query(
    `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, 'from peer')`,
    [conversation, peer],
  );
  await db.admin.query(
    `insert into notifications (user_id, type, actor_user_id) values ($1, 'reply', $2)`,
    [member, peer],
  );
  const lab = (
    await db.admin.query(
      `insert into labs (name, slug, lead_user_id, visibility, member_list_visibility)
       values ($1, $2, $3, 'private', 'private') returning id`,
      [`Private ${status}`, `gate-${status.replace('_', '-')}`, peer],
    )
  ).rows[0].id as string;
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, 'lead', 'active', now())`,
    [lab, peer],
  );
  await seedMembership(db, lab, member);
  await db.admin.query(
    `insert into lab_updates (lab_id, author_user_id, body) values ($1, $2, 'private update')`,
    [lab, peer],
  );
  const ownListing = (
    await db.admin.query(
      `insert into business_listings (business_name, category_id, owner_user_id, short_description)
       values ('Owned', ${LISTING_CATEGORY}, $1, 'original') returning id`,
      [member],
    )
  ).rows[0].id as string;

  if (status === 'deleted') {
    await db.admin.query(
      `update users set status = 'pending_deletion', deletion_requested_at = now() - interval '31 days' where id = $1`,
      [member],
    );
    await db.withRole('service_role', null, (tx) =>
      tx.query(`select public.anonymise_user($1)`, [member]),
    );
  } else if (status === 'pending_deletion') {
    await db.admin.query(
      `update users set status = 'pending_deletion', deletion_requested_at = now() where id = $1`,
      [member],
    );
  } else if (status !== 'active') {
    await db.admin.query(`update users set status = $2 where id = $1`, [member, status]);
  }
  return { member, conversation, lab, ownListing };
}

beforeAll(async () => {
  db = await createTestDatabase();
  peer = await seedMember(db, 'gate_peer');
  unownedListing = (
    await db.admin.query(
      `insert into business_listings (business_name, category_id) values ('Unowned', ${LISTING_CATEGORY}) returning id`,
    )
  ).rows[0].id as string;
  peerAsk = (
    await db.admin.query(
      `insert into posts (author_user_id, type, body, ask_status)
       values ($1, 'ask', 'fulfilled ask', 'fulfilled') returning id`,
      [peer],
    )
  ).rows[0].id as string;
  await db.admin.query(
    `insert into comments (post_id, author_user_id, body, is_credited_answer) values ($1, $2, 'answer', true)`,
    [peerAsk, peer],
  );
  poll = (
    await db.admin.query(
      `insert into posts (author_user_id, type, body, poll_status) values ($1, 'poll', 'a poll', 'open') returning id`,
      [peer],
    )
  ).rows[0].id as string;
  const option = (
    await db.admin.query(
      `insert into poll_options (post_id, label, position) values ($1, 'yes', 0) returning id`,
      [poll],
    )
  ).rows[0].id as string;
  await db.admin.query(
    `insert into poll_votes (poll_option_id, post_id, voter_user_id) values ($1, $2, $3)`,
    [option, poll, peer],
  );
  const lab = (
    await db.admin.query(
      `insert into labs (name, slug, lead_user_id, visibility) values ('Venture', 'gate-venture', $1, 'members') returning id`,
      [peer],
    )
  ).rows[0].id as string;
  candidate = await seedCandidate(db, lab, peer, { status: 'submitted' });
  await db.admin.query(
    `insert into candidate_votes (candidate_id, voter_user_id, vote) values ($1, $2, 'approve')`,
    [candidate, peer],
  );
  await db.admin.query(
    `insert into interests (candidate_id, user_id, type) values ($1, $2, 'help')`,
    [candidate, peer],
  );

  for (const status of STATUSES) cast[status] = await seedCast(status);
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

const rows = (userId: string, sql: string, params: unknown[] = []) =>
  db.asUser(userId, async (tx) => (await tx.query(sql, params)).rowCount ?? 0);

const scalar = async (userId: string, sql: string, params: unknown[] = []) =>
  db.asUser(userId, async (tx) => (await tx.query(sql, params)).rows[0]?.v);

// ---------------------------------------------------------------------------

describe('current_account_can_use_client_api()', () => {
  it.each([
    ['active', true],
    ['pending_deletion', true],
    ['suspended', false],
    ['deactivated', false],
    ['deleted', false],
  ] as const)('%s → %s', async (status, expected) => {
    expect(
      await scalar(cast[status].member, `select public.current_account_can_use_client_api() as v`),
    ).toBe(expected);
  });

  it('is false for a signed-in identity with no account row', async () => {
    const ghost = '00000000-0000-4000-8000-00000000dead';
    expect(await scalar(ghost, `select public.current_account_can_use_client_api() as v`)).toBe(
      false,
    );
  });
});

describe.each(BLOCKED)('a %s account with a still-valid token', (status) => {
  const c = () => cast[status];

  it('can still read its own users row (the one exemption) — and only its own', async () => {
    expect(await rows(c().member, `select 1 from users where id = $1`, [c().member])).toBe(1);
    expect(await rows(c().member, `select 1 from users where id <> $1`, [c().member])).toBe(0);
  });

  it('cannot change its own account settings', async () => {
    expect(
      await rows(c().member, `update users set preferred_language = 'so' where id = $1`, [
        c().member,
      ]),
    ).toBe(0);
  });

  it('reads no DM conversation, message, inbox preview or unread count', async () => {
    expect(
      await rows(c().member, `select 1 from conversations where id = $1`, [c().conversation]),
    ).toBe(0);
    expect(
      await rows(c().member, `select 1 from messages where conversation_id = $1`, [
        c().conversation,
      ]),
    ).toBe(0);
    expect(await rows(c().member, `select * from public.dm_inbox()`)).toBe(0);
    expect(await scalar(c().member, `select public.dm_unread_count() as v`)).toBe(0);
  });

  it('reads no notification, private Space, member profile, feed or listing', async () => {
    expect(
      await rows(c().member, `select 1 from notifications where user_id = $1`, [c().member]),
    ).toBe(0);
    expect(await rows(c().member, `select 1 from labs where id = $1`, [c().lab])).toBe(0);
    expect(await rows(c().member, `select 1 from lab_updates where lab_id = $1`, [c().lab])).toBe(
      0,
    );
    expect(await rows(c().member, `select 1 from lab_members where lab_id = $1`, [c().lab])).toBe(
      0,
    );
    expect(await rows(c().member, `select 1 from profiles where user_id = $1`, [peer])).toBe(0);
    expect(await rows(c().member, `select 1 from posts where id = $1`, [peerAsk])).toBe(0);
    expect(
      await rows(c().member, `select 1 from business_listings where id = $1`, [c().ownListing]),
    ).toBe(0);
  });

  it('gets nothing from the member-data RPCs', async () => {
    expect(await rows(c().member, `select * from public.poll_results($1)`, [poll])).toBe(0);
    expect(
      await db.asUser(
        c().member,
        async (tx) =>
          (await tx.query(`select * from public.candidate_vote_tally($1)`, [candidate])).rows[0],
      ),
    ).toEqual({ approve: 0, reject: 0, total: 0 });
    expect(
      await db.asUser(
        c().member,
        async (tx) =>
          (await tx.query(`select * from public.candidate_interest_counts($1)`, [candidate]))
            .rows[0],
      ),
    ).toEqual({ help: 0, cosign: 0, invest: 0 });
    expect(
      await scalar(
        c().member,
        `select public.mentor_asks_answered($1, now() - interval '1 day') as v`,
        [peer],
      ),
    ).toBe(0);
  });

  it('makes no lasting write: listing, tag, support, follow, claim, consent', async () => {
    const refuse = (sql: string, params: unknown[]) =>
      expect(db.asUser(c().member, (tx) => tx.query(sql, params))).rejects.toThrow(
        /row-level security|permission denied/,
      );
    await refuse(
      `insert into business_listings (business_name, category_id, owner_user_id) values ('Injected', ${LISTING_CATEGORY}, $1)`,
      [c().member],
    );
    expect(
      await rows(c().member, `update business_listings set short_description = 'x' where id = $1`, [
        c().ownListing,
      ]),
    ).toBe(0);
    await refuse(
      `insert into listing_tags (listing_id, tag_id) values ($1, (select id from tags limit 1))`,
      [c().ownListing],
    );
    await refuse(`insert into post_cosigns (post_id, user_id) values ($1, $2)`, [
      peerAsk,
      c().member,
    ]);
    await refuse(
      `insert into follows (follower_user_id, target_type, target_id) values ($1, 'user', $2)`,
      [c().member, peer],
    );
    await refuse(
      `insert into listing_claims (listing_id, claimant_user_id, evidence) values ($1, $2, 'x')`,
      [unownedListing, c().member],
    );
    await refuse(
      `insert into consent_records (user_id, consent_type, version) values ($1, 'cookies', 'x')`,
      [c().member],
    );
  });
});

describe.each(ALLOWED)('positive control: a %s account keeps member access', (status) => {
  const c = () => cast[status];

  it('reads its DMs, inbox, unread count, notifications, private Space and the directory', async () => {
    expect(
      await rows(c().member, `select 1 from messages where conversation_id = $1`, [
        c().conversation,
      ]),
    ).toBe(1);
    expect(await rows(c().member, `select * from public.dm_inbox()`)).toBe(1);
    expect(await scalar(c().member, `select public.dm_unread_count() as v`)).toBe(1);
    expect(
      await rows(c().member, `select 1 from notifications where user_id = $1`, [c().member]),
    ).toBe(1);
    expect(await rows(c().member, `select 1 from lab_updates where lab_id = $1`, [c().lab])).toBe(
      1,
    );
    expect(await rows(c().member, `select 1 from profiles where user_id = $1`, [peer])).toBe(1);
  });

  it('still gets the member-data RPCs', async () => {
    expect(await rows(c().member, `select * from public.poll_results($1)`, [poll])).toBe(1);
    expect(
      await db.asUser(
        c().member,
        async (tx) =>
          (await tx.query(`select * from public.candidate_vote_tally($1)`, [candidate])).rows[0],
      ),
    ).toEqual({ approve: 1, reject: 0, total: 1 });
    expect(
      await scalar(
        c().member,
        `select public.mentor_asks_answered($1, now() - interval '1 day') as v`,
        [peer],
      ),
    ).toBe(1);
  });

  it('can still write: settings, listing edit, follow', async () => {
    expect(
      await rows(c().member, `update users set low_bandwidth_enabled = true where id = $1`, [
        c().member,
      ]),
    ).toBe(1);
    expect(
      await rows(
        c().member,
        `update business_listings set short_description = 'edited' where id = $1`,
        [c().ownListing],
      ),
    ).toBe(1);
    await expect(
      db.asUser(c().member, (tx) =>
        tx.query(
          `insert into follows (follower_user_id, target_type, target_id) values ($1, 'lab', $2)`,
          [c().member, c().lab],
        ),
      ),
    ).resolves.toBeDefined();
  });
});

describe('roles the gate must not touch', () => {
  it('the service role (server routes, sweeps) still reads and aggregates everything', async () => {
    const res = await db.withRole('service_role', null, async (tx) => ({
      messages: (await tx.query(`select 1 from messages`)).rowCount,
      tally: (await tx.query(`select * from public.candidate_vote_tally($1)`, [candidate])).rows[0],
      counts: (await tx.query(`select * from public.candidate_interest_counts($1)`, [candidate]))
        .rows[0],
      asks: (
        await tx.query(`select public.mentor_asks_answered($1, now() - interval '1 day') as v`, [
          peer,
        ])
      ).rows[0].v,
    }));
    expect(res.messages).toBeGreaterThan(0);
    expect(res.tally).toEqual({ approve: 1, reject: 0, total: 1 });
    expect(res.counts).toEqual({ help: 1, cosign: 0, invest: 0 });
    expect(res.asks).toBe(1);
  });

  it('anon cannot execute the guarded RPCs, so their server-only null-uid branch is unreachable to clients', async () => {
    const res = await db.admin.query(
      `select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any($1)`,
      [GUARDED_RPCS],
    );
    expect(res.rows.map((r) => r.proname).sort()).toEqual([...GUARDED_RPCS].sort());
    expect(res.rows.every((r) => r.anon_exec === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Coverage contracts. A new table, view or SECURITY DEFINER function that the
// signed-in role can reach fails here until it is gated or explicitly exempted.
// ---------------------------------------------------------------------------

/** Tables whose SELECT is deliberately NOT lifecycle-gated (writes still are). */
const SELECT_EXEMPT: Record<string, string> = {
  users:
    "own row only (users_select_own): getAuthContext() reads it to learn a blocked account's status, which the appeal, reactivate, cancel-deletion and sign-in routes need; those routes act through the service role. A deleted account's row is a neutral tombstone.",
};

const GUARDED_RPCS = [
  'candidate_interest_counts',
  'candidate_vote_tally',
  'dm_inbox',
  'dm_unread_count',
  'mentor_asks_answered',
  'poll_results',
];

/** SECURITY DEFINER functions the signed-in role may call WITHOUT the gate, and why. */
const RPC_EXEMPT: Record<string, string> = {
  current_account_can_use_client_api: 'the gate itself — a boolean about the caller',
  author_is_active: 'RLS predicate: a boolean about an author, no rows',
  award_cycle_is_open: 'public calendar fact',
  can_read_candidate:
    "RLS visibility predicate about the caller's reach; gated tables bound its use",
  can_read_lab: "RLS visibility predicate about the caller's reach; gated tables bound its use",
  can_read_lab_roster:
    "RLS visibility predicate about the caller's reach; gated tables bound its use",
  can_read_venture_hours: 'RLS visibility predicate; gated tables bound its use',
  can_read_venture_ledger:
    "RLS visibility predicate about the caller's reach; gated tables bound its use",
  can_review_candidate: "privilege predicate; already requires status = 'active'",
  current_user_role: "the caller's own role, nothing else",
  get_signup_mode: 'public configuration, anon-executable by design',
  has_capability: "privilege predicate; already requires status = 'active'",
  has_entitlement:
    "ordinary paid-entitlement predicate about the caller; admits only the gate's own set (active, pending_deletion)",
  has_password: "the caller's own password-exists boolean; read by the /api/me snapshot",
  is_active_account: "strict status = 'active' predicate; no policy uses it since 20260911000500",
  is_admin: "privilege predicate; already requires status = 'active'",
  is_advisor: "privilege predicate; already requires status = 'active'",
  is_candidate_lab_member: "RLS predicate about the caller's own membership",
  is_feature_enabled: 'public configuration, anon-executable by design',
  is_lab_member: "RLS predicate about the caller's own membership",
  is_mod: "privilege predicate; already requires status = 'active'",
  is_supporter:
    "has_entitlement('supporter_spaces'): admits only the gate's own set (active, pending_deletion)",
  is_venture_lead:
    "RLS predicate about the caller's own Lab lead/core role. NO account-status check (its 'active' is the lab membership): blocked accounts are stopped by the gated venture tables; the grace keeps it (grace-entitlements.test.ts)",
  is_verifier: "privilege predicate; already requires status = 'active'",
  list_visible_tiers: 'public configuration, anon-executable by design',
  verify_work_chain:
    'returns only an integrity verdict (ok, first broken seq), no member data; anon-executable already',
};

describe('coverage contract', () => {
  it('every table the signed-in role can reach carries the restrictive lifecycle gate', async () => {
    const res = await db.admin.query(
      `select c.relname,
              c.relrowsecurity as rls,
              has_table_privilege('authenticated', c.oid, 'INSERT') as can_insert,
              has_table_privilege('authenticated', c.oid, 'DELETE') as can_delete,
              (has_table_privilege('authenticated', c.oid, 'UPDATE')
                or has_any_column_privilege('authenticated', c.oid, 'UPDATE')) as can_update,
              (select json_agg(json_build_object('name', p.polname, 'cmd', p.polcmd,
                        'permissive', p.polpermissive,
                        'roles', (select array_agg(r.rolname) from pg_roles r where r.oid = any(p.polroles)),
                        'qual', pg_get_expr(p.polqual, p.polrelid),
                        'check', pg_get_expr(p.polwithcheck, p.polrelid)))
                 from pg_policy p where p.polrelid = c.oid) as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and (has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
               or has_any_column_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE'))
        order by c.relname`,
    );
    expect(res.rows.length).toBeGreaterThan(100);

    const problems: string[] = [];
    for (const row of res.rows) {
      const gates = ((row.policies ?? []) as Array<Record<string, unknown>>).filter(
        (p) =>
          p.permissive === false &&
          (p.roles as string[]).includes('authenticated') &&
          String(p.qual ?? p.check).includes('current_account_can_use_client_api'),
      );
      if (!row.rls) problems.push(`${row.relname}: RLS disabled`);
      if (row.relname in SELECT_EXEMPT) {
        const needed = [
          row.can_insert ? 'a' : null,
          row.can_update ? 'w' : null,
          row.can_delete ? 'd' : null,
        ].filter(Boolean);
        for (const cmd of needed) {
          if (!gates.some((g) => g.cmd === cmd || g.cmd === '*')) {
            problems.push(`${row.relname}: write command ${cmd} not gated`);
          }
        }
        continue;
      }
      const all = gates.find((g) => g.cmd === '*');
      if (!all) problems.push(`${row.relname}: no restrictive FOR ALL lifecycle gate`);
      else if (!String(all.check).includes('current_account_can_use_client_api')) {
        problems.push(`${row.relname}: gate has no WITH CHECK`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every public view runs with the caller’s rights, so it inherits the table gates', async () => {
    const res = await db.admin.query(
      `select c.relname, coalesce(c.reloptions, '{}') as opts
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('v', 'm')`,
    );
    const unsafe = res.rows.filter((r) => !(r.opts as string[]).includes('security_invoker=true'));
    expect(unsafe.map((r) => r.relname)).toEqual([]);
  });

  it('every RLS-bypassing function the signed-in role can call is gated or exempted with a reason', async () => {
    const res = await db.admin.query(
      `select p.proname,
              pg_get_functiondef(p.oid) ~ 'current_account_can_use_client_api' as gated
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
          and p.prorettype <> 'trigger'::regtype
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')`,
    );
    const unclassified = res.rows
      .filter((r) => !GUARDED_RPCS.includes(r.proname) && !(r.proname in RPC_EXEMPT))
      .map((r) => r.proname);
    expect(unclassified, 'gate these or add a documented exemption').toEqual([]);

    const guardedWithoutGate = res.rows
      .filter((r) => GUARDED_RPCS.includes(r.proname) && !r.gated)
      .map((r) => r.proname);
    expect(guardedWithoutGate).toEqual([]);
  });
});
