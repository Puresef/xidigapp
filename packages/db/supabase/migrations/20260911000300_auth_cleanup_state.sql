-- ============================================================================
-- Durable state for the §19 auth shutdown (owner-selected Option A).
--
-- After anonymise_user() commits, the member's GoTrue identity is banned and
-- its email replaced by a deterministic non-routable pseudonym (the UUID stays;
-- the phone is never touched — GoTrue cannot clear it; the identity is never
-- deleted). That happens in a SECOND system, outside the database
-- transaction, and can fail on its own. Until it succeeds, the deleted
-- account can still sign in and refresh tokens at GoTrue directly (observed on
-- Dev: both succeed after anonymisation), so a finished database transition
-- must never read as a finished deletion.
--
-- No existing field can express this: status = 'deleted' / anonymised_at say
-- the transaction committed, nothing about the provider; media_uploads.
-- purged_at is per-object. So three nullable columns on the lifecycle row:
--
--   auth_cleaned_at            set once GoTrue READ BACK as banned for a
--                              terminal horizon AND holding the pseudonym
--   auth_cleanup_attempted_at  last attempt (success or failure) — orders the
--                              reconciliation so one stuck account cannot
--                              starve the others
--   auth_cleanup_failure       coarse category of the last failure; null
--                              when never attempted or complete
--
--   pending   = status 'deleted' AND auth_cleaned_at IS NULL
--   failed    = pending AND auth_cleanup_failure IS NOT NULL (retryable)
--   complete  = auth_cleaned_at IS NOT NULL
--
-- Nothing identifying is stored: no address, phone, token or provider text —
-- only timestamps and one of four categories.
--
-- Additive, no backfill: every existing row is null, which for an already-
-- deleted account correctly means "owed", so the sweep picks those up too.
-- Client roles get no write path: users UPDATE is column-scoped to three
-- preference columns (20260704200000), so these are service-role-only. The
-- member can read their own row's values (table-level SELECT, users_select_own)
-- — timestamps and a category about their own account.
--
-- Fix-forward only.
-- ============================================================================

alter table public.users
  add column auth_cleaned_at           timestamptz,
  add column auth_cleanup_attempted_at timestamptz,
  add column auth_cleanup_failure      text;

alter table public.users
  -- Closed vocabulary (text + CHECK rather than an enum: a new category is a
  -- constraint swap, not a two-transaction ALTER TYPE).
  add constraint users_auth_cleanup_state_failure_known check (
    auth_cleanup_failure is null
    or auth_cleanup_failure in (
      'provider_unavailable',  -- network / timeout / 429 / 5xx — expected to clear
      'provider_rejected',     -- other 4xx — needs an operator, still retried
      'identity_missing',      -- GoTrue has no such user (the FK should prevent it)
      'verification_failed'    -- a write "succeeded" but did not read back as shut
    )
  ),
  -- The auth step only exists for an account that reached 'deleted'.
  add constraint users_auth_cleanup_state_deleted_only check (
    status = 'deleted'
    or (auth_cleaned_at is null and auth_cleanup_attempted_at is null and auth_cleanup_failure is null)
  ),
  -- Complete means complete.
  add constraint users_auth_cleanup_state_done_has_no_failure check (
    auth_cleaned_at is null or auth_cleanup_failure is null
  );

comment on column public.users.auth_cleaned_at is
  'Set when the GoTrue identity of this deleted account READ BACK as banned (terminal horizon) and holding the non-routable pseudonym email. Null on a deleted row = auth shutdown still owed. Written only by the §19 lifecycle sweep.';
comment on column public.users.auth_cleanup_attempted_at is
  'Last auth-shutdown attempt for this deleted account (success or failure). Orders the reconciliation, never-attempted first.';
comment on column public.users.auth_cleanup_failure is
  'Coarse category of the last failed auth-shutdown attempt; null when complete or never attempted. Never holds provider text or identifiers.';

-- The reconciliation query: deleted accounts whose auth shutdown is owed,
-- never-attempted first, then least-recently attempted.
create index users_auth_cleanup_pending_idx
  on public.users (auth_cleanup_attempted_at nulls first)
  where status = 'deleted' and auth_cleaned_at is null;
