# RLS summary — Phase 4 (Labs as unified Spaces)

Migration: `packages/db/supabase/migrations/20260706200000_phase4_labs.sql`
Negative tests: `packages/db/src/phase4-labs.test.ts` (14 tests, all green)

Phase 0 shipped every lab table with **RLS enabled and zero policies** (the
Phase 1 blanket `enable row level security` loop), i.e. fully locked / default
deny. Phase 4 adds the SELECT policies and keeps **all writes API-only** (service
role, after explicit authz) — no client `insert/update/delete` policy exists on
any lab table.

## Visibility predicates (SECURITY DEFINER, empty `search_path`)

| Function | Answers | Notes |
|---|---|---|
| `is_supporter()` | caller is on a paid tier (`membership_tier_id <> 'free'`) | gates `is_supporter_only` Spaces |
| `is_lab_member(lab)` | caller is an `active` member of `lab` | Private read + engagement gates |
| `can_read_lab(lab)` | caller may read the Space | implements §16 Private/Members/Public |
| `can_read_lab_roster(lab)` | caller may read the member list | applies `member_list_visibility` |

`can_read_lab(lab)` is true when **any** of: caller is the `lead_user_id`; `is_mod()`;
`is_lab_member`; `visibility='public'`; or `visibility='members'` **and** caller is an
active user **and** (`is_supporter_only=false` or `is_supporter()`).

All four run as the table owner (bypass RLS internally), so `can_read_lab`
reading `public.labs` does **not** recurse through the `labs` SELECT policy —
same proven pattern as `is_admin()` / `dm_unread_count()`. `auth.uid()` still
resolves to the *caller* inside a definer function (it reads
`request.jwt.claims`, which `SECURITY DEFINER` does not change).

## Per-table SELECT policies (all `to authenticated`)

| Table | SELECT `using(...)` | Writes |
|---|---|---|
| `labs` | `can_read_lab(id)` | revoked |
| `lab_members` | `can_read_lab_roster(lab_id)` | revoked |
| `lab_tags` | `can_read_lab(lab_id)` | revoked |
| `lab_updates` | `can_read_lab(lab_id) AND (published OR author OR is_mod())` | revoked |
| `lab_artifacts` | `can_read_lab(lab_id) AND (published OR added_by OR is_mod())` | revoked |
| `lab_decisions` | `can_read_lab(lab_id) AND (published OR created_by OR is_mod())` | revoked |
| `lab_events` | `can_read_lab(lab_id)` | revoked |
| `lab_skill_needs` | `can_read_lab(lab_id)` | revoked |
| `lab_collaborations` | `can_read_lab(lab_a_id) OR can_read_lab(lab_b_id)` | revoked |
| `profile_pinned_labs` | `user_id = auth.uid() OR can_read_lab(lab_id)` | revoked |
| `lab_playbooks` | `is_active` | revoked |

`anon` keeps only its default `SELECT` grant, matches no policy (all are
`to authenticated`), and therefore reads **nothing** through RLS. Public Spaces
reach anonymous visitors exclusively through the server-side public projection
(`getPublicSpaceView`, service role, narrow columns) — the SEO / build-in-public
path — never through an anon RLS policy.

## Relaxed Phase-2 guards (lab-scoped Plaza surface)

Phase 2 parked `posts/comments/post_tags/poll_options/poll_votes/reactions`
behind `lab_id is null` "until Labs ship their own policy." Phase 4 replaces
that with `(lab_id is null OR is_lab_member(lab_id))`: the lab_id-scoped Plaza
surface is the Space's **internal discussion**, visible to active Space members
only (plus author/mod). A public Space's outward build-log lives in
`lab_updates/lab_artifacts/lab_decisions` (gated by `can_read_lab`), so a
non-member never sees a Space's internal posts — preserving the Phase-2
guarantee while unlocking the surface for members.

## Non-RLS mechanisms in this migration

- `touch_lab_last_activity()` trigger on `lab_updates/lab_artifacts/lab_decisions`
  and lab-scoped `posts`: bumps `labs.last_activity_at` and **clears
  `dormant_since`** (instant revive, §16).
- `mark_dormant_labs()` (service_role): sets `dormant_since` + writes a
  `marked_dormant` event for Spaces idle 28 days. **Never** changes
  `space_mode`, `stage`, `visibility`, or membership — there is no demotion
  path (proved by a test).
- `flag_skill_gaps()` (service_role): stamps `alerted_at` on skill needs open +
  un-alerted for 7 days and returns `(lab_id, skill)` for the cron fan-out.

## Denial idioms proven by the negative tests

- Policy filters a row → empty result set (`toEqual([])`) — private Space to a
  stranger; hidden update to a non-author member; private roster; internal post
  to a non-member; anon reading any lab.
- Revoked write grant → `permission denied` — direct `insert`/`update` on
  `labs`, `lab_updates`, `lab_events` by the lead/member.
- No-demotion invariant → `space_mode/stage/visibility` unchanged after
  `mark_dormant_labs()`.
