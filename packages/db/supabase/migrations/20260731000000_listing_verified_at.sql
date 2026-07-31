-- ============================================================================
-- Task 11 (full-quality pass) — denormalized business_listings.verified_at
-- ============================================================================
-- The Verified chip becomes an explainer ("Checked: {date}") and the §18
-- directory needs the date without joining `verifications` — whose SELECT
-- grant is deliberately column-scoped to the member's OWN rows (Seq 49.5,
-- 20260718000000) and must NOT be widened. Denormalizing onto the listing
-- follows the primary_photo_* precedent (20260706300000): a derived,
-- service-role-maintained column beside the content it describes.
--
-- Writable by service role only: business_listings INSERT/UPDATE grants are
-- column-scoped (20260704210000 + 20260706300000) and verified_at is NOT
-- added to them. SELECT on business_listings is the default table-level
-- grant, so the new column is readable like verification_status itself.

alter table public.business_listings
  add column verified_at timestamptz;

comment on column public.business_listings.verified_at is
  'When the listing''s business verification was approved (denormalized from '
  'verifications.decided_at; null while unverified). Maintained by the '
  'approve handler + sync trigger — never client-writable.';

-- --- Backfill from approved business verifications ---------------------------
-- Latest approved decision per listing. Only rows still marked 'verified'
-- get a date: a listing whose status was later reset stays null (the trigger
-- below keeps it that way going forward). set_updated_at is disabled around
-- the backfill so a metadata-only migration does not churn updated_at — the
-- new directory sort is recency-based and a mass touch would scramble it.

alter table public.business_listings disable trigger business_listings_set_updated_at;

update public.business_listings bl
set verified_at = v.decided_at
from (
  select listing_id, max(decided_at) as decided_at
  from public.verifications
  where type = 'business' and status = 'approved'
    and listing_id is not null and decided_at is not null
  group by listing_id
) v
where bl.id = v.listing_id
  and bl.verification_status = 'verified';

alter table public.business_listings enable trigger business_listings_set_updated_at;

-- --- Keep verified_at consistent with verification_status --------------------
-- The approve handler (api/admin/verifications/[id]) stamps verified_at
-- explicitly alongside the status flip. There is NO dedicated revoke route
-- today (`revoke_verification` exists in mod_action_type as a ledger entry
-- only), so the "null it when verification is revoked" rule is enforced
-- structurally: ANY transition out of 'verified' — a future revoke flow, a
-- moderation action, a manual correction — clears the date, and a transition
-- into 'verified' that forgot to stamp gets now() as a backstop. BEFORE
-- trigger, so it composes with set_updated_at and costs one comparison.

create or replace function public.sync_listing_verified_at()
returns trigger
language plpgsql
as $$
begin
  if new.verification_status = 'verified' then
    if old.verification_status is distinct from 'verified' then
      new.verified_at = coalesce(new.verified_at, now());
    end if;
  else
    new.verified_at = null;
  end if;
  return new;
end;
$$;

create trigger business_listings_sync_verified_at
  before update on public.business_listings
  for each row execute function public.sync_listing_verified_at();
