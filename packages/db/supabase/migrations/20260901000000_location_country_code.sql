-- ============================================================================
-- Somalia-gate input hardening: profiles.location_country_code
--
-- profiles.location_country is member-facing DISPLAY text (free text, rendered
-- raw in the directory, OG images, and Aniga) — but the Maalgeli region gate
-- was reading it verbatim and requiring it to equal ISO 'so', so a member who
-- typed "Somalia" or "Soomaaliya" silently failed the gate (country_mismatch)
-- even when geo-IP and attestation agreed. This adds a derived, server-owned
-- location_country_code column for the gate to read. The display string is
-- NEVER rewritten.
--
-- The fold is deliberately tiny, NOT a gazetteer: 2-letter inputs are taken as
-- ISO 3166-1 alpha-2 verbatim (lowercased), the Somalia name/transliteration
-- variants map to 'so', anything else is null (unknown). Other markets get
-- their aliases if/when a market ever needs gating (§25.5: extensible
-- architecture, no global launch features).
--
-- The fold runs as a TRIGGER (not app-layer) because location_country is
-- directly writable by authenticated members via the phase-1 §6 column grants —
-- a PostgREST write bypasses the API, so only the DB can keep the derived
-- column in sync. No client grant is added for the new column: it is
-- compliance-derived state read by the service-role gate path only (the §6
-- column-scoped SELECT grant list is unchanged, so clients cannot read it).
-- ============================================================================

alter table public.profiles
  add column if not exists location_country_code text
  constraint profiles_location_country_code_format
    check (location_country_code is null or location_country_code ~ '^[a-z]{2}$');

comment on column public.profiles.location_country_code is
  'Server-derived ISO 3166-1 alpha-2 fold of location_country (trigger-maintained; null = unrecognized). Read by the Capital region gate — never client-writable, never shown as display text.';

create or replace function public.fold_country_code(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or btrim(raw) = '' then null
    when btrim(lower(raw)) ~ '^[a-z]{2}$' then btrim(lower(raw))
    when btrim(lower(raw)) in
      ('som', 'somalia', 'somali', 'soomaaliya', 'soomaliya', 'soomaali')
      then 'so'
    else null
  end
$$;

-- Pure helper, but revoke-by-default like the rest of the hardening posture —
-- no reason to hand anon an RPC that enumerates the gate's alias list. The
-- trigger runs as owner and needs no caller EXECUTE.
revoke all on function public.fold_country_code(text) from public, anon, authenticated;
grant execute on function public.fold_country_code(text) to service_role;

-- Vocabulary note for the §17 compliance log: capital_gate_evaluations.
-- profile_country rows from this migration onward store the FOLDED code (the
-- value the gate actually compared); earlier rows hold the raw display
-- string. Ops queries over the log must account for both forms.
comment on column public.capital_gate_evaluations.profile_country is
  'The profile-country input the gate evaluated. Rows before Sep 2026 store the raw display string; later rows store the fold_country_code() output (ISO alpha-2 or null).';

-- SECURITY DEFINER (empty search_path, fully-qualified body): the trigger
-- fires for ordinary member writes, and fold_country_code() is deliberately
-- NOT executable by anon/authenticated (revoked above) — the definer context
-- is what lets the trigger call it while the RPC surface stays closed.
create or replace function public.tg_profiles_fold_country_code()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Always recompute from the display text: the derived column can never be
  -- set independently, by any role, through any write path.
  new.location_country_code := public.fold_country_code(new.location_country);
  return new;
end
$$;

create trigger profiles_fold_country_code
  before insert or update on public.profiles
  for each row execute function public.tg_profiles_fold_country_code();

-- Backfill existing rows (every future write goes through the trigger). The
-- updated_at trigger is suspended for the sweep — a derived-column backfill is
-- not a member edit, and updated_at is client-visible; only rows whose fold is
-- non-null are touched at all.
alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles
  set location_country_code = public.fold_country_code(location_country)
  where public.fold_country_code(location_country) is not null;
alter table public.profiles enable trigger profiles_set_updated_at;
