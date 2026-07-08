# RLS — Phase 6 (Admin / Moderation / Verification / Account lifecycle)

Migration: `packages/db/supabase/migrations/20260708100000_phase6_moderation.sql`.
Validated by `packages/db/src/phase6-moderation.test.ts` (embedded-Postgres, real RLS).

Phase 6 is **additive activation**: every table and enum already existed (Phase 0
schema). This migration adds the helpers, policies, immutability, and the two
evidence/compliance tables the app surface needs. Convention (unchanged): reads
are opened by narrow SELECT policies; **every write stays service-role-only** (the
tables have no client write grant), so a direct PostgREST write with the
publishable key fails.

## Helpers (SECURITY DEFINER, `search_path=''`, execute → authenticated+service_role)

| function | returns | purpose |
|---|---|---|
| `is_active_account()` | bool | current caller has `status='active'` — suspension **write-block** on participation policies |
| `author_is_active(uuid)` | bool | given author is `active` — suspension **content-hiding** on content SELECT policies |
| `is_verifier()` | bool | `is_admin()` OR an un-revoked `verifier_grants` row for an active user — the §14 verifier gate, **beside** mod/admin |

## Per-table RLS summary

| table | SELECT | INSERT/UPDATE/DELETE | immutable? |
|---|---|---|---|
| `reports` | `reports_select_own` (reporter) + `reports_select_mod` (`is_mod()`) | client-revoked; service-role: **DELETE revoked** (UPDATE = status transitions only) | trail-protected |
| `mod_actions` | `mod_actions_select_mod` (`is_mod()`) | client-revoked; **service-role UPDATE/DELETE revoked** | ✅ trigger + revoke |
| `appeals` | `appeals_select_own` (appellant) + `appeals_select_mod` | client-revoked (API-only); CHECK `reviewed_by ≠ appellant` | — |
| `audit_logs` | `audit_logs_select_admin` (`is_admin()`) | insert-only; **UPDATE/DELETE revoked (all roles)** | ✅ trigger + revoke |
| `verifications` | `verifications_select_own` + `verifications_select_verifier` (`is_verifier()`) | client-revoked (API-only) | — |
| `verification_access_log` | `..._select_admin` | client-revoked | ✅ trigger |
| `verifier_grants` | `..._select_admin` (admin-only roster) | client-revoked (API-only) | — |
| `report_snapshots` | `report_snapshots_select_mod` (`is_mod()`) | client-revoked | UPDATE forbidden (trigger) |
| `governance_log_entries` | `..._select_published` (members, published only) + `..._select_admin` (drafts) | client-revoked (admin API) | — |
| `capital_gate_evaluations` | (Phase 5, own-row) | **service-role UPDATE/DELETE revoked** (Phase 6 hardening) | ✅ trigger + revoke |

## Suspension enforcement (§19)

Two orthogonal mechanisms, both keyed on `users.status` (single source of truth,
instantly reversible, no batch job):

1. **Content-hiding** — `author_is_active(author)` added to the *published* branch
   of the content SELECT policies (`posts`, `comments`, `lab_updates`,
   `lab_artifacts`, `lab_decisions`, `business_listings`). A non-active author's
   published content disappears from every reader; the author still sees their
   own, and mods still see everything for adjudication. Covers `suspended`,
   `deactivated`, `pending_deletion`, `deleted`.
2. **Write-block** — `is_active_account()` added to the WITH CHECK of the
   client-writable participation policies (`reactions`, `poll_votes`,
   `skill_endorsements`, `profiles` update). Content creation
   (posts/comments/DMs/labs/candidates/listings) was already service-role-only, so
   a suspended user cannot create it via the API (`requireUser` → 403) or a direct
   client call (no insert grant). Self-scoped, harmless toggles (follows / mutes /
   bookmarks) are intentionally left unguarded.

## DM privacy invariant (preserved)

There is **no** mod/admin SELECT policy on `conversations` or `messages` — Phase 6
adds none. Report-contextual review works via `report_snapshots`: the report
route (participant-checked) captures the reported message + bounded context at
report time, and the mod queue reads the snapshot, never the live thread.

## Capital seams (untouched)

`can_review_candidate` and the `is_candidate_lab_member` recusal clause are
unchanged. The verifier axis is deliberately separate from the Capital reviewer
axis. `capital_gate_evaluations` is only *hardened* (append-only), never relaxed;
the no-money-movement stance is untouched.
