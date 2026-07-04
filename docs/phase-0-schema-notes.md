# Phase 0 — Schema notes

Companion to [`packages/db/supabase/migrations/20260704000000_schema.sql`](../packages/db/supabase/migrations/20260704000000_schema.sql).
Per the PRD, Phase 0 is the only phase whose output is manually reviewed and
edited before continuing — the items below are what needs human eyes.

## Validation performed

The migration is checked by an automated harness (`embedded-postgres`, a real
Postgres 17 with a Supabase `auth.users` stub) on every change:

- Migration applies cleanly; **53 tables** created.
- Recursive `pg_constraint` scan: **zero circular FK dependencies** (including
  the two ALTER-added deferred FKs and no self-referencing cycles).
- Phase 0 acceptance criteria machine-checked: `profiles.membership_tier_id`
  (citext FK → seeded `membership_tiers` free/supporter — see the membership
  section for the deliberate enum→lookup deviation),
  `profiles.subscription_status` (TEXT), `profiles.region_verified` (BOOLEAN),
  `labs.visibility` (ENUM private/members/public), `labs.sprint_deadline`
  (TIMESTAMPTZ), `labs.space_mode` (ENUM club/lab), `users.email`/`users.phone`
  (nullable, ≥1 required via CHECK).
- Membership design proven by tests: new tier via one INSERT works end-to-end,
  unknown tier rejected by FK, slug matches case-insensitively (citext), no
  `membership_tier` enum type exists.
- Smoke inserts across the core FK chain (auth.users → users → profiles →
  labs → venture_candidates → posts → comments) succeed.
- 10 constraint-behavior tests pass (business-verification-needs-listing,
  candidate comments, credited-answer-only-on-posts, poll-option-only-on-poll,
  fund-vs-candidate interest, deleted-account contact scrubbing, lowercase
  handle enforcement, poll-vote recast).

## Multi-agent review

The schema was put through an 8-reviewer PRD-alignment sweep (identity, Plaza,
Labs, Capital, social/DMs, moderation, structural, acceptance) with a
merge/dedup pass, producing 24 findings. Each was adjudicated against the PRD;
**19 were applied** (see below), 2 downgraded to documentation (milestones,
cross-post integrity), and the rest folded into ambiguities. Fixes applied from
the review:

- **Anonymise-not-delete made airtight** (§19): `users.id` is now `NO ACTION`
  on the `auth.users` FK (an auth user can't be hard-deleted while its app row
  exists), `conversations` participant FKs and `audit_logs.actor_user_id` no
  longer cascade/null-out, and the contact-method CHECK exempts `status =
  'deleted'` so PII can actually be scrubbed on anonymisation.
- **Business verification targets a listing** (`verifications.listing_id` +
  CHECK) — Verified Business is a listing-level credential (§14).
- **Open member comments on Candidates** (§12): `comments` now targets a post
  *or* a candidate (exactly one), credited-answer guarded to posts.
- **Web Push storage** (`push_subscriptions`) — required by Phase 3 push AC.
- **`entity_type` extended** (appeal, mod_action, listing_claim, …) so every
  mod/admin action is typable in the audit log.
- **Stale-Ask nudge marker** (`posts.ask_nudged_at`); **poll close**
  (`poll_status` + `poll_closes_at`); **funded milestone**
  (`venture_candidates.funded_at`); **fund-first invest intent**
  (`interests.candidate_id` nullable for `invest`).
- **Moderatable Lab content** (`status` on lab_updates/artifacts/decisions).
- **citext lowercase CHECKs fixed** (cast to text) for handle/slug/tag.
- **API key expiry** (`api_keys.expires_at`) + **webhook registration**
  (`webhook_endpoints`) for the Phase 8 API layer.
- **Poll integrity**: options can only attach to poll-type posts (composite FK
  via `posts (id, type)`); **badge re-award** after revocation (partial unique).

## §6 entity → table mapping

| PRD entity | Table(s) |
| --- | --- |
| User | `users` (1:1 shadow of Supabase `auth.users`; passwords live only there) |
| Profile | `profiles` |
| Verification | `verifications` (identity + business call pipeline) |
| Post | `posts` (+ `poll_options`, `poll_votes`, `reactions`; `lab_id` scopes a post to a Space) |
| Comment | `comments` (targets a post *or* a candidate) |
| Tag | `tags` (+ `post_tags`, `lab_tags`, `listing_tags` junctions) |
| Lab | `labs` — unified Space (club ⇄ lab via `space_mode`, §16) (+ `lab_members`, `lab_playbooks`, `lab_collaborations`, `lab_events`, `lab_skill_needs`) |
| Lab Update | `lab_updates` |
| Lab Artifact | `lab_artifacts` (links only, per §3) |
| Decision | `lab_decisions` |
| Venture Candidate | `venture_candidates` (+ `candidate_reviews`, `candidate_votes`) |
| Interest | `interests` (`help` / `cosign` (Garab) / `invest` (Maalgeli intent)) |
| Business Listing | `business_listings` (+ `listing_categories`, `listing_claims`) |
| Follow | `follows` (polymorphic: user / lab / candidate / tag) |
| Conversation + Message | `conversations`, `messages` |
| Badge | `badge_definitions` (lookup) + `user_badges` (awards) |
| Reputation Score | `reputation_scores` (materialized) + `reputation_events` (append-only ledger for caps/decay) |
| Vouch | `vouches` |
| Notification | `notifications` |
| Report / Mod Action / Audit Log | `reports`, `mod_actions` (+ `appeals`), `audit_logs` |
| Invite | `invites` (+ `waitlist_entries`) |

Supporting tables beyond §6 (each required by a v1.0 feature):
`membership_tiers` + `tier_capabilities` (§25/§26 membership model),
`consent_records` (§12 ToS/Privacy/cookie/analytics consent),
`capital_gate_evaluations` (Seq 6 region-gate compliance log),
`skill_endorsements` (§14), `user_blocks` (§13), `profile_pinned_labs` (§20),
`governance_log_entries` (§19), `api_keys` + `webhook_endpoints` (§21/Phase 8),
`push_subscriptions` (§22/§26 push), `award_votes` (§20 quarterly Community
Awards).

## Membership tiers: slug-keyed lookup (zero-migration)

**Decided 4 Jul (supersedes the earlier enum design).** `membership_tiers` has
a **citext slug PK** (`'free'`, `'supporter'`) with name/price/position as data
and `is_active` for retiring a tier without deleting it;
`profiles.membership_tier_id` is a plain FK (default `'free'`). Launching a new
tier (§25's member-owned pricing review, future Builder/Investor packaging) is
**one INSERT — zero migration**, proven by the validation harness (inserts a
`'builder'` tier and assigns it to a profile in the same transaction).

Gated actions are normalised into `tier_capabilities` (enum
`membership_capability`: `create_lab`, `vote_candidate`, `governance_rights`,
`builder_path`, `investor_path`, …) so RLS gates via a single join instead of
hard-coding `tier = 'supporter'` in every policy — a new tier inherits
enforcement by picking capability rows. Capabilities stay an enum deliberately:
a new *capability* requires new enforcement code anyway, unlike a new tier.
Free members have zero capability rows; Supporter holds the unlocks.

**Acceptance-criterion note:** lookup tiers were already the locked decision
(Build Tracker Seq 3; §12 "ENUM vs lookup tables"). The Phase 0 prompt block
was contradicting it. Fixed at the source — the §10 add-list (§11 line 170) and
the Phase 0 acceptance criterion now name `membership_tiers` /
`membership_tier_id`, because the §11 Phase 0 block is what gets pasted into the
build session. A §12 decisions-log row is *not* the guard here: §12 is on the
PRD's "never paste" list, so it never reaches a build session — the fix has to
live in the pasted Phase 0 block, which it now does.

**Forward obligations this design creates (for rls.sql, Phase 1+):**

- **Capability gate = one `security definer` helper, not a broad table grant.**
  Because gates resolve via a join to `membership_tiers`/`tier_capabilities`,
  those tables would otherwise have to be world-readable or every Supporter gate
  fails closed. The chosen approach (validated against Postgres, including two
  hardening passes — see below) keeps both tables locked (RLS on, no read
  policy — never world-readable) and routes every check through:

  ```sql
  -- Phase 1 rls.sql (recommended; NOT in the Phase 0 migration):
  create function public.has_capability(cap membership_capability)
  returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
      select 1 from public.profiles p
      join public.tier_capabilities tc on tc.tier_id = p.membership_tier_id
      where p.user_id = auth.uid() and tc.capability = cap);
      -- deliberately NOT filtered on is_active — see grandfathering note below
  $$;
  revoke all on function public.has_capability(membership_capability) from public;
  grant execute on function public.has_capability(membership_capability) to authenticated;
  alter table membership_tiers  enable row level security;  -- no read policy
  alter table tier_capabilities enable row level security;  -- no read policy
  ```

  Policies gate on the **capability**: `with check (has_capability('create_lab'))`
  — never `tier = 'supporter'`, never a passed-in `uid`.

  Two hardening details, caught in review and now validated:
  - **No `uid` parameter — `auth.uid()` resolved internally.** A `security
    definer` function that accepted an arbitrary `uid` would let any
    authenticated caller ask "does *this other user* have `can_access_capital`?"
    and binary-search a stranger's membership tier. The helper only ever
    answers for the caller.
  - **`search_path = ''`, not `= public`.** Empty search_path (with every
    object schema-qualified, e.g. `public.profiles`) excludes even `pg_temp`,
    which `= public` does not — the stronger of the two hijack defenses.
  - Both `tier_capabilities (tier_id, capability)` (the PK) and
    `profiles.membership_tier_id` (already indexed) support the join, since
    `STABLE` functions used in row-level read policies get evaluated per row.

- **Grandfathering asymmetry (Seq 3 requires it) — same join, opposite
  `is_active` treatment, easy to get wrong by copy-paste:**
  - `has_capability()` must **not** filter `is_active` — a member left on a
    retired tier keeps that tier's capabilities until actively migrated.
    Filtering here would silently revoke grandfathered access.
  - The **public catalog** must filter `is_active = true` — retired tiers never
    appear on the pricing/upgrade page. Modeled as a second `security definer`
    function, `list_visible_tiers()`, rather than a plain view or broad grant:
    it projects only pricing-page-safe columns (slug, name, public price,
    capability list) so a future column addition (e.g. an internal
    Paddle/Lemon-Squeezy plan ID) can't leak through a `select *`. (A plain view
    would work too — Postgres views default to running as their owner, which
    also bypasses the base tables' RLS — but a function makes the "only safe
    columns" projection explicit and enforced, not just conventional.)

- **Negative tests, validated against Postgres:** supporter passes
  `create_lab`; free member is denied; granting `create_lab` to the `free` tier
  flips the *same* free member to allowed with no code/tier-name change (the
  drift guard the whole refactor exists for); **removing** `create_lab` from
  `supporter` denies the same supporter (revocation, not just grant); a member
  on a **retired** tier still resolves capabilities via `has_capability()` while
  `list_visible_tiers()` hides that tier from the catalog (locks in the
  grandfathering split above); the `authenticated` role reads zero rows from
  either table directly while both functions still answer correctly; and the
  function signature is confirmed to take only `(cap)` — no `uid` — closing the
  cross-user probing vector.
- Audit rows for tier management (runtime data ops now, not migrations) use the
  convention `target_type = 'membership_tier'`, `target_id = NULL`,
  `metadata->>'tier_id' = slug` — polymorphic `target_id` columns are uuid and
  cannot point at a slug PK (comment also lives next to `audit_logs`).
- **Poll ballots are anonymous** (Seq 14): `poll_votes.voter_user_id` is stored
  for one-vote enforcement and vote-change, but RLS/API must expose **counts
  only** — never who voted for what.
- **Anonymise routine must revoke secrets** (`api_keys.revoked_at`,
  `webhook_endpoints.is_active = false`) — see the ON DELETE note below.

## Deliberate design decisions

- **No circular FKs, by construction.** The two classic cycles were designed
  out: (1) invite↔user — both FKs (`created_by`, `redeemed_by`) live on
  `invites`, so `users` never references `invites`; (2) Ask "credited answer" —
  a `comments.is_credited_answer` flag (with a partial unique index enforcing
  one per post) instead of `posts.credited_comment_id`; (3) `conversations`
  carries no `last_message_id`. The two forward references that would otherwise
  force a bad table order (`verifications.listing_id` → business_listings,
  `comments.candidate_id` → venture_candidates) are added as deferred
  `ALTER TABLE … ADD CONSTRAINT` after their targets exist — still acyclic
  (verified by the automated scan).
- **Conversations are two columns** (`initiator_user_id`, `recipient_user_id`)
  instead of §10's `participantIds[]`: DMs are strictly 1:1 in v1.0 ("no group
  DMs", §13), and this makes pair-uniqueness (`LEAST/GREATEST` expression
  index) and request-to-chat enforceable in the database.
- **ON DELETE policy enforces §19 "anonymise, not delete" at the DB boundary.**
  `users.id` references `auth.users` with `NO ACTION` (not CASCADE): an auth
  user cannot be hard-deleted while its `public.users` row exists, so account
  deletion is an in-place anonymisation (scrub `email`/`phone` + profile PII),
  never a cascade wipe. Records that must survive a counterparty's
  anonymisation — `conversations` (DM history for the other party),
  `audit_logs.actor_user_id`, `api_keys.owner_user_id` — use `NO ACTION` too.
  The contact-method CHECK exempts `status = 'deleted'` so PII *can* be
  scrubbed. Truly ephemeral personal rows (follows, reactions, blocks,
  poll_votes, memberships…) keep CASCADE, which is moot under the never-delete
  policy but harmless. **Two app-layer obligations this creates:** (1) the
  anonymise routine MUST set `api_keys.revoked_at` (and deactivate
  `webhook_endpoints`) for the account — `NO ACTION` only blocks deletion, so
  live secrets would otherwise persist on a "deleted" account (a security hole);
  (2) ops must delete accounts through the app-level anonymise routine, **not**
  Supabase's native "delete user" — the latter now fails with an FK violation
  while app rows exist (intended, but it must be documented in the runbook).
- **Seed reference data is included** (membership tiers + capabilities, listing
  categories, seed tags, badge definitions — all `ON CONFLICT DO NOTHING`):
  these are approved constants in §26 that lookup-table FKs need at Phase 1,
  not Phase 8 content seeding.
- **`snake_case` naming** throughout; PRD camelCase fields map 1:1 and come
  back via Supabase type generation.

## Enum vs lookup — the applied rule

**ENUM** for closed, code-driven state machines (workflow states the app ships
logic for): roles, account/membership status, post/ask/candidate/report
states, visibility, space mode, reaction taxonomy, interest types, etc.
**Lookup table** for member/admin-extensible taxonomies: `tags` (member
suggested, §18), `listing_categories` (admin curated + member suggested, §18),
`badge_definitions` (admin "badge management", §26 — new badges must not need
a migration), `membership_tiers` (slug PK — new tier is one INSERT, decided
4 Jul). **TEXT** for externally-controlled or release-fluid vocabularies:
`profiles.subscription_status` (raw Paddle/Lemon Squeezy value, per Phase 0
instruction), `notifications.type`, `reputation_events.event_type`,
`lab_events.event_type`, `audit_logs.action` (app constants; new kinds every
release must not need a migration).

## Recommended indexes (rationale for the non-obvious ones)

- `posts_feed_idx` / `posts_type_feed_idx` — partial on `status='published'`:
  chronological feed + post-type filters (§15).
- `posts_open_asks_idx` — partial `(type='ask' AND ask_status='open')`: the
  7-day stale-Ask nudge job (§15).
- `labs_activity_idx` — partial on non-dormant: the 28-day dormancy sweep.
- `listings_map_idx` `(latitude, longitude)` partial on published+located: map
  bounding-box queries. Plain btree is adequate at v1.0 scale; move to PostGIS
  if distance sorting becomes hot (see ambiguities).
- `lab_skill_needs_matching_idx` — partial on unfilled: "looking for" ↔ profile
  skills matching + 7-day gap alerts (§16).
- `notifications_unread_idx` — partial on unread: badge counts.
- `conversations_recipient_requests_idx` — partial on pending: DM request inbox.
- `reputation_events (user_id, created_at desc)` — daily caps + 90-day decay
  computation (§12).
- Full-text/fuzzy search is **deliberately not in Postgres** — Meilisearch is
  the search layer (§24; docker-compose already ships it), so no `pg_trgm`.
- FKs on cold audit-style columns (`*_by_user_id` on appeals, claims, playbooks,
  etc.) are deliberately left unindexed — users are never hard-deleted
  (anonymise policy), and those columns aren't query entry points. Revisit if
  admin views need them.

## Ambiguities / assumptions to review before Phase 1

1. **`lab_stage` locked (4 Jul)** to `idea / building / validating / launched`.
   `graduated` is deliberately excluded — graduation is the promote-only
   ladder's next rung (Lab → Venture Candidate, §16), represented by
   `venture_candidates`, not a lab stage.
2. **`user_badges.tier` values undefined** (§10 says "tier" with no values).
   Kept as TEXT. If tiers are real (bronze/silver/gold?), lock an enum.
3. **Report reason taxonomy undefined** (§19). Assumed enum: spam, harassment,
   impersonation, fraud_or_scam, inappropriate_content, misinformation, other.
4. **Poll mechanics — locked (Seq 14):** single-select, 2–6 text options,
   default 3 days (range 1–7), creator may close early, vote change allowed
   until close, **anonymous (counts only)**. Modeled with `posts.poll_status`
   (open/closed — manual early close or auto-close sweep) + `posts.poll_closes_at`.
   The `(post_id, voter_user_id)` unique is **kept** (single-select; a member
   recasts via `UPDATE`/upsert and the composite FK keeps the new option inside
   the poll). Option count: max 6 enforced via `poll_options.position 0..5`; the
   2-option minimum is an app-layer row-count rule. **RLS obligation:**
   `voter_user_id` is stored (needed for one-vote + vote-change) but individual
   ballots must NEVER be exposed — Plaza and any API return counts only.
5. **Profile location — kept (Seq 15):** nullable `latitude`/`longitude`
   (manual, like listings) **and** nullable `timezone` (IANA name) for the
   distance + timezone matching Seq 15 specifies; no chapters/city-grouping.
6. **Post `title`**: not in the PRD for any post type, but Asks/Wins without a
   title render poorly. Added nullable `title`. Confirm.
7. **Verification vs listings**: business verification reuses `verifications`
   (type='business') and now carries `listing_id` (targets the specific
   listing); `business_listings.verification_status` holds the resulting badge
   state. Confirm the business-verification evidence flow doesn't need its own
   table.
8. **Supporter governance vote window** (`vote_opens_at/closes_at` on
   candidates) + quorum/approval math (quorum 5 or 20%, 60%, 7 days, §12) is
   computed at app layer from raw ballots. No tally columns were added.
9. **Duplicate-listing detection** (§18) is a search-layer concern
   (Meilisearch); no fingerprint column added. Confirm.
10. **Rate limiting** (5 posts/day etc., §26) is Upstash-at-edge (§19); no
    counters in Postgres.
11. **Mentor-in-residence** (§20) is modeled as a badge
    (`mentor-in-residence`), not a rotation table. The "5 Asks/week"
    commitment is untracked in v1.0.
12. **Somalia-region gating (Seq 6):** the current result is materialized as
    `profiles.region_verified` + `region_attested_at`. Every gate *evaluation*
    is logged server-side in `capital_gate_evaluations` (profile country +
    geo-IP-derived country + attestation + decision + reason) so the Capital
    compliance spec is auditable. Raw per-session geo-IP is not stored — only
    the derived country. Confirm this split and the retention on the log.
13. **Invites are single-use.** Multi-use campaign codes would need a
    redemptions table — not built (PRD only shows personal invite codes).
14. **Community Awards nominations**: only ballots (`award_votes`) are stored;
    nominee shortlists are derived. Confirm no separate nomination step.
15. **Space chat surface — resolved (4 Jul, Seq 10): no `lab_messages` table.**
    Seq 10's Space settings give every Space a post-based content surface
    ("Posts & Content"), not a chat channel — disappearing messages (a chat
    feature) are explicitly deferred to v1.3/v1.4. So a Space's discussion is
    **Plaza posts scoped to the Lab** via `posts.lab_id` (NULL = global Plaza),
    reusing the whole Plaza stack (post types, comments, reactions, tags,
    moderation `status`) and matching §13's "no group DMs — same as a space".
    The real migration risk was the *opposite* of a chat table — posts needing
    Space scoping — which `posts.lab_id` resolves.
    **Space settings storage:** the RLS/Discover-filtered settings are TYPED
    columns — `visibility`, `is_listed` (listed vs unlisted-but-link-accessible),
    `is_supporter_only`, `join_mode`, `member_list_visibility` — never buried in
    jsonb; `labs.settings` jsonb holds only the open, non-filtered "Posts &
    Content" settings (post approval, slow mode, allowed types, pinned posts).
16. **Lab milestones** (§16 lists "milestones" alongside updates/decisions) have
    no dedicated table — modeled as `lab_events` entries. §6 and Phase 4 ACs
    don't field-define milestones, so this is treated as sufficient; add a
    `lab_milestones` table if target-dates/achieved-state become first-class.
17. **Cross-post integrity** for `lab_updates.collaboration_id` (the referenced
    collaboration must involve this lab and be `accepted`) is enforced at the
    app layer — not declaratively expressible without a trigger. Same
    app-layer-enforced caveat as the polymorphic `follows.target_id`.
18. **Consent — resolved (4 Jul): `consent_records` (real GDPR fix).** One row
    per affirmative consent: `consent_type` (`terms_of_service` /
    `privacy_policy` / `cookies` / `analytics`), document `version`, `method`
    (how captured), `granted_at`, and `withdrawn_at` (nullable). Analytics/cookie
    consent is thus independently withdrawable and the Cookie Notice's "consent
    record" promise is met; a decline is simply the absence of an active record,
    and a new version or re-grant is a new row. A partial unique
    `(user_id, consent_type) WHERE withdrawn_at IS NULL` guarantees at most one
    active consent per document. The flat `users.terms_accepted_at`/
    `terms_version` columns were removed in favor of this table.
