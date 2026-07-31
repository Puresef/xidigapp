-- ============================================================================
-- Task 11 (full-quality pass) — verified-first directory sort support
-- ============================================================================
-- Published sort rule (§18 directory, chronological-honesty constraint):
-- verified listings first, then most recently updated (updated_at DESC,
-- id DESC tiebreaker).
--
-- WHY a generated boolean and not ORDER BY verification_status: the enum's
-- declaration order is unverified < pending < verified, so ordering by the
-- enum DESC would rank 'pending' as a middle tier above 'unverified' — not
-- the published rule ("verified first, everything else by recency"). A
-- STORED generated boolean collapses the non-verified states into one tier,
-- is keyset-friendly (the v2 cursor carries it), PostgREST-orderable, and
-- indexable. Precedent: the stored generated search_norm columns
-- (20260705010000). It also tracks revocations for free — flip the status,
-- the tier flips with it.

alter table public.business_listings
  add column is_verified boolean generated always as (verification_status = 'verified') stored;

-- The expression can never yield null (verification_status is NOT NULL);
-- saying so lets generated types expose a plain boolean.
alter table public.business_listings alter column is_verified set not null;

comment on column public.business_listings.is_verified is
  'Generated: verification_status = ''verified''. Sort tier for the '
  'directory''s published verified-first ordering (Task 11).';

-- Composite index matching the sort + keyset walk exactly:
-- (is_verified DESC, updated_at DESC, id DESC). Not partial: the directory
-- query has no literal status filter (RLS supplies published + own + mod),
-- so a `where status = 'published'` predicate could never be matched by the
-- planner.
create index listings_verified_sort_idx
  on public.business_listings (is_verified desc, updated_at desc, id desc);
