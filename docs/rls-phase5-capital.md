# RLS summary — Phase 5 (Capital / Maal)

Migration: `packages/db/supabase/migrations/20260707000000_phase5_capital.sql`
Negative tests: `packages/db/src/phase5-capital.test.ts` (21 tests, all green)

Phase 0 shipped every Capital table with **RLS enabled and zero policies** (the
Phase 1 blanket `enable row level security` loop), i.e. fully locked / default
deny. Phase 5 adds the SELECT policies and keeps **all writes API-only** (service
role, after explicit authz) — no client `insert/update/delete` policy exists on
any Capital table.

Locked scope (§17 + Warya 7 Jul): Capital v1 is a **listing/intro service +
intent capture + manual ops**. NO money movement, NO pledge ledger, NO payout
states, NO tokens. Maalgeli (Invest) = intent capture only, Somalia-region gated
(geo-IP AND profile country AND self-attestation — **all three**, enforced at the
**app layer**; the `capital_gate_evaluations` log here is the compliance audit
trail). Garab/Co-sign + "I can help" are non-financial and **never gated**.

## Visibility predicates (SECURITY DEFINER, empty `search_path`)

| Function | Answers | Notes |
|---|---|---|
| `is_candidate_lab_member(cand)` | caller is an `active` member of the candidate's `lab_id` or `co_lab_id` | drives recusal + draft/reviewers_only read; reuses `is_lab_member()` |
| `can_read_candidate(cand)` | caller may read the Candidate | implements §17 draft / reviewers_only / all_members |
| `can_review_candidate(cand)` | caller is an eligible reviewer | v1.0 = `(is_mod() OR is_admin()) AND NOT is_candidate_lab_member(cand)` |

`can_read_candidate(cand)` is true when **any** of: `is_admin()`; `is_mod()`;
caller is `created_by_user_id`; `is_candidate_lab_member(cand)` (Lab members read
drafts too); **or** `visibility='all_members'` **and** `status <> 'draft'` **and**
the caller is an active user. `reviewers_only` never opens to the community — it
is reachable only through the admin/mod/Lab-member/creator branches. Draft is
never community-visible for the same reason.

All three run as the table owner (bypass RLS internally), so `can_read_candidate`
reading `public.venture_candidates` does **not** recurse through the
`venture_candidates` SELECT policy — same proven pattern as `can_read_lab()` /
`is_admin()`. `auth.uid()` still resolves to the *caller* inside a definer
function (it reads `request.jwt.claims`, which `SECURITY DEFINER` does not
change). `lower(...)` is used for the reused `is_lab_member`/tier comparisons per
the empty-`search_path` citext hazard documented in `phase1_auth.sql`.

> **Phase-6 revisit (flagged):** there is **no dedicated reviewer role**
> pre-Phase-6, so the reviewer set for v1.0 is `is_mod() OR is_admin()` minus
> recusal. Phase 6 may introduce a **verifier** role that replaces
> mod-as-reviewer; `can_review_candidate` is the single seam to change when it
> does. Candidate reporting / a mod queue for Candidates also land in Phase 6
> (open member *comments* on Candidates ARE Phase 5 — §12/§17, not moderation).

## Tallies (SECURITY DEFINER, counts-only — ballot / interest privacy)

`candidate_votes` and `interests` are otherwise **own-row-only**: a member reads
only their own ballot / their own interest (so the UI can render "you voted
approve" + a retract control, and "you offered to help"). Aggregate social proof
comes **exclusively** through two definer functions that never enumerate *who* —
the exact `poll_results()` precedent (Seq 14 anonymous ballots):

| Function | Returns | Readability |
|---|---|---|
| `candidate_vote_tally(cand)` | `(approve int, reject int, total int)` | enforced by the **caller** (see below), not re-checked internally |
| `candidate_interest_counts(cand)` | `(help int, cosign int, invest int)` | enforced by the caller; per-candidate only — fund-level (candidate_id null) intent is tallied server-side |

Both are `revoke all ... from public, anon` then `grant execute to authenticated,
service_role`, matching every other Phase 1–4 helper.

**Readability is enforced by the caller, not inside these functions.** Like
`poll_results()`, both tallies are always invoked through the **service-role**
admin client (ballots/interests are own-row-only, so a plain aggregate would be
blocked), and always **after** the candidate has been loaded under RLS
(route-level `loadCandidateForViewer`, or the RLS candidate fetch in
`lib/capital/views.ts`). An internal `and can_read_candidate(cand)` guard would
be actively wrong here: under the admin client `auth.uid()` is NULL, so that
predicate is FALSE for every candidate and would permanently zero every tally
(vote panel, "142 co-signs", the vote/interests API responses). The guard was
therefore dropped — access control lives at the caller's RLS candidate load.

## Per-table SELECT policies (all `to authenticated`)

| Table | Policy | SELECT `using(...)` | Writes |
|---|---|---|---|
| `venture_candidates` | `venture_candidates_select_readable` | `can_read_candidate(id)` | revoked (service-role only) |
| `candidate_reviews` | `candidate_reviews_select_visible` | `can_read_candidate(candidate_id)` | revoked |
| `candidate_votes` | `candidate_votes_select_own` | `voter_user_id = auth.uid()` | revoked; tally via `candidate_vote_tally()` |
| `interests` | `interests_select_own` | `user_id = auth.uid()` | revoked; counts via `candidate_interest_counts()` |
| `capital_gate_evaluations` | `capital_gate_evaluations_select_own` | `user_id = auth.uid()` | revoked (service-role insert only; **append-only** — no update/delete grant) |

`candidate_reviews` visibility is deliberately kept simple: reviewer notes +
rubric scores are readable **wherever the Candidate is readable** (decline/park
reasons are meant to be visible, §17), rather than a separate reviewer-only
scope. Write authz — `can_review_candidate` + recusal + aggregate recomputation
of `venture_candidates.rubric_*_score` — is an API obligation (service role).

`capital_gate_evaluations` is the **compliance audit log** (Seq 6 / §17). Every
gate evaluation is written server-side with its three inputs
(`profile_country`, `geo_ip_country` — derived country only, never the raw IP —
and `attested`) and the decision (`granted`, `reason`). It is append-only and
persists through anonymisation; no client role can update or delete it.

**Trusted geo header (compliance trust boundary).** `getGeoCountry`
(`lib/capital/region-gate.ts`) reads the request country from **one** header:
`x-vercel-ip-country`. On the Vercel deployment target this header is
set-and-overwritten by the platform edge on every request, so a client cannot
forge it. The former fallbacks (`cf-ipcountry` / `x-country-code` /
`x-geo-country`) were **removed**: they are not platform-guaranteed on Vercel and
are not stripped by the edge, so trusting them let a client attach e.g.
`x-country-code: SO` and satisfy the geo leg of the gate. A request whose only
country signal is a non-authoritative header now resolves to `unknown_geo`
(never granted). If the deployment moves behind a different proxy, trust that
proxy's overwritten header here and strip the untrusted variants in middleware
before any route reads them.

## Extended policies (Capital reaches into two shared tables)

### `comments` — candidate-targeted open member comments (§12)

`comments_select_visible` (last set by Phase 4) is re-created to add a third
branch: a **published** comment with `candidate_id` set is readable exactly when
`can_read_candidate(candidate_id)`. The post-targeted branches are unchanged
(published + parent-post visibility, incl. lab-scoped posts; author/mod always).
Writes stay **API-only** (Phase 2 convention) — the comment endpoint enforces
`can_read_candidate` on insert plus the §26 rate limits + AI pre-scan.

### `page_blocks` — candidate-owned blocks (§17)

`page_blocks_select_visible` (last set by Phase 4.5, which parked
`owner_type='candidate'` as **mod-only**) is re-created to add a candidate
branch mirroring the lab branch: a candidate-owned block is readable when
`can_read_candidate(owner_id)` **and** the block's own `visibility` admits the
caller — `'public'`/`'members'` blocks to any candidate-reader; `'private'`
blocks to the candidate creator (and mods, via the top-level `is_mod()` branch).
The candidate `page_blocks` **UI is still backlog** — this is RLS groundwork
only. Writes remain API-only (revoked for anon/authenticated).

## Test conventions

Same as `phase4-labs.test.ts`: a filtering policy → empty result set
(`toBe(0)` / `toEqual([])`); a revoked write grant → `/permission denied/`.
Capital rows are seeded via `db.admin` (superuser), mirroring the API's
service-role writer, because every Capital write is API-only by design. Coverage:

- draft hidden from non-creator / non-Lab-member / non-admin; visible to
  creator + Lab member + admin;
- `reviewers_only` submitted hidden from ordinary members, visible to Lab
  members + creator + mod + admin; co_lab membership grants read;
- `all_members` submitted visible to any logged-in member, hidden from anon;
  `all_members` **draft** still hidden from the community;
- `can_review_candidate`: unaffiliated mod ✓, a mod who is a Lab member ✗
  (recused), ordinary member ✗, admin-who-leads-the-Lab ✗ (recused but can read);
- votes / interests / gate log own-row-only; tallies + counts via the definer
  functions add up correctly;
- fund-level invest intent (`candidate_id` null) is unique per user;
- `authenticated` cannot INSERT into any of the five Capital tables, nor UPDATE
  a candidate directly;
- candidate comment readability follows `can_read_candidate` (reviewers_only vs
  all_members);
- candidate `page_blocks` follow `can_read_candidate` + block visibility;
- all five helper functions exist.

## Deferred (record, don't build)

- **Phase 6:** candidate reporting / mod queue; a verifier role may replace
  mod-as-reviewer (`can_review_candidate` is the seam).
- **Phase 7:** Capital analytics events (§23) — none emitted in Phase 5.
- **Phase 8:** candidates exposed in the REST/MCP API.
