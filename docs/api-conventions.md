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
