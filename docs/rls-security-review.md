# RLS & Security Review — Xidig App v1.0 (Seq 49.5)

**Type:** Pre-launch go/no-go security gate.
**Scope:** Row-level-security (RLS) permission model + the app-layer authz, service-role, and secret-handling that sits above it.
**Date:** 2026-07-18.
**Method:** Hostile audit (fan-out reader agents over every migration, API route, MCP/seed path, and existing test) with an adversarial refutation pass on every candidate finding, plus direct human-in-the-loop verification of the highest-risk paths and a new DB-level negative-test suite run against real Postgres.

> **Verdict: CLEARED for launch on the permission model.** The audit found **one HIGH-severity defect — a biometric column leak on `verifications` — which is now fixed and tested** (migration `20260718000000`). Everything else reduced to a documented by-design behaviour plus low/informational hardening notes. After the fix there is **no open critical or high-severity data-leak or privilege-escalation defect** in the RLS model, the API authz layer, service-role containment, or secret handling. A short list of launch-ops items remains as pre-existing Alpha-Hardening Debt (DB push + live RLS verify, DPIA sign-off, Upstash config). See [Findings](#7-findings) and [Launch-gate decision](#10-launch-gate-decision).

---

## 1. What was audited

| Surface | Artifacts |
| --- | --- |
| Schema + RLS | All 21 migrations in `packages/db/supabase/migrations/` (base schema → Phase 8 + front-door/consent/events/guard-revoke) |
| API authz | ~140 route handlers under `apps/web/src/app/api/**`, the `requireUser`/`requireApiKey` guards, and every service-role call site |
| External surface | REST `api/external/**`, the API-key layer (`lib/api-keys/**`), and the MCP server (`apps/web/mcp/**`) |
| Seed / AI | `lib/seed/**`, the seed registries, `users.is_ai`, and the `content_source` labelling |
| Containment | `lib/supabase/server.ts` (service-role client), `env.ts` (secret boundary), `lib/audit.ts` |
| Existing tests | 12 DB integration suites (`packages/db/src/*.test.ts`) + `packages/db/test/auth-foundation.itest.ts`, plus app-layer unit tests |

The permission model is **RLS-first**: PostgREST executes every client request as `anon`/`authenticated` with `request.jwt.claims.sub = auth.uid()`, so the database is authoritative. The app layer duplicates some checks for UX and for the paths that legitimately need the service role (which bypasses RLS) — those paths were audited specifically for *code-side* authz because RLS cannot protect them.

## 2. Test harness (how RLS is actually exercised)

`packages/db/src/testing/harness.ts` (`createTestDatabase`) boots a disposable **real Postgres 17** (`embedded-postgres`), recreates the Supabase environment (the `anon`/`authenticated`/`service_role` roles with `service_role` carrying `BYPASSRLS`, Supabase's broad default grants, an `auth.users` stub, and `auth.uid()` reading the JWT claims), and applies **every migration in order**. Tests then run inside a transaction with `SET LOCAL role` + a `request.jwt.claims` GUC — exactly how PostgREST runs a request. This means the suites exercise the **real policies, column grants, triggers and CHECK constraints**, not mocks.

Convention across all suites:

| Denial mechanism | Observed as |
| --- | --- |
| RLS policy filters the row | empty result set (`rowCount === 0`) |
| Revoked table/column grant on write | `permission denied` |
| `WITH CHECK` / RLS violation on write | `row-level security` |
| Append-only immutability trigger | `append-only` |
| CHECK / unique constraint | the constraint name / `violates check` / `duplicate key` |

## 3. Sensitive-entity inventory (by data class)

| Data class | Representative entities | DB rule |
| --- | --- | --- |
| **User-private** | `users` (self row), `profiles` (self-service cols), `consent_records`, `bookmarks`, `mutes`, `post_drafts`, `user_settings`, `notification_prefs`, `notifications`, `push_subscriptions`, `capital_gate_evaluations`, `media_uploads` | own-row RLS (`user_id = auth.uid()`); a stranger reads 0 rows |
| **Locked / privileged columns** | `users.role/status/email/phone/is_ai`, `profiles.membership_tier_id/verification_status/subscription_status/region_verified`, `posts.source` | column-level GRANT excludes them → client `UPDATE` = `permission denied` |
| **Private conversations** | `conversations`, `messages`, `user_blocks` | participant-only; **no blanket mod read**; non-participant cannot enumerate by `conversation_id` |
| **Role-gated (mod)** | `mod_actions`, `reports` (queue view), `appeals` (queue), `moderation_reviews`, `report_snapshots` | `is_mod()` policies; normal member reads own report only, never the queue |
| **Role-gated (admin)** | `audit_logs`, `seed_runs`, `seed_entities`, `digest_editions`, `governance_log_entries` (drafts), `app_settings`, `verifier_grants` | `is_admin()` SELECT; writes revoked from clients |
| **Verifier-gated (biometric)** | `verifications` (+ recordings) | requester + `is_verifier()` + admin only — **NOT every mod** (DPIA least-privilege) |
| **Tier-gated (Supporter)** | `labs.is_supporter_only`, capability slugs (`create_lab`, `vote_candidate`, `*_path`) | `has_capability()` reads `tier_capabilities`; `membership_tiers`/`tier_capabilities` are **invisible** to clients |
| **Region-gated (Somalia)** | Maalgeli invest intent | **app-layer** three-signal gate (`decideGate`); DB keeps only the append-only `capital_gate_evaluations` audit log (own-row) |
| **Candidate-gated** | `venture_candidates`, `candidate_reviews`, `candidate_votes`, `interests`, candidate-owned `comments`/`page_blocks` | `can_read_candidate()` state machine (draft / reviewers_only / all_members) + recusal via `can_review_candidate()` |
| **API/MCP-scoped** | `api_keys` (hash-only), `webhook_endpoints` (HMAC secret) | RLS-locked to every client role; only `service_role` reads; scope/rate-limit/audit enforced in `requireApiKey` |
| **Seeded / AI** | rows with `source ∈ {seed, ai}`, `users.is_ai` | distinguishable at row level; earns no reputation; not client-relabelable |
| **Immutable ledgers** | `audit_logs`, `mod_actions`, `report_snapshots`, `capital_gate_evaluations` | append-only trigger — no `UPDATE`/`DELETE`, even for `service_role` |
| **Public / anon** | `list_visible_tiers()`, `get_signup_mode()`, published front-door content via SSR service projection | anon gets **no** table RLS grant; public reads go through `SECURITY DEFINER` functions or SSR — never raw anon table access |

## 4. RLS / security negative-test matrix

Every row below has at least one **allowed** and one **denied** assertion in the cited suite. "New" = added in this pass.

| # | Boundary (attacker → target) | Result | Where enforced / tested |
| --- | --- | --- | --- |
| 1 | Member A reads Member B's `users`/`profiles` private data | denied (0 rows) | `auth-foundation.itest.ts`, `migrations.test.ts` |
| 2 | Member escalates own `role`/`status`/`membership_tier_id`/`verification_status` | denied (perm) | `auth-foundation.itest.ts` |
| 3 | Member updates/deletes Member B's content (`posts`/`comments`) | impossible (API-only, no client write grant) | `phase2-plaza.test.ts` |
| 4 | Forged `user_id` on `reactions` / `voter_user_id` on `poll_votes` | denied (`row-level security`) | `phase2-plaza.test.ts` |
| 5 | Free member reaches Supporter-only capability / Space | denied; Supporter allowed | `auth-foundation.itest.ts`, `phase4-labs.test.ts` |
| 6 | Client reads `membership_tiers` / `tier_capabilities` | denied (0 rows); catalog only via `list_visible_tiers()` | `auth-foundation.itest.ts` |
| 7 | Non-participant / mod reads a private DM `conversation`/`messages` | denied (0 rows) — no blanket mod read | `phase3-fariimo.test.ts`, `phase6-moderation.test.ts` |
| 8 | Member reads another member's `notifications`/`push_subscriptions`/`reports` | denied (0 rows) | `phase3-fariimo.test.ts` |
| 9 | Non-Candidate member reads a `draft`/`reviewers_only` Candidate | denied; Lab member/reviewer/admin allowed | `phase5-capital.test.ts` |
| 10 | Recused mod (Lab member) reviews own Candidate | denied (`can_review_candidate` false) | `phase5-capital.test.ts` |
| 11 | Member reads another member's ballot (`candidate_votes`, `poll_votes`) | denied (0 rows); tally via aggregate fn | `phase5-capital.test.ts`, `phase2-plaza.test.ts` |
| 12 | Normal member reads mod queue / `mod_actions` / `audit_logs` | denied (0 rows); mod/admin allowed | `phase6-moderation.test.ts`, `migrations.test.ts` |
| 13 | Plain mod reads biometric `verifications`; member self-grants verifier | denied — verifier/admin only; self-grant `permission denied` | `phase6-moderation.test.ts` |
| 14 | Any role mutates append-only ledgers (`audit_logs`/`mod_actions`/snapshots) | denied (`append-only`), incl. `service_role` | `phase6-moderation.test.ts` |
| 15 | Appellant self-reviews their own appeal | denied (DB CHECK) | `phase6-moderation.test.ts` |
| 16 | Region mismatch / spoofed geo header grants invest access | denied (`unknown_geo`/mismatch); only `x-vercel-ip-country` trusted | `lib/capital/region-gate.test.ts` (app-layer) |
| 17 | Member writes own reputation / badges; AI account earns Helper score | denied (engine is service-role-only); `is_ai` → no Helper | `phase7-reputation-awards.test.ts` |
| 18 | Member reads any `api_keys` row (own or other's — `key_hash` leak) | denied (0 rows) | `migrations.test.ts`, **`phase8-ai-api.test.ts` (New)** |
| 19 | Member mints/escalates/revokes an `api_keys` row directly | denied (perm) | **`phase8-ai-api.test.ts` (New)** |
| 20 | Member reads `webhook_endpoints` (HMAC signing secret) | denied (0 rows) — previously untested anywhere | **`phase8-ai-api.test.ts` (New)** |
| 21 | Member reads/writes seed registries (`seed_runs`/`seed_entities`/`digest_editions`) | denied (admin-read, service-write) | `migrations.test.ts`, **`phase8-ai-api.test.ts` (New)** |
| 22 | Member self-declares as AI (`is_ai`) or relabels seeded content as `member` | denied (perm) | **`phase8-ai-api.test.ts` (New)** |
| 23 | Anon reads any non-public table (`profiles`, `labs`, `posts`, `api_keys`) | denied (0 rows / perm) | across suites |
| 24 | Suspended user writes; suspended author's content stays visible | denied (`row-level security`); content hidden from readers | `phase6-moderation.test.ts` |
| 25 | Private per-user tables (`bookmarks`/`mutes`/`drafts`/`user_settings`) A↔B | denied (own-rows only) | `experience-expansion.test.ts` |
| 26 | `space_only` events / RSVPs leak to non-members; cross-member RSVP tamper | denied (0 rows); host/mod allowed | `events.test.ts` |
| 27 | `following_feed` surfaces private-lab/muted/blocked sources | denied (RLS + mutes + blocks re-applied) | `following-feed.test.ts` |
| 28 | Verification subject reads own biometric `recording_url`/`verifier_user_id`/`decision_notes` | denied (perm) after F1 fix; status columns still readable; verifier queue unaffected | **`security-hardening.test.ts` (New)** |
| 29 | Member self-inserts a `lab_members` row to self-join a private Space | denied (perm) | **`security-hardening.test.ts` (New)** |
| 30 | Member (incl. recipient) reads the `digest_email_sends` email-PII ledger | denied (0 rows); admin-only; writes revoked | **`security-hardening.test.ts` (New)** |

## 5. App-layer authz spot-checks (paths RLS can't protect)

Service-role bypasses RLS, so these were read directly:

- **API-key mint** (`api/me/api-keys` POST): a member is restricted to `MEMBER_MINTABLE_SCOPES`; requesting `admin` (or any non-allowed scope) → **403**. A member can never mint an admin-equivalent key. ✔
- **API-key revoke** (`api/me/api-keys/[id]` DELETE): non-admins are scoped to `owner_user_id = self`, so revoking another member's key returns **404**, never a cross-user kill. ✔
- **External/MCP writes**: every route passes through `requireApiKey(scope)` (401/403/429 + audit); the MCP server is a thin stdio→HTTP client bounded by the key's scopes (no privileged DB path). Seeded content is authored by the badged seed actor with `source ∈ {seed, ai}`, audited with the key id, and earns no reputation. ✔
- **Admin routes** verify `is_admin()`/`is_mod()` server-side via `requireUser` guards, not UI hiding. ✔

## 6. Service-role & secret containment

- `getSupabaseAdmin()` (service-role, `SUPABASE_SECRET_KEY`) lives in `lib/supabase/server.ts` and is imported only by server code (route handlers, server libs). Its docstring rule — *"NEVER let its results flow to a response without an explicit authz check"* — holds at every call site reviewed.
- **Secret boundary:** only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are mirrored to the browser; `SUPABASE_SECRET_KEY` has no `NEXT_PUBLIC_` twin, and the browser client (`supabase-browser.ts`) reads the public vars directly instead of importing the server `env` module. Next.js only inlines `NEXT_PUBLIC_`-prefixed vars, so the secret key cannot reach a client bundle. `env-client-boundary.test.ts` guards this.
- **Audit:** `writeAudit` is insert-only; `audit_logs` `UPDATE`/`DELETE` is revoked from **every** role incl. `service_role` and blocked by an append-only trigger. External writes carry `api_key_id`.

## 7. Findings

The hostile audit surfaced **25 candidate findings**; an independent adversarial-refutation pass (one skeptic per finding, reading the real SQL/code and defaulting to *refuted*) killed **20** as non-exploitable (RLS/column-grant/app-code already closed them). The **5 confirmed** were then re-checked by hand against the source and reconciled below. Net: **1 real defect (HIGH) — now fixed**, 1 by-design behaviour (documented decision), and 3 low/info items (1 hardened, 2 accepted).

### F1 — HIGH · `verifications` biometric column leaked to the subject · **FIXED**

- **Tables/files:** `verifications` (`recording_url`, `recording_expires_at`, `verifier_user_id`, `decision_notes`); introduced in `20260708100000_phase6_moderation.sql`.
- **Defect:** `verifications_select_own` (`user_id = auth.uid()`) opened the row to the `authenticated` role with **no column-scoping**, while Supabase's default posture grants SELECT on *every* column. The migration's own comment promises *"recording_url stays server-only … every read of it is written to `verification_access_log` by the API"* — but that was enforced only by the app never selecting it, not by the DB.
- **Reproduction:** an authenticated member calls PostgREST directly with the publishable key: `GET /rest/v1/verifications?select=recording_url,recording_expires_at,verifier_user_id,decision_notes&user_id=eq.<own-uid>` → returns the special-category biometric recording pointer (§14), the verifier's identity, and the decision notes, **bypassing** the verifier-only gate *and* the mandatory `verification_access_log`.
- **Why it was reachable:** the app always reads `verifications` via the **service role** (`getSupabaseAdmin` — verifier queue, `me/verification`, the access-logged recording fetch), so the `authenticated` SELECT policy is reachable *only* by a direct-PostgREST client — exactly the attack path.
- **Fix (this pass):** `20260718000000_seq49_5_verification_column_scope.sql` revokes SELECT from `anon`/`authenticated` and re-grants only the member-safe status columns; `recording_url`, `recording_expires_at`, `verifier_user_id`, `decision_notes` are withheld. Service-role reads keep the default all-column grant, so **no app path changes**. Enforced-and-tested in `security-hardening.test.ts` (subject can read status, `permission denied` on the four sensitive columns, verifier queue unaffected).

### F2 — MEDIUM (reclassified **BY DESIGN**) · `candidate_reviews` notes/identity are community-visible

- **Table:** `candidate_reviews` (policy `candidate_reviews_select_visible using can_read_candidate(candidate_id)`).
- **Audit claim:** on an `all_members` Candidate, any member can read every reviewer's `reviewer_user_id` + free-text `notes` + rubric scores.
- **Human-review verdict:** this is **deliberate and documented**, not a defect. `docs/rls-phase5-capital.md` (L86–88): *"`candidate_reviews` visibility is deliberately kept simple: reviewer notes + rubric scores are readable **wherever the Candidate is readable** (decline/park reasons are meant to be visible, §17), rather than a separate reviewer-only scope."* It is also pinned by a passing `phase5-capital.test.ts` assertion. Per the launch-gate rule *"if implementation conflicts with a locked decision, stop and report"* — **no change made.**
- **Residual note (needs Warya's confirmation, non-blocking):** the transparency intent is about decline/park **reasons**. If reviewers might put PII or candid personal commentary in `notes`, consider surfacing only a member-safe reason field and scoping raw `notes`/`reviewer_user_id` to the reviewer set + creator + mod/admin. This is a **product-policy** call, not a security bug.

### F3 — LOW (ACCEPTED, by design) · per-key rate limiter fails open

- **Files:** `lib/api-keys/guard.ts` (`requireApiKey`) + `lib/rate-limit.ts`.
- **Behaviour:** `checkRateLimit` returns *allow* on missing/invalid Upstash config, a non-OK Redis response, an unparseable count, or any thrown error. A holder of a valid low-privilege key (e.g. `plaza:write`) is not throttled during an Upstash outage.
- **Assessment:** this is the **documented app-wide fail-open posture** (availability over throttling); scope/auth checks still apply, so it is an abuse-throttling gap, **not an authz hole**. Not launch-blocking.
- **Recommendation:** for the external **write** surface specifically, consider fail-closed (or a conservative in-process fallback cap) plus an alert when the limiter backend is unavailable, so an Upstash outage isn't a silent unbounded-write window. Ensure Upstash is configured in production.

### F4 — INFO (HARDENED this pass) · `@xidig/db` barrel re-exported the service-role factory

- **File:** `packages/db/src/index.ts`.
- **Issue:** the root barrel re-exported `createServerClient` (the **secret-key** service-role factory) alongside the browser-safe client + types. Not exploitable today (the secret key is never a `NEXT_PUBLIC_` var, so never inlined into a client bundle; all imports were server-side `import type`/server files) — but a value import from client-reachable code would be indistinguishable at the import site.
- **Hardening (this pass):** `createServerClient` now lives on the `@xidig/db/server` subpath **only**; the root barrel exposes just `createBrowserClient` + types. Consumers (`lib/supabase/server.ts`, `api/health/route.ts`, `smoke.test.ts`) updated. A client-reachable `import { createServerClient } from '@xidig/db'` now **fails to compile** — the leak is impossible by construction.

### F5 — INFO (ACCEPTED, deployment-config caveat) · region gate trusts a Vercel-specific header

- **File:** `lib/capital/region-gate.ts` (`getGeoCountry`).
- **Behaviour:** the geo leg of the Somalia Capital gate trusts **only** `x-vercel-ip-country`, which the Vercel edge sets-and-overwrites on every request (a client cannot forge it there). The former fallback headers (`cf-ipcountry`/`x-country-code`/`x-geo-country`) were removed and **none was reintroduced** (verified). An absent header correctly resolves to `unknown_geo` → deny.
- **Caveat:** off-Vercel (local, preview, or behind a different proxy) the header isn't platform-guaranteed, so a client could attach it and satisfy the geo leg. **Launch-config check:** confirm production runs on Vercel, or strip/override the trusted header in middleware for any other proxy.

## 8. Changes made this pass

| File | Change |
| --- | --- |
| `packages/db/supabase/migrations/20260718000000_seq49_5_verification_column_scope.sql` | **New (fix, F1)** — column-scopes `verifications` SELECT so the biometric recording pointer + verifier internals are never client-readable |
| `packages/db/src/testing/factories.ts` | **New** — shared fixtures/factories: `seedMember/Mod/Admin/Supporter/Verifier/AiAccount`, `seedLab/Membership/Candidate/PublishedPost`, `setStatus`, `setProfileCountry`, `countVisible(Anon)`, `callBool` |
| `packages/db/src/phase8-ai-api.test.ts` | **New** — 18 hostile Phase-8 tests deepening `migrations.test.ts`: `api_keys` cross-user/anon/scope-escalation/revoke, `webhook_endpoints` (net-new), seed-registry admin-read/service-write, `is_ai`/seeded-content relabel, AI-no-Helper |
| `packages/db/src/security-hardening.test.ts` | **New** — 7 cross-cutting tests: `verifications` column-scope (F1 proof), `lab_members` self-join denial, `digest_email_sends` admin-only PII ledger |
| `packages/db/src/index.ts` + `lib/supabase/server.ts` + `api/health/route.ts` + `packages/db/src/smoke.test.ts` | **Changed (hardening, F4)** — moved the service-role factory off the root barrel to `@xidig/db/server`-only |
| `docs/rls-security-review.md` | **New** — this report + the negative-test matrix |

No existing tests were deleted; the only edits to existing files are the F4 import-path move (4 files) — no assertions removed. All 208 `packages/db/src` tests + 64 integration tests + 50 app-layer security tests remain green.

## 9. How to run

```bash
# Full DB RLS/negative suite (each file boots its own embedded Postgres):
pnpm exec vitest run packages/db/src          # 13 files, 208 tests — RLS + triggers + helpers
pnpm --filter @xidig/db test:integration      # packages/db/test/auth-foundation.itest.ts — 64 tests (auth/RLS foundation)

# Just the suites added this pass:
pnpm exec vitest run packages/db/src/phase8-ai-api.test.ts packages/db/src/security-hardening.test.ts

# App-layer security tests (region gate, API keys, external, env boundary):
pnpm exec vitest run apps/web/src/lib/capital/region-gate.test.ts \
  apps/web/src/lib/api-keys apps/web/src/lib/external apps/web/src/env-client-boundary.test.ts

# Everything:
pnpm test
```

## 10. Launch-gate decision

**CLEARED — the permission model is launch-ready.**

- The one real defect (F1, HIGH — biometric column leak) is **fixed and tested**; sensitive `verifications` columns now fail closed.
- The MEDIUM the audit raised (F2) is a **documented, locked design decision**, not a bug — flagged only for a product confirmation on reviewer-note content.
- The remaining items are LOW/INFO: one hardened (F4), two accepted by design (F3 rate-limit fail-open; F5 geo header) with launch-config recommendations.
- No unresolved cross-account, cross-region, cross-tier, cross-Candidate, role/admin/mod, seeded/AI, or API/MCP data-leak or privilege-escalation path remains in RLS, API authz, service-role containment, or secret handling.

**Conditions that remain (pre-existing Alpha-Hardening Debt, not gaps in this review):**
1. Push all 21+1 migrations to the production Supabase project and re-verify RLS live (these suites run against a fresh embedded Postgres, not prod).
2. Sign the Biometric DPIA (`docs/dpia-verification.md`) and confirm the encrypted recording bucket before enabling verification recordings.
3. Configure Upstash in production (so F3's fail-open window doesn't apply) and confirm the deployment target is Vercel (F5).

Score card: **25 candidates → 20 refuted → 5 confirmed → 1 fixed HIGH, 1 by-design, 1 low-accepted, 2 info (1 hardened, 1 accepted). 0 open critical/high.**

## 11. Unresolved questions / manual follow-ups

- **Live-DB parity (Alpha-Hardening Debt):** these suites run against migrations applied to a fresh embedded Postgres. The production Supabase project must have all 21 migrations pushed and RLS verified live before real members are invited (already tracked as launch debt).
- **Rate-limit fail-open (by design):** `requireApiKey` and the app rate limiter fail **open** when Upstash is unreachable. This is a documented availability trade-off, not an authz hole (scope checks still apply), but abuse throttling depends on Upstash being configured in production.
- **DPIA sign-off:** biometric verification recordings are least-privilege at the DB, but the `docs/dpia-verification.md` sign-off is a separate launch gate.
