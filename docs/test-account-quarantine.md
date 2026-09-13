# Test-account quarantine (`users.is_test`) — production hotfix

**Status (12 Sep 2026):** built on `claude/hotfix-test-account-quarantine`, off
`main @ 5e9774f`. The migration is written but **not applied to any database**.
Nothing is deployed.

This is the minimal port of the quarantine slice from
`claude/integration-plus-retention @ cd947ce` (commits `b5fe717`, `9f3a566`,
`cd947ce`) onto `main`. The migration is byte-identical to the integration
line's. The app changes are re-implemented against `main`'s older code, because
most integration files do not exist on `main`. Integration's
`docs/test-account-quarantine.md` stays the full record for that line; this file
covers only what `main` carries.

**Why.** The 12 Sep production audit found the test-community seeder's 62 fake
members on the Supabase project labelled "Dev Xidig App"
(`tbdryvhxxiqadseuxclm`), which is the **live production database** for
xidig.net. Their profiles, badges, verification, reputation, award votes, Spaces
and listings read as real community proof. An owner-approved containment banned
them and hid their public Spaces and listings. This hotfix adds the durable "not
a real member" marker and makes `main`'s app honour it.

It does **not** make the launch ready, make deletion compliance true, or remove
fake data. It stops fake accounts from being presented as organic community
proof wherever `main`'s app reads.

## The marker

- **Column.** `users.is_test boolean not null default false`, from
  `packages/db/supabase/migrations/20260912050000_test_account_quarantine.sql`.
  It mirrors `users.is_ai`. Its only dependencies are `users`, `profiles` and
  `seed_runs`, all present in `main`'s migration chain.
- **Who can set it.** There is no client grant, so only the service role can set
  or clear it. Row visibility is unchanged.
- **Backfill (deterministic).** It never keys on `@example.com` alone. It marks:
  - one of the 62 test-community fixture handles **and** that handle's
    `@example.com` email **and** at least one test-community seed marker
    (`seed_runs` label `test-community-v1`, `-v2` or `-awards`) present; or
  - the one owner-named verification account `zz_deltest_decoy` on
    `@example.com`.
- **How the backfill is pinned.** `packages/db/src/test-account-quarantine.test.ts`
  runs the exact backfill statement from the migration file on an embedded
  Postgres. A real-looking account holding a fixture handle, an
  `@example.com`-only account and other verification-session accounts are
  **not** marked. The test also pins the handle list to 62 unique entries. The
  seeder source that defines the handles is not on `main`.
- **What is not marked.** The other `zz_*` verification-session accounts and the
  profile-less ones on production. Marking those is a separate owner decision.
- **How the app reads it.** Through `apps/web/src/lib/account-flags.ts`, always
  with the service role. It holds `loadAccountFlags` (`isTest`),
  `isTestAccount`, `loadTestAccountIds` and `postgrestIdList`, with the same
  names and signatures as the integration line's (a superset). Every loader
  **throws** on a lookup error: a proof surface that cannot tell test accounts
  apart must not guess.

## Before pushing this branch (Vercel preview safety)

**Pushing this branch is itself unsafe until the migration is applied.**
Checked read-only on 13 Sep 2026:

- **A push creates a running Preview deployment.**
  - Vercel's GitHub integration deploys every pushed branch head.
  - GitHub's deployment history for the repo shows a `Preview` deployment for
    every recent branch push, all `success`. That includes `cd947ce` (the
    integration/quarantine head) and the earlier `/out` hotfix branch
    (`5e9774f`).
  - The root `vercel.json` has no `git.deploymentEnabled` or `ignoreCommand`.
- **Previews almost certainly use the live database.** The Preview environment's
  variables are only visible in the Vercel dashboard, so this is not verified
  from the repo. But:
  - the project labelled "Dev Xidig App" is the only active Supabase project
    (Staging is paused);
  - previews build and serve;
  - `docs/GO-LIVE.md` step 5 put the env vars on Production "and Preview if you
    want preview deploys to boot".

  Treat every preview as running against production.

- **So a push before the migration runs `users.is_test` code against a
  database without the column.**
  - Every quarantine read fails: those pages and APIs error for anyone viewing
    the preview.
  - The new code performs no writes.
  - Previews are behind Vercel Authentication (an anonymous request gets a 302
    to `vercel.com/sso-api`), so only logged-in Vercel team members can reach
    it.
  - Vercel crons call only the production deployment, and the two hourly
    external jobs target `https://xidig.net` only, so no scheduled work runs on
    a preview.
  - Nothing prerendered at build reads the database (only `/robots.txt` and
    `/sitemap.xml` are static).
  - It still breaks the migration-first rule, so don't push first.
- **There is no per-push skip marker.** Vercel documents no commit-message skip.
  The documented mechanisms are all persistent configuration and owner
  decisions:
  - a dashboard Ignored Build Step;
  - `ignoreCommand` in `vercel.json`;
  - `git.deploymentEnabled` in `vercel.json`, per branch.

  None is configured here, and none has been tested on this repo.

- **Safe paths to review or push:**
  - apply the migration first (owner-approved), then push. A preview is then
    harmless;
  - review the patch or bundle handoff offline;
  - the owner configures an Ignored Build Step for this branch before pushing.
- **Existing exposure of the same kind:** the already-pushed integration head
  `cd947ce` reads `users.is_test`, and its Preview has been live since 12 Sep
  21:14 UTC. If Preview uses production, that preview is already running
  migration-dependent code against it (behind Vercel Authentication, read-only
  failures). Whether to remove or ignore it is an owner decision.

## Deploy order (production)

**`20260912050000` must precede ANY runtime of this code against production.**
That means the production deploy **and** any Vercel Preview: see above.

1. **Before applying:** run the read-only pre-check (below) against production.
   - It confirms a test-community `seed_runs` marker exists.
   - It shows exactly which accounts the backfill would mark: the expected
     count is 63.
   - Without a marker, only `zz_deltest_decoy` is marked, and the fixtures need
     an owner-approved explicit id list instead.
2. **Apply `20260912050000` before deploying this app code.**
   - The migration is additive and safe with the currently deployed app, which
     ignores the column.
   - The new app code selects `users.is_test`. Without the column those reads
     fail closed, which is a real outage, not a silent fallback. These error
     instead of showing fixtures:
     - pages: `/u/[handle]` (page, metadata and OG), `/profile`, `/search`,
       `/leaderboard`, `/awards`, `/capital`, `/c/[id]`, `/labs/[slug]`,
       `/l/[id]` and the public events pages;
     - member lists: Discover (`/api/labs`), the Suuq directory and map
       (`/api/profiles`, `/api/listings`), @mention autocomplete (it uses
       `/api/profiles`);
     - APIs: `GET /api/profiles/[handle]`, `GET /api/candidates`, the awards
       vote, `GET /api/external/listings`, `GET /api/external/digest/candidates`;
     - the digest cron;
     - the front-door counter (it degrades to no counter).

     "Labs seeking you" (member Home, suggested follows,
     `GET /api/me/looking-for`) is the one exception: it degrades to no
     suggestions and never fails its page.
3. **Deploy the app.**

**Caveats:**

- Applying any migration to the project labelled "Dev Xidig App" **is
  production work**, and needs explicit owner approval.
- **Migration method.** The live ledger's recent entries (from
  `20260901000000` on) were recorded under apply-time versions, so
  `supabase db push` does not line up with the repo directory. Confirm the
  method first: the same method as those entries, or a reconciled ledger.
- This hotfix carries **no** other migration. In particular, the Plus
  migrations `20260912100000` / `20260912100100` are not part of it.
- **Digest deadline: Monday 14 Sep 2026, 08:00 UTC.** The weekly digest cron
  runs Mondays at 08:00 UTC (root `vercel.json`, production deployment only).
  Until migration and app are both live in production, the deployed app still
  selects fixture accounts as digest recipients and candidates.

Read-only pre-check (a `SELECT` version of the backfill; changes nothing):

```sql
select exists (select 1 from public.seed_runs
                where label in ('test-community-v1','test-community-v2','test-community-awards'))
         as has_test_community_marker;

select p.handle, u.email
  from public.users u
  join public.profiles p on p.user_id = u.id
 where u.email::text ilike '%@example.com'
   and (
         (exists (select 1 from public.seed_runs s
                   where s.label in ('test-community-v1','test-community-v2','test-community-awards'))
          and lower(p.handle::text) in (/* the 62 handles from the migration file */))
      or lower(p.handle::text) = 'zz_deltest_decoy'
   )
 order by p.handle;
```

## Protected surfaces on `main`

In each case a test account's presence, activity or edges no longer count or
appear as organic proof.

| Surface                                                                        | Behaviour for a test account                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Founding counter (front door, `/waitlist`)                                     | Excluded (`is_ai` **and** `is_test`). The organic guard test requires both.                                                                                                                                                                                                                                          |
| Profile `/u/[handle]` and its OG image                                         | Signed-out and blocked viewers get a 404, and the OG image falls back to the brand card. Every signed-in viewer, owner included, sees a "Test account" notice instead of a profile: no badges (founding included), verification, counts, reputation, contact or controls. Metadata is noindex/nofollow for everyone. |
| Own profile `/profile`                                                         | The same notice, with no completion meter or edit/share actions.                                                                                                                                                                                                                                                     |
| `GET /api/profiles/[handle]`                                                   | Returns the stripped identity-only view with `isTest: true`.                                                                                                                                                                                                                                                         |
| Real profiles' counts                                                          | Follower and vouch counts leave out edges from test accounts.                                                                                                                                                                                                                                                        |
| Leaderboard                                                                    | Excluded in the query, before the limit, so 20 real slots still fill.                                                                                                                                                                                                                                                |
| Community Awards                                                               | Ballot options exclude test-led Spaces, test-written Wins and test members (in the query, before the limit). Votes for any of them are refused (`invalid_request`). `main` has no award publish or results-card path.                                                                                                |
| Candidates                                                                     | A test-created candidate is not publicly projectable (`/c/[id]` 404, brand OG, no metadata) and is not listed (`/capital`, `GET /api/candidates`).                                                                                                                                                                   |
| Search                                                                         | People, listings, Spaces and posts exclude test accounts and their content, for every caller.                                                                                                                                                                                                                        |
| Directory (`GET /api/profiles`)                                                | Excluded in the query.                                                                                                                                                                                                                                                                                               |
| Suggested follows                                                              | Test accounts are never suggested. An unknown flag is treated as a test account.                                                                                                                                                                                                                                     |
| "Labs seeking you" (member Home, `GET /api/me/looking-for`, suggested follows) | A Space led by a test account is never suggested.                                                                                                                                                                                                                                                                    |
| Spaces                                                                         | Discover (`GET /api/labs`) excludes test-led Spaces. The public Space page and its OG image 404 for a test-led Space. Member counts (Discover cards, the public page) leave out test members.                                                                                                                        |
| Listings                                                                       | Excluded from search, the member feed and map (`GET /api/listings`) and the API-key read (`GET /api/external/listings`). A test-owned listing is not publicly projectable (`/l/[id]` 404, brand OG). Owner-less listings are unaffected.                                                                             |
| Events                                                                         | Every signed-out surface (public list, public event page, embedded public lists, the front-door featured event) drops test-hosted events. The host lookup now throws on error instead of failing open.                                                                                                               |
| Digest                                                                         | Recipients exclude test accounts. Candidates exclude test-authored Wins/Asks, test-led Spaces, test-owned listings and test-hosted events. This covers the pinned post, the email and `GET /api/external/digest/candidates`.                                                                                         |

## Seeder hardening on `main`

`main` never carried the test-community seeder. That seeder, which put the
fixtures on production, lives only on the integration line. `main`'s only seed
write path is the launch-density seed (`/api/admin/seed`).

- **Target guard.** `lib/seed/target-guard.ts` and `lib/seed/target-response.ts`
  are byte-identical to the integration line's. The guard decides from the
  **database target**, not `NODE_ENV`. `DELETE /api/admin/seed` (the
  destructive reset) returns 403 for:
  - the production project ref, whatever `NODE_ENV` says;
  - an undeterminable target or a mismatch between the service and public
    URLs (fails closed);
  - any hosted project not on the reviewed non-production allowlist (empty
    today; the paused Staging project is not listed).

  A loopback stack is allowed. `NODE_ENV=production` is still refused too. The
  labelled launch-density seed itself (`POST`) is unchanged: it may run
  against production only as explicitly approved production work.

- **Reset selection.** `main`'s reset deletes only the rows registered under the
  launch-density `seed_runs` label (`seed_entities`) and the demo playbooks. It
  never selects accounts, and never by email domain.
- **Password.** No shared test password exists anywhere in `main`'s tree. A local
  `TEST-COMMUNITY-LOGINS.md` (generated by the integration line's seeder) is now
  git-ignored here too, so a checkout of `main` cannot sweep it into history.

## Still exposed or gated

- **SQL-side totals still count test accounts:**
  - the founding-member badge trigger;
  - `award_vote_tally`;
  - `candidate_interest_counts`;
  - `recompute_reputation_scores` / `award_reputation`;
  - `mentor_asks_answered`.

  The app excludes test accounts where it reads the lists above, but a real
  member's reputation may still include credit from test activity. Candidate
  help/support/invest counts are still the RPC's (fixture co-signs sit on the
  fixture candidate, which is no longer projected or listed).

- **App-side counts not ported to `main`:**
  - the Community Verified threshold in `POST /api/vouches` still counts
    vouches from test accounts (the displayed vouch count does not). It only
    matters if fixtures vouched for real members, and the seeded vouches were
    fixture-to-fixture. Test accounts are auth-banned, so they cannot vouch now;
  - aggregate RSVP counts on events still count test accounts' RSVPs.
- **People search** filters test accounts after its bounded fetch, so a fixture
  could take a slot in the fetch window. The containment's directory opt-out
  already excludes the fixtures in the query today.
- **Launch seed `POST /api/admin/seed`** has no production guard, by design (as
  on the integration line). It writes labelled platform content, and running it
  against production is explicitly approved production work. Only the
  destructive reset is target-guarded.

- **Data is untouched:**
  - fixtures keep their badges, verification statuses, reputation, votes and
    content rows;
  - the seeded, pinned "Community Awards — Q2 winners" Plaza post (authored by
    the real `xidig_ai` account, naming fixture winners in its body) is still
    pinned and member-visible, because the code cannot tell its prose apart;
  - the seeder-opened Q3 award cycle still holds fixture ballots. Any manual
    tally must exclude `is_test` voters and targets;
  - an owner-less seeded listing cannot be caught by `is_test`.

  Each of these needs an owner-approved data action, not code.

- **Member-visible, unlabelled:**
  - test accounts' Plaza posts, comments and reactions, and reaction and poll
    counts;
  - a Space's Members tab roster;
  - member event lists (fixture events are members-only and already past);
  - a test-created candidate's member view by direct link;
  - DMs and notifications.
- **Test accounts not marked:** the other `@example.com` verification-session
  accounts on production. They are still digest recipients if their settings
  allow, which is an owner decision.
- **Outside the app:** OG cards already cached by third parties.
- **Gated decisions:**
  - applying the migration to production, and its method;
  - any removal or anonymisation of fixtures (owner and legal approved,
    explicit id list);
  - a verified non-production rehearsal database;
  - native Somali review of the new strings (`content.testAccount*`,
    `profile.testAccount*`, provisional).
