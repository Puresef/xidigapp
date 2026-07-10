-- ============================================================================
-- Phase 8 — AI seeding + REST/MCP API layer (§19, §21, §23).
-- ============================================================================
-- ADDITIVE ONLY. The Phase-0 schema already ships the DATA MODEL Phase 8 needs:
--   * api_keys        — hashed, scoped, revocable external keys (§21) — table
--                       exists; Phase 8 adds only a per-key rate-limit override
--                       column and keeps it API-only (service-role writes).
--   * webhook_endpoints — outbound webhook subscriptions (§21) — table exists.
--   * audit_logs      — append-only, carries api_key_id (§19/§21) — table exists.
--   * content_source enum ('member','seed','ai') + a `source` column on tags,
--     posts, comments, business_listings, lab_playbooks, labs, lab_updates —
--     so seeded/AI content is distinguishable at the row level (§21).
--   * users.is_ai     — badged AI-assistant accounts (§21); Phase 7's
--     award_reputation() already blocks is_ai from Helper score (§14).
--
-- What Phase 8 ADDS here is the OPERATIONAL layer that makes seeding + the
-- external API idempotent, auditable and resettable:
--   1. seed_runs      — a named, re-runnable seed batch (the AI/seed actor + a
--                       stable label so re-running the same batch is a no-op).
--   2. seed_entities  — the idempotency/dedup REGISTRY. One row per created
--                       seeded/external entity, keyed by a deterministic
--                       (entity_type, dedup_key). Powers "re-run without
--                       duplicates" for BOTH the seed scripts and the external
--                       REST/MCP write endpoints (external idempotency keys),
--                       and "reset a batch" (delete a run -> cascade its rows).
--   3. digest_editions — the weekly digest ledger. One row per ISO week
--                       (period_key unique) so the digest job is idempotent per
--                       period; links the pinned Plaza post + stores the
--                       deterministic, PII-free candidate snapshot.
--   4. api_keys.rate_limit_per_minute — optional per-key throttle override.
--
-- SECURITY POSTURE (unchanged from earlier phases):
--   * Every new table gets RLS enabled explicitly (the base schema's bulk
--     enable-RLS loop ran in phase1_auth; anything created after it must opt in
--     by hand — see the experience-expansion migration's note).
--   * All three registries are OPERATIONAL/ADMIN data: SELECT is admin-only,
--     and INSERT/UPDATE/DELETE are revoked from anon + authenticated (writes go
--     through the service role from audited API routes only — never a member).
--   * No reputation is touched. Seeded/AI content earns NO reputation (the seed
--     + external write paths never call award_reputation), so an AI account can
--     never climb a human leaderboard. Phase 7's is_ai Helper-score block stays.
--
-- No AI/LLM call happens in the DB. Scheduling stays on Vercel cron routes
-- (vercel.json), not pg_cron — same as every prior phase.

-- ============================================================================
-- 1. API KEYS — per-key rate-limit override; keep the table API-only
-- ============================================================================
-- api_keys already exists (Phase-0) with RLS enabled and NO policies, i.e. it
-- is fully locked to anon/authenticated (service_role bypasses RLS). That is
-- exactly the posture we want: key rows (which carry key_hash) are NEVER
-- client-readable; the management API returns a safe projection via the service
-- role. Make the write-lock explicit (parity with signup_grants/app_settings),
-- and add an optional per-key throttle override (null => the app default).
alter table api_keys
  add column rate_limit_per_minute smallint
    check (rate_limit_per_minute is null or rate_limit_per_minute between 1 and 6000);

revoke insert, update, delete on public.api_keys from anon, authenticated;
revoke insert, update, delete on public.webhook_endpoints from anon, authenticated;

-- ============================================================================
-- 2. SEED RUNS — a named, re-runnable seed batch
-- ============================================================================
create table seed_runs (
  id             uuid primary key default gen_random_uuid(),
  -- Stable identifier for the batch. Re-running the same labelled batch finds
  -- this row instead of creating a new one, which (with seed_entities) makes the
  -- whole seed operation idempotent.
  label          text not null unique,
  description    text,
  -- 'seed' = pre-launch density; 'ai' = AI-assistant generated. Never 'member'.
  source         content_source not null default 'seed',
  -- The badged AI/seed account rows are attributed to (posts.author_user_id etc.).
  actor_user_id  uuid references users (id),
  created_at     timestamptz not null default now(),
  constraint seed_runs_source_not_member check (source <> 'member')
);

alter table seed_runs enable row level security;

-- Admin-visible (the seed-review surface); writes are service-role-only.
create policy seed_runs_select_admin on seed_runs
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.seed_runs from anon, authenticated;

-- ============================================================================
-- 3. SEED ENTITIES — the idempotency / dedup REGISTRY
-- ============================================================================
-- One row per seeded or externally-created entity. The unique (entity_type,
-- dedup_key) is the idempotency guarantee: a re-run (seed script) or a retry
-- (external API with the same idempotency key) resolves to the existing row
-- instead of creating a duplicate.
--
-- dedup_key is a NAMESPACED deterministic string, so two different callers can
-- never collide:
--   * seed scripts:   'seed:<run_label>:<natural_key>'
--   * external API:   'ext:<api_key_id>:<client_idempotency_key>'
--
-- entity_id is nullable: the registry row can be claimed before the content row
-- exists (partial-failure recovery), then back-filled. entity_type is the
-- shared polymorphic enum (covers 'post' and 'listing'; entities that already
-- own a natural unique key — tags.name, labs.slug, lab_playbooks.slug — are
-- de-duplicated by that key directly and need no registry row).
create table seed_entities (
  id           uuid primary key default gen_random_uuid(),
  seed_run_id  uuid references seed_runs (id) on delete cascade,
  -- Which API key created it (external writes); null for local seed scripts.
  api_key_id   uuid references api_keys (id) on delete set null,
  dedup_key    text not null,
  entity_type  entity_type not null,
  entity_id    uuid,
  source       content_source not null default 'seed',
  created_at   timestamptz not null default now(),
  constraint seed_entities_dedup_uq unique (entity_type, dedup_key),
  constraint seed_entities_source_not_member check (source <> 'member')
);

create index seed_entities_run_idx on seed_entities (seed_run_id);
create index seed_entities_entity_idx on seed_entities (entity_type, entity_id);
create index seed_entities_api_key_idx on seed_entities (api_key_id) where api_key_id is not null;

alter table seed_entities enable row level security;

create policy seed_entities_select_admin on seed_entities
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.seed_entities from anon, authenticated;

-- ============================================================================
-- 4. DIGEST EDITIONS — weekly digest ledger (idempotent per ISO week)
-- ============================================================================
-- One row per ISO-week period (period_key unique, e.g. '2026-W28'). The digest
-- job upserts this row, so generating twice for the same week is a no-op. The
-- payload is the DETERMINISTIC, PII-free candidate snapshot (entity ids +
-- counts only — never names/handles/emails), so what shipped is auditable.
create table digest_editions (
  id              uuid primary key default gen_random_uuid(),
  period_key      text not null unique,
  period_start    date not null,
  period_end      date not null,
  status          text not null default 'generated'
                    check (status in ('generated', 'published')),
  -- The pinned Plaza post that carries the digest (source='ai', pinned_at set).
  pinned_post_id  uuid references posts (id) on delete set null,
  payload         jsonb not null default '{}'::jsonb,
  generated_at    timestamptz not null default now(),
  published_at    timestamptz,
  created_by      uuid references users (id),
  constraint digest_editions_period_order check (period_end >= period_start),
  constraint digest_editions_key_format check (period_key ~ '^[0-9]{4}-W[0-9]{2}$')
);

create index digest_editions_period_idx on digest_editions (period_start desc);

alter table digest_editions enable row level security;

create policy digest_editions_select_admin on digest_editions
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.digest_editions from anon, authenticated;
