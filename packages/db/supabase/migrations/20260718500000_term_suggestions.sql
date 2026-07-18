-- ============================================================================
-- Term suggestions — "suggest → admin" for the SHARED-COORDINATE taxonomies
-- (lanes, listing categories) that must NOT allow instant user-create. A member
-- proposes a term; an admin approves (the term lands in the target taxonomy) or
-- declines. This is the governed counterpart to the instant-create used for the
-- descriptive taxonomies (skills, tags).
-- ============================================================================

create type term_suggestion_kind as enum ('lane', 'listing_category');
create type term_suggestion_status as enum ('pending', 'approved', 'declined');

create table term_suggestions (
  id            uuid primary key default gen_random_uuid(),
  kind          term_suggestion_kind not null,
  term          text not null
                  constraint term_suggestions_term_len check (char_length(btrim(term)) between 2 and 40),
  note          text constraint term_suggestions_note_len check (note is null or char_length(note) <= 280),
  suggested_by  uuid not null references users (id) on delete cascade,
  status        term_suggestion_status not null default 'pending',
  resolved_by   uuid references users (id) on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Dedupe the queue: one OPEN suggestion per (kind, normalized term).
create unique index term_suggestions_open_uq
  on term_suggestions (kind, lower(btrim(term)))
  where status = 'pending';
create index term_suggestions_status_idx on term_suggestions (status, created_at desc);
create index term_suggestions_by_idx on term_suggestions (suggested_by);

alter table term_suggestions enable row level security;

-- A member reads their own suggestions; admins read the whole queue.
create policy term_suggestions_select_own on term_suggestions
  for select to authenticated
  using (suggested_by = (select auth.uid()));

create policy term_suggestions_select_admin on term_suggestions
  for select to authenticated
  using (public.is_admin());

-- A member (active) may file their own PENDING suggestion. Resolution columns +
-- status are NOT client-grantable (column-scoped grant), so a member can never
-- self-approve; approve/decline runs through the admin API (service role).
create policy term_suggestions_insert_own on term_suggestions
  for insert to authenticated
  with check (
    suggested_by = (select auth.uid())
    and public.is_active_account()
  );

revoke insert, update, delete on public.term_suggestions from anon, authenticated;
grant insert (kind, term, note, suggested_by) on public.term_suggestions to authenticated;
