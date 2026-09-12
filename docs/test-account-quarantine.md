# Test-account quarantine (`users.is_test`)

**Status (12 Sep 2026):** built on `claude/test-account-quarantine`. The
migration is written but **not applied to any database**. Nothing is deployed.

**Why.** The 12 Sep production audit found the test-community seeder's 62 fake
members on the Supabase project labelled "Dev Xidig App"
(`tbdryvhxxiqadseuxclm`), which is the **live production database** for
xidig.net. Their profiles, badges, verification, reputation, award votes, Spaces
and listings read as real community proof. An owner-approved containment
banned them and hid their public Spaces and listings. This slice adds the
durable "not a real member" marker and makes the app honour it.

This slice does **not** make the launch ready, make deletion compliance true,
or remove fake data. It stops fake accounts from being presented as organic
community proof wherever the app reads.

## The marker

- **Column.** `users.is_test boolean not null default false`, from migration
  `20260912050000_test_account_quarantine.sql`. It mirrors `users.is_ai`.
- **Who can set it.** There is no client grant, so only the service role can
  set or clear it. Row visibility is unchanged.
- **Backfill (deterministic).** It never keys on `@example.com` alone. It marks:
  - a source-defined test-community fixture handle (`TEST_PERSONAS` +
    `TEST_AI_HELPERS`) **and** that handle's `@example.com` email **and** at
    least one test-community seed marker (`test-community-v1`, `-v2`,
    `-awards`) present; or
  - the one owner-named verification account `zz_deltest_decoy` on
    `@example.com`.
- **How the backfill is pinned.** A DB test runs the exact backfill statement
  from the migration file. It shows that a real-looking account holding a
  fixture handle, an `@example.com`-only account and other verification-session
  accounts are **not** marked. A web test pins the backfill's handle list to the
  seeder source.
- **What is not marked.** The 121 other `zz_*` verification-session accounts
  and the 4 profile-less ones on production. Marking those is a separate owner
  decision.
- **How the app reads it.** Through `lib/account-flags.ts`, always with the
  service role:
  - `loadAccountFlags` now returns `isTest`;
  - `isTestAccount` and `isOrganicAccount` (live and not a test account;
    unknown ids fail closed);
  - `loadTestAccountIds` and `postgrestIdList` build `not in` filters for
    counts.

**Deploy order.** Apply `20260912050000` **before** deploying app code that
reads `users.is_test`. It is additive and safe with the older app. It sorts
before `20260912100000` and `20260912100100`, which still follow the app
deploy. On production this is explicitly approved production work, and the
migration-method caveat applies: the live ledger's recent entries use
apply-time versions.

## Protected surfaces

In each case a test account's presence, activity or edges no longer count or
appear as organic proof.

| Surface                                 | Behaviour for a test account                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Founding counter (front door, waitlist) | Excluded (`is_ai` **and** `is_test`). The organic guard test requires both.                                                                                                                                                                                                                                                                                 |
| Profile `/u/[handle]`                   | Signed-out and blocked viewers get a 404 (no public projection, brand OG card). Every signed-in viewer, owner included, sees a "Test account" notice instead of a profile: no badges (founding included), verification, counts, modules or controls. Metadata is noindex/nofollow for everyone. The mobile API returns a stripped view with `isTest: true`. |
| Real profiles' trust counts             | Follower and vouch counts, endorsement depth, helper history (Caawimo), mutuals and `asksHelped` exclude test actors. A test account cannot vouch or endorse. The Community Verified threshold counts only real vouchers.                                                                                                                                   |
| Leaderboard                             | Test accounts are excluded before the limit, so 20 real slots are still filled.                                                                                                                                                                                                                                                                             |
| Community Awards                        | Ballot options exclude test users, test-led Spaces and test-authored Wins. Votes for test targets are refused. Publish re-tallies from the ballots, excluding test voters and test targets. The most-helpful evidence ignores asks by test askers. A results card whose winner is a test account says so, with no name, link or counts.                     |
| Candidates / capital                    | A test-created candidate is not publicly projectable (`/c/[id]` 404, brand OG) and is not listed. Help/support counts exclude test accounts. No vote tally or invest count is exposed.                                                                                                                                                                      |
| Support ("N people support this")       | Excludes test cosigners.                                                                                                                                                                                                                                                                                                                                    |
| Maal                                    | The index and chips exclude test-led Spaces (the viewer's own still show). Venture member and contributor counts exclude test members.                                                                                                                                                                                                                      |
| Search                                  | People, posts, listings and Spaces exclude test accounts and their content for every viewer.                                                                                                                                                                                                                                                                |
| Directory, suggested follows            | Test accounts are excluded. An unknown flag is treated as ineligible.                                                                                                                                                                                                                                                                                       |
| Listings                                | Excluded from search and the feed. A test-owned listing is not publicly projectable (`/l/[id]` 404); owner-less listings are unaffected.                                                                                                                                                                                                                    |
| Spaces                                  | Test-led Spaces are not publicly projectable, and are excluded from search, discovery and tab counts. Member counts, facepiles and the members tab leave out test members.                                                                                                                                                                                  |
| Events                                  | Test-hosted events are dropped from every public surface (including the front-door featured event) and from member lists (index, cards, embedded lists).                                                                                                                                                                                                    |
| Digest                                  | Candidates and recipients exclude test accounts.                                                                                                                                                                                                                                                                                                            |
| Sitemap                                 | Unchanged: static pages and reports only, no member pages.                                                                                                                                                                                                                                                                                                  |

## Seeder hardening

- **Target guard.** `lib/seed/target-guard.ts` decides from the **database
  target**, not `NODE_ENV`. It refuses:
  - the production ref, whatever `NODE_ENV` says;
  - an undeterminable or mismatched target (fails closed);
  - any hosted project not on `NON_PRODUCTION_PROJECT_REFS`. That list is empty:
    no rehearsal database is verified, and Staging is paused and unlisted.

  A loopback stack is allowed. Both test-community verbs and the launch-seed
  reset check the target before auth or any client.

- **Marking fixtures.** The seeder marks every fixture account `is_test`. It
  refuses a fixture handle held by a non-fixture account.
- **Password.** The API response and the generated logins file no longer carry
  the shared password.
- **Reset.** It selects fixtures by handle **and** fixture email **and**
  `is_test`, never by `@example.com` alone. Markers are removed by exact label,
  and award cycles only when the awards marker exists.

## Still exposed or gated

- **SQL-side totals still count test accounts:**
  - the founding-member badge trigger (`handle_auth_user_created`);
  - `award_vote_tally`;
  - `recompute_reputation_scores` / `award_reputation`;
  - `candidate_interest_counts` (no longer called by the app);
  - `mentor_asks_answered`.

  The app excludes test accounts where it reads. A real member's score may
  still include credit from test activity.

- **Data is untouched:**
  - fixtures keep their badges, verification statuses, reputation, votes and
    content rows;
  - stored award results rows and the results posts' bodies still carry fixture
    names and fake counts (bodies are withheld on cards, but readable via the
    post API and search indexes);
  - real members' badges or Community Verified status already earned through
    test vouches are not revoked.
- **Member-visible, unlabelled:**
  - test accounts' Plaza posts, comments and reactions;
  - reaction and poll counts;
  - Maal member lists, applications and ledger trails;
  - a test-created candidate's full member view by direct link;
  - DMs and notifications.
- **Test accounts not marked:** the other `@example.com` verification-session
  accounts on production are not marked (owner decision).
- **Gated decisions:**
  - any removal or anonymisation of fixtures (owner and legal approved,
    explicit id list);
  - a verified non-production rehearsal database;
  - applying the migration to production;
  - native Somali review of the new strings (`content.testAccount*`,
    `profile.testAccount*`, provisional).
