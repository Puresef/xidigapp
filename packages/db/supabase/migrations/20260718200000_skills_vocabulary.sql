-- ============================================================================
-- Skills vocabulary — turn the free-text profiles.skills into a normalized,
-- self-maintaining vocabulary with a live member_count for count-guided
-- autocomplete ("ecommerce · 10k" vs "e-com · 1" steers members to the
-- canonical token, so matching/endorsements stop fragmenting).
-- ============================================================================
-- profiles.skills stays a text[] (non-breaking) but is now NORMALIZED on write
-- (lowercase, trimmed, de-duplicated) and MIRRORED into a `skills` table that
-- carries member_count. The count is maintained by a trigger as profiles change,
-- so the autocomplete just reads `skills` ordered by popularity. New skills are
-- born from a profile save (instant-create); the table is member-readable but
-- client-write-revoked like every other taxonomy.

-- Canonical normaliser: lowercase, trim, drop empties/over-long, de-dup, sort.
create or replace function public.normalize_skills(arr text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct s order by s), '{}'::text[])
  from (
    select btrim(lower(x)) as s
    from unnest(coalesce(arr, '{}'::text[])) as x
  ) normalized
  where s <> '' and char_length(s) <= 40
$$;

create table skills (
  name          citext primary key
                  constraint skills_name_format check (
                    char_length(name::text) between 1 and 40
                    and name::text = btrim(lower(name::text))
                  ),
  member_count  integer not null default 0 check (member_count >= 0),
  -- 'seed' for the shipped starter set; 'member' once a member coins one.
  source        content_source not null default 'member',
  created_at    timestamptz not null default now()
);

-- Popularity order for autocomplete + a trigram index for substring search.
create index skills_count_idx on skills (member_count desc, name);
create index skills_name_trgm_idx on skills using gin ((name::text) gin_trgm_ops);

alter table skills enable row level security;

create policy skills_select_authenticated on skills
  for select to authenticated
  using (true);

revoke insert, update, delete on public.skills from anon, authenticated;

-- BEFORE: normalize profiles.skills so what is stored is always canonical
-- (defense in depth — even a direct/legacy write is normalized).
create or replace function public.tg_normalize_profile_skills()
returns trigger
language plpgsql
as $$
begin
  new.skills := public.normalize_skills(new.skills);
  return new;
end
$$;

create trigger profiles_normalize_skills
  before insert or update of skills on profiles
  for each row execute function public.tg_normalize_profile_skills();

-- AFTER: reconcile skills.member_count from the delta. SECURITY DEFINER so it
-- can write the client-locked `skills` table on behalf of a member editing
-- their own (RLS-allowed) profile row.
create or replace function public.tg_reconcile_skill_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_skills text[] := case when tg_op = 'INSERT' then '{}'::text[] else coalesce(old.skills, '{}'::text[]) end;
  new_skills text[] := case when tg_op = 'DELETE' then '{}'::text[] else coalesce(new.skills, '{}'::text[]) end;
  s text;
begin
  -- Added: create-or-increment.
  for s in select unnest(new_skills) except select unnest(old_skills) loop
    insert into public.skills as sk (name, member_count, source)
    values (s, 1, 'member')
    on conflict (name) do update set member_count = sk.member_count + 1;
  end loop;
  -- Removed: decrement, floored at zero.
  for s in select unnest(old_skills) except select unnest(new_skills) loop
    update public.skills set member_count = greatest(0, member_count - 1) where name = s;
  end loop;
  return null;
end
$$;

create trigger profiles_reconcile_skill_counts
  after insert or delete or update of skills on profiles
  for each row execute function public.tg_reconcile_skill_counts();

-- Seed a canonical starter vocabulary (member_count 0) so autocomplete offers
-- correct spellings from day one — the anti-fragmentation anchor. Somali
-- diaspora / SME relevant, professions + skills mixed (the field takes both).
insert into skills (name, source) values
  ('software development','seed'), ('web development','seed'), ('mobile development','seed'),
  ('javascript','seed'), ('typescript','seed'), ('react','seed'), ('python','seed'),
  ('node.js','seed'), ('sql','seed'), ('data analysis','seed'), ('machine learning','seed'),
  ('devops','seed'), ('cybersecurity','seed'), ('cloud computing','seed'),
  ('ui design','seed'), ('ux design','seed'), ('graphic design','seed'), ('product design','seed'),
  ('product management','seed'), ('project management','seed'), ('business development','seed'),
  ('sales','seed'), ('marketing','seed'), ('digital marketing','seed'), ('social media','seed'),
  ('seo','seed'), ('content writing','seed'), ('copywriting','seed'), ('translation','seed'),
  ('teaching','seed'), ('tutoring','seed'), ('accounting','seed'), ('bookkeeping','seed'),
  ('finance','seed'), ('consulting','seed'), ('research','seed'), ('medicine','seed'),
  ('nursing','seed'), ('pharmacy','seed'), ('law','seed'), ('civil engineering','seed'),
  ('mechanical engineering','seed'), ('electrical engineering','seed'), ('architecture','seed'),
  ('construction','seed'), ('agriculture','seed'), ('logistics','seed'), ('photography','seed'),
  ('videography','seed'), ('video editing','seed'), ('public speaking','seed'),
  ('leadership','seed'), ('fundraising','seed'), ('carpentry','seed'), ('tailoring','seed'),
  ('driving','seed'), ('welding','seed'), ('plumbing','seed')
on conflict (name) do nothing;
