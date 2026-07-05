-- Phase 1 member UI: transliteration-tolerant directory search (§18).
--
-- Acceptance: "Directory fuzzy search returns results for transliteration
-- variants (e.g. Maxamed / Mohamed)". Phase 1 ships a LIGHTWEIGHT
-- normalization layer (not §24 Meilisearch): names fold to a canonical
-- skeleton on both the stored side (generated columns below) and the query
-- side (apps/web/src/lib/search-norm.ts), then match by substring ilike.
--
-- xidig_name_norm MUST stay byte-for-byte equivalent to normalizeSearchName
-- in apps/web/src/lib/search-norm.ts — both sides fold independently, so any
-- divergence silently breaks matching. Folding: lower → dh→d, kh→k → x→h →
-- non-alphanumerics→space → c dropped (ayn) → e,i,o,u→a → q→k → collapse
-- repeated chars → trim. Examples: Maxamed/Mohamed/Mohammed → "mahamad";
-- Cali/Ali → "ala"; Khadiija/Khadija → "kadaja".

create extension if not exists pg_trgm;

-- Only pg_catalog built-ins inside — safe under search_path = '' and
-- immutable, which the generated columns require.
create or replace function public.xidig_name_norm(input text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select trim(
    regexp_replace(
      translate(
        regexp_replace(
          replace(replace(replace(lower(coalesce(input, '')), 'dh', 'd'), 'kh', 'k'), 'x', 'h'),
          '[^a-z0-9 ]', ' ', 'g'
        ),
        'ceiouq',
        ' aaaak'
      ),
      '(.)\1+', '\1', 'g'
    )
  );
$$;

comment on function public.xidig_name_norm(text) is
  'Somali/English transliteration folding for §18 directory search. Twin of apps/web/src/lib/search-norm.ts normalizeSearchName — keep byte-for-byte equivalent.';

-- Stored generated columns so PostgREST filters (`search_norm ilike ...`)
-- work without RPC. display_name + handle fold together for people search.
alter table public.profiles
  add column if not exists search_norm text
  generated always as (public.xidig_name_norm(display_name || ' ' || handle::text)) stored;

alter table public.business_listings
  add column if not exists search_norm text
  generated always as (public.xidig_name_norm(business_name)) stored;

-- profiles SELECT is column-granted (phase1_auth revoked table-wide select);
-- the new column must join the authenticated whitelist to be filterable.
grant select (search_norm) on public.profiles to authenticated;

-- Substring (%term%) matching wants trigram GIN, not btree.
create index if not exists profiles_search_norm_trgm_idx
  on public.profiles using gin (search_norm gin_trgm_ops);
create index if not exists listings_search_norm_trgm_idx
  on public.business_listings using gin (search_norm gin_trgm_ops);
