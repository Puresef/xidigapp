# API conventions

How the Xidig API layer is built (PRD §22 **API-first**: every data operation
goes through a defined route — the UI never touches the database directly, so
the same API backs the v1.2 React Native app without a rewrite).

This document covers the shared conventions and the Phase 1 (Profiles /
Directory / Map / Social) + analytics surface. Auth routes
(`/api/auth/*`, `/api/waitlist`, `/api/invites`, `/api/admin/*`) follow the
same conventions.

## Response envelope

Every route returns one of two shapes (`lib/api.ts`):

```jsonc
// success
{ "data": { /* ... */ } }
// failure
{ "error": { "code": "handle_taken", "message": "That handle is taken. Try a different one.", "cta": { "label": "…", "href": "…" } } }
```

- `message`/`cta` are **§27 plain-language copy**, resolved server-side in the
  request locale (Somali/English, §22) from `@xidig/i18n`. Clients render them
  verbatim — never a raw code, never an HTTP status. Helpers: `apiOk(data,
status?)`, `apiError(code, status)`, `apiNotice(notice, extra?)`, and the
  catch-all `handleApiError(error)`.
- One documented deviation: `POST /api/listings` duplicate detection returns
  the standard `error` object **plus** a top-level `duplicates: [...]` array so
  the client can offer "Claim it instead" (§18/§27).

## Auth & RBAC (`lib/auth/guards.ts`)

Guards enforce access; UI hiding is presentation, not security. Every handler
picks an auth level:

| Level     | Helper                        | On failure                              |
| --------- | ----------------------------- | --------------------------------------- |
| public    | `getAuthContext()`            | proceeds signed-out (`{ user: null }`)  |
| user      | `requireUser()`               | 401 `session_expired`; 403 if suspended |
| mod/admin | `requireRole('mod'\|'admin')` | 403 `forbidden`                         |

`requireUser()` uses the **RLS-scoped** client (`ctx.supabase`, publishable key

- session cookies) — the database re-checks every read/write. The service-role
  client (`getSupabaseAdmin()`, bypasses RLS) is used only for safe aggregates
  (follower/vouch counts) and privileged writes (claim-approval ownership
  transfer), never echoed to a response without an authz check.

## Validation, errors, rate limits, pagination

- **Validation**: Zod on params/query/body. A `ZodError` maps to 400
  `invalid_request` via `handleApiError`. Note Zod 4's `.uuid()` enforces RFC
  version/variant — real `gen_random_uuid()` v4 ids pass.
- **Errors**: stable codes in `lib/errors.ts` → i18n message keys. The `error.*`
  namespace is a **launch-floor** i18n namespace (100% Somali coverage enforced
  by `coverage.test.ts`), so a new code ships copy in both dictionaries.
- **Rate limits** (`lib/rate-limit.ts`, Upstash REST, fail-open): waitlist 5/h
  per IP; invites 5/day per member (§26); listings **2/week** per member (§26);
  follows 120/h; analytics ingest 120/min per IP.
- **Pagination** (`lib/pagination.ts`): keyset cursors (opaque base64url of
  `{createdAt,id}`), `created_at desc, id desc`. Default 20, max 50. A
  malformed/forged cursor is treated as absent.

## Phase 1 route table

| Method     | Route                                  | Auth   | Notes                                         |
| ---------- | -------------------------------------- | ------ | --------------------------------------------- |
| GET        | `/api/me`                              | public | session snapshot + `has_password` nudge state |
| PATCH      | `/api/me/onboarding`                   | user   | onboarding_state (nudge dismiss)              |
| PUT        | `/api/me/profile`                      | user   | create/update own profile; `handle_taken` 409 |
| GET        | `/api/profiles`                        | user   | directory: skill/lane/country/city/q, keyset  |
| GET        | `/api/profiles/{handle}`               | user   | profile + badges + follower/vouch counts      |
| PUT/DELETE | `/api/follows/{targetType}/{targetId}` | user   | idempotent follow (user/tag)                  |
| GET        | `/api/me/follows`                      | user   | own follow edges (Following tab)              |
| GET        | `/api/listings`                        | user   | directory + map (`bbox`), category/city/q     |
| POST       | `/api/listings`                        | user   | pin-drop create; 2/week; duplicate detection  |
| GET        | `/api/listings/{id}`                   | user   | single listing (RLS)                          |
| PATCH      | `/api/listings/{id}`                   | user   | owner/mod content edit                        |
| POST       | `/api/listings/{id}/claims`            | user   | claim an unowned listing                      |
| PATCH      | `/api/claims/{id}`                     | mod    | approve → ownership transfer + audit          |
| POST       | `/api/analytics`                       | public | first-party client-event ingest               |

RLS for these tables ships in `20260704210000_phase1_api_surface.sql`; the
security model is exercised by `packages/db/src/migrations.test.ts` against a
real Postgres.

## Phase 2 route table (Plaza / Madal)

| Method     | Route                                     | Auth   | Notes                                              |
| ---------- | ----------------------------------------- | ------ | -------------------------------------------------- |
| GET        | `/api/posts`                              | user   | feed: keyset, `?type=` filter, `?pinned=1` slot    |
| POST       | `/api/posts`                              | user   | 5 types; 5/day free (`post_limit` §27), pre-scan   |
| GET        | `/api/posts/{id}`                         | user   | + `creditedCommentId`; author sees own hidden      |
| PATCH/DELETE | `/api/posts/{id}`                       | user   | author edit (re-scan) / soft-delete                |
| POST       | `/api/posts/{id}/ask`                     | user   | asker credit/close; helper credit ledger + notice  |
| POST       | `/api/posts/{id}/votes`                   | user   | insert-then-recast (NEVER `.upsert()` — column-scoped grant) |
| POST       | `/api/posts/{id}/poll`                    | user   | author early close                                 |
| GET/POST   | `/api/posts/{id}/comments`                | user   | ascending keyset; 10/day free (`comment_limit`)    |
| PATCH/DELETE | `/api/comments/{id}`                    | user   | author edit / soft-delete                          |
| PUT/DELETE | `/api/posts/{id}/reactions/{type}`        | user   | idempotent, RLS-scoped (also on comments)          |
| GET/POST   | `/api/tags`                               | user   | member-suggested tags; format + 10/day cap         |
| POST       | `/api/media`                              | user   | 5MB → WebP (EXIF dropped), sync AI image pre-scan  |
| POST/DELETE | `/api/admin/posts/{id}/pin`              | mod    | weekly highlights slot + audit                     |
| GET        | `/api/admin/moderation`                   | mod    | HITL queue; `?language=so` Somali lane             |
| PATCH      | `/api/admin/moderation/{id}`              | mod    | approve/remove/dismiss + mod_action + audit        |
| GET        | `/api/cron/plaza`                         | secret | Bearer `CRON_SECRET`; stale-Ask nudge + poll close |

Phase 2 conventions worth knowing:

- **Content writes are API-only.** posts/comments/post_tags/poll_options/tags/
  media_uploads/moderation_reviews have NO client write policies — a direct
  PostgREST insert would bypass the §15 AI pre-scan and the §26 rate limits.
  Reads still run under the caller's RLS (authors see their own hidden rows);
  reactions and poll_votes remain client-writable under RLS.
- **Poll ballots are anonymous (Seq 14).** `poll_votes` is own-rows-only even
  for mods; tallies come from `poll_results()` (SECURITY DEFINER, counts only)
  or service-role aggregation in `lib/plaza/views.ts`.
- **Moderation pipeline:** text scans run post-response (`after()`), fail-open
  to `skipped`; `flag` → auto-hidden + queued, `uncertain` → stays live +
  queued for the Somali-capable human review lane (`/admin/moderation`).
  Image scans run synchronously in `/api/media`; confident flags are rejected
  before anything is stored.

## Phase 3 route table (Fariimo — DMs + notifications)

| Method     | Route                                       | Auth | Notes                                                        |
| ---------- | ------------------------------------------- | ---- | ----------------------------------------------------------- |
| GET        | `/api/conversations`                        | user | inbox: `dm_inbox()` RPC, unread + last message, keyset       |
| POST       | `/api/conversations`                        | user | start request-to-chat; 5/day (§26); block/contact gates      |
| GET        | `/api/conversations/{id}`                   | user | header: status, role, other participant                      |
| POST       | `/api/conversations/{id}/respond`           | user | recipient accept/decline of a pending request                |
| GET        | `/api/conversations/{id}/messages`          | user | keyset history (oldest→newest per page)                      |
| POST       | `/api/conversations/{id}/messages`          | user | send (accepted only); block + 30/min guard; `new_dm` notify  |
| POST       | `/api/conversations/{id}/read`              | user | mark read for the caller (own last_read column)              |
| PUT/DELETE | `/api/blocks/{userId}`                      | user | block/unblock; block halts the thread                        |
| POST       | `/api/reports`                              | user | DM report entry point → §27 notice (Phase 6 owns the queue)  |
| GET        | `/api/notifications`                        | user | bundled inbox (§22), keyset, unread total                    |
| POST       | `/api/notifications/read`                   | user | mark ids / all read (own rows)                               |
| GET        | `/api/notifications/summary`                | user | nav badge counts (unread notifications + DMs)                |
| POST/DELETE | `/api/push/subscribe`                      | user | register / revoke a Web Push subscription                    |

Phase 3 conventions worth knowing:

- **DM writes are API-only** — conversations/messages/user_blocks/
  push_subscriptions have NO client write grants. The accept gate, block
  checks, §26 throttles and notification/email/push side effects are API
  obligations. Reads run under the caller's RLS (participant-only; **mods get
  no blanket read on private DMs**, unlike Plaza).
- **Realtime, not polling** — clients subscribe to `messages`
  (`conversation_id=eq.<id>`) and `notifications`/`conversations`; RLS gates
  each subscriber's stream. The message→conversation `updated_at` touch trigger
  drives inbox ordering.
- **Notification channels (§26 matrix)** live in `lib/notifications/types.ts`:
  in-app = everything; email = dm_request (+ candidate_status capability);
  push = reply / mention / new_dm / dm_request. Bundling groups by
  `(type, bundle_key)` at read time (`lib/notifications/bundle.ts`).

## Phase 4.5 route table (Experience Expansion — media, profiles, settings, social, search)

| Method       | Route                                   | Auth   | Notes                                                                        |
| ------------ | --------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| POST         | `/api/media`                            | user   | extended with `kind` (post/avatar/cover/listing_photo/space_icon/space_cover) + `alt`; per-kind resize + thumb + blurhash; listing_photo alt REQUIRED (`image_alt_required` 400); 30/hr |
| PATCH        | `/api/me/profile`                       | user   | extended: `avatarMediaId?` / `coverMediaId?` (attach after scan; `media_not_ready` 409), `openTo?[]` slugs; `avatar_updated` event |
| GET/PUT      | `/api/me/profile/pins`                  | user   | up to 3 pins; validates existence + visibility, rewrites positions (`pin_target_invalid` 400) |
| GET          | `/api/me/suggested-follows`             | user   | shared lanes/skills/city; excludes self + followed; verified boost; limit 10 |
| PATCH        | `/api/listings/{id}`                     | user   | extended: `openingHours`, `priceRange`, `services[]` (≤20, replace-all)      |
| PUT          | `/api/listings/{id}/photos`             | user   | `{photos:[{mediaId, alt?}]}` ≤5 ordered; validates kind/owner/scan; denormalizes `primary_photo_*` + `photo_count`; `listing_photos_updated` event |
| GET/PATCH    | `/api/me/settings`                      | user   | typed columns + `preferences` jsonb (deep-merge); lazy upsert; GET returns defaults when absent; `settings_updated {section}` |
| GET/PUT      | `/api/me/notification-prefs`            | user   | full §26 matrix replace; GET merges defaults + overrides                     |
| POST         | `/api/me/export`                        | user   | synchronous JSON download of own data; 1/hour; `data_export_requested`       |
| PUT/DELETE   | `/api/bookmarks/{entityType}/{entityId}` | user  | idempotent; `bookmark_added` / `bookmark_removed {entity_type}`              |
| GET          | `/api/me/bookmarks`                      | user   | keyset paginated, hydrated per entity type                                   |
| PUT/DELETE   | `/api/mutes/{entityType}/{entityId}`    | user   | idempotent; `mute_added {entity_type}` (user/tag/lab)                        |
| GET          | `/api/me/mutes`                         | user   | own mutes                                                                    |
| GET/POST     | `/api/me/drafts`                        | user   | cap 10/user (`draft_limit` 409); `draft_saved`                              |
| PATCH/DELETE | `/api/me/drafts/{id}`                   | user   | own drafts; `draft_saved` on PATCH                                          |
| PATCH        | `/api/posts/{id}`                        | user   | extended: writes a `post_revisions` snapshot first (`had_replies`); `post_edited` |
| GET          | `/api/posts/{id}/revisions`             | user   | post author or mod                                                           |
| GET          | `/api/search`                           | user   | `?q=` → grouped `{people, listings, labs, posts}` top 5 each; trgm/search_norm; public-safe fields; respects `discoverable_directory`; per-request rate limit; `search_performed {result_count}` |
| GET          | `/api/blocks`                           | user   | list own blocked members (unblock UI)                                        |
| PUT/DELETE   | `/api/blocks/{userId}`                  | user   | block/unblock (Phase 3; unblock surfaced in Privacy settings)               |
| PATCH        | `/api/labs/{id}`                        | user   | extended: `iconMediaId` / `coverMediaId` attach (kind space_icon/space_cover, manager-only) |

Phase 4.5 conventions worth knowing:

- **Defer, don't disable (Lite mode, §22)** — heavy bytes never leave the API
  as a hard removal; every image/embed/map ships with a blurhash + thumb + byte
  estimate so the client can render a 0-byte placeholder and fetch on tap. All
  media identity columns (avatar/cover/icon) are **not client-writable**: the API
  attaches them only after validating the `media_uploads` row's owner + scan.
- **DM privacy + notification prefs enforcement** — the conversation-request
  service consults `user_settings.dm_privacy` (`dm_restricted`/`dm_blocked`
  semantics); send paths consult `isChannelEnabled(userId, type, channel)` +
  quiet hours (push only). In-app rows are always written.
- **`search_performed` carries only a result count** — query text is PII and
  never leaves the handler (§23). It is listed in `CLIENT_EVENT_NAMES` per spec
  §5 even though this build emits it server-side.

## Phase 5 route table (Capital / Maal — Candidates + intent capture)

Base path `/api/candidates` (per-candidate actions) + `/api/capital` (region gate
+ fund-level intent). All writes are API-only under default-deny RLS; the five
capital tables have no authenticated write grants. Capital v1 is **intent capture
only** — no money movement, no pledge ledger. Maalgeli (Invest) is Somalia-region
gated (geo-IP country AND profile country AND self-attestation — all three);
Garab (Co-sign) + "I can help" are non-financial and never gated.

| Method       | Route                              | Auth     | Notes                                                                                             |
| ------------ | ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| GET/POST     | `/api/candidates`                  | user     | GET keyset list of readable Candidates (`?labId` `?status`); POST creates a draft (requires `builder_path` capability + lab membership/lead; `not_supporter`/`forbidden`) |
| GET/PATCH/DELETE | `/api/candidates/{id}`         | user     | GET RLS-scoped view; PATCH content fields on draft/submitted (creator or lab lead; `post_not_editable` when frozen) incl. `logoMediaId`/`coverMediaId` attach (kind candidate_logo/candidate_cover, `media_not_ready` 409); DELETE draft only (creator/lead/admin) |
| POST         | `/api/candidates/{id}/submit`      | user     | draft→submitted; sets `submitted_at`, opens 7-day vote window (`vote_opens_at`/`vote_closes_at`); creator/lead only; non-draft → `candidate_not_submittable` 409 |
| POST         | `/api/candidates/{id}/decision`    | reviewer | `can_review_candidate` (mod/admin, recused if lab member); `{status: in_review\|approved\|parked\|declined, statusReason?}`; recusal → `reviewer_conflict` 403, non-reviewer → `not_a_reviewer` 403; sets `decided_at` on terminal |
| GET/PUT      | `/api/candidates/{id}/reviews`     | user/rev | GET review list (candidate-readable); PUT upserts caller's rubric review (`can_review_candidate`, recusal → `reviewer_conflict`; draft → `candidate_not_submittable`); recomputes + stores aggregate rubric scores (service role) |
| POST/DELETE  | `/api/candidates/{id}/vote`        | user     | Supporter governance vote (`vote_candidate` capability); only while window open (`vote_closed` 409); POST `{vote: approve\|reject}` upsert, DELETE retracts; response returns tally via `candidate_vote_tally` |
| POST/DELETE  | `/api/candidates/{id}/interests`   | user     | `type help\|cosign\|invest`. help+cosign: any member, all regions. invest: region-gate evaluated (geo+country+attested); if not granted → `capital_region_gated` notice + informational, no invest interest created; gate logged. Response returns interest counts |
| GET/POST     | `/api/candidates/{id}/comments`    | user     | open member comments (§12); reuses the Phase 2 comment service with a candidate target; any member who `can_read_candidate`; `comment_limit` 429 |
| POST         | `/api/capital/gate`                | user     | evaluate + persist region gate for the session `{attested:boolean}`; returns `{granted, reason}`; drives whether Maalgeli UI shows. Reads profile country + geo header; always logs a `capital_gate_evaluations` row |
| POST/DELETE  | `/api/capital/fund-interest`       | user     | fund-first funnel: standing fund-level invest intent (`interests`, `candidate_id` null). Region-gate required; not granted → `capital_region_gated` notice, no intent created. POST `{message?, attested}`; one per user; DELETE retracts |

Phase 5 conventions worth knowing:

- **Region gate is compliance-critical and append-only** — `evaluateCapitalGate`
  grants iff `lower(profileCountry)==='so'` AND `lower(geoCountry)==='so'` AND
  `attested===true`, and **always** inserts a `capital_gate_evaluations` row
  (reason ∈ `granted`/`country_mismatch`/`geo_mismatch`/`no_attestation`/
  `unknown_geo`). Geo country comes from `x-vercel-ip-country`; **the IP is never
  stored**. Non-Somalia invest attempts return the `capital_region_gated` **notice**
  (an `apiNotice`, not an error) and fall back to the informational view — no invest
  language, no Maalgeli action.
- **Reviewer set for v1.0 = mod/admin, with recusal** — no dedicated reviewer
  role exists pre-Phase-6, so `can_review_candidate` = `is_mod() OR is_admin()`
  AND NOT a member of the Candidate's Lab (§17 fairness). `not_a_reviewer` (403)
  is for a plain member; `reviewer_conflict` (403) is for a recused mod/admin.
- **Governance vote is a non-binding signal** — tallies come only from
  `candidate_vote_tally` (ballot privacy, like polls); individual votes are
  own-row-only. The 7-day window opens at submit.
- **No analytics in Phase 5** — the §23 Capital events
  (`candidate_submitted`/`candidate_reviewed`/`interest_expressed`/
  `venture_timeline_viewed`) are **Phase 7**; these routes leave a
  `// Phase 7: analytics` marker where an event would fire and emit nothing.

## Analytics event taxonomy (§23)

`lib/analytics/` — one typed registry (`events.ts`), server capture
(`server.ts`, plain fetch to PostHog, EU/self-hosted), fire-and-forget emit
(`emit.ts`, Next `after()` so capture runs post-response), and a client helper
(`client.ts`, `sendBeacon` → `/api/analytics`; **no** PostHog JS SDK, so the
key never ships to the browser).

**No PII in payloads** is enforced twice: the property types only allow enums,
counts, booleans, taxonomy slugs, and entity UUIDs; and `sanitizeProperties`
rejects PII-bearing keys/values at runtime (throws in dev/test, strips + warns
in prod). `distinct_id` is the user UUID, or a stable per-browser anonymous id
pre-signup.

**Consent-gated, default-deny** (`consent.ts`): the lawful basis for analytics
is opt-in consent (§26, Art. 6(1)(a)), so `captureServer` drops any event whose
`userId` lacks an active `analytics` consent record — and anonymous events
(no `userId`) are always dropped. The check is fail-closed. Until the
consent-capture UI ships (ToS/cookie task), no `analytics` consent rows exist,
so the pipeline stays dark for everyone even once `POSTHOG_KEY` is set. Wiring
order in `captureServer`: PII guard → enabled(key) → **consent** → send.

Events wired to the actions that fire them:

| Event                                                             | Where                              |
| ----------------------------------------------------------------- | ---------------------------------- |
| `profile_completed`, `lane_selected`                              | `PUT /api/me/profile`              |
| `follow_created`                                                  | `PUT /api/follows/*`               |
| `listing_created`                                                 | `POST /api/listings`               |
| `listing_claimed`                                                 | `PATCH /api/claims/{id}` (approve) |
| `map_view`, `listing_view`, `contact_click`                       | client → `POST /api/analytics`     |
| `language_switched`, `low_bandwidth_enabled`                      | client → `POST /api/analytics`     |
| `signup_completed`, `verification_*`, `badge_awarded`, `invite_*` | emitted server-side by their flows |
