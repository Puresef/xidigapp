-- ============================================================================
-- Front door, Phase A (docs/front-door-plan.md §5) — waitlist attribution.
--
-- The waitlist is the front door's funnel spine: every "Request Access" CTA
-- carries ?from=<page>, captured here so conversion is measurable per source
-- page with zero cookies and zero identifiers (§5.1). `updates_only` marks
-- contacts who want product updates but are NOT requesting a membership spot
-- (the honest capture lane for reports readers until the digest email rail
-- ships) — invite ops must skip these when minting invites.
--
-- Additive only; RLS on waitlist_entries is unchanged (service-role only).
-- ============================================================================

alter table waitlist_entries
  add column source_page text
    constraint waitlist_source_page_shape check (
      source_page is null or source_page ~ '^[a-z0-9/_-]{1,64}$'
    ),
  add column updates_only boolean not null default false;

comment on column waitlist_entries.source_page is
  'Front-door CTA attribution (?from=<page>) — plain route-ish token, no PII.';
comment on column waitlist_entries.updates_only is
  'Contact wants updates only, not a membership spot; skip when inviting.';
