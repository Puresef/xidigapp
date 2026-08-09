-- Codsi (Ask) lifecycle — helper model, offers, Garab (P1 Codsi detail
-- dispatch; HANDOFF-P1 "Codsi detail" row + acceptance criteria).
--
-- Model change: the Phase-2 credit-an-answer flow (asker credits a comment,
-- open → answered → closed) becomes the helper flow — offers arrive as
-- PRIVATE DMs, the asker accepts one, the helper is named publicly
-- ("Waxaa caawinaya …"), and the asker alone marks the ask fulfilled.
--
--   * Transitions stay API-only: posts have no client write grants (Phase 2),
--     and the route enforces author_user_id = caller. RLS + UI per the
--     acceptance criterion "lifecycle transitions rejected for non-asker".
--   * post_offers is the private offer record — visible ONLY to the asker
--     and the offerer (offer = private DM, no public count), writes API-only.
--   * post_cosigns is Garab on a resolved ask — the ONE client-writable
--     Codsi table. Its WITH CHECK is the product law "Garab exists only
--     post-fulfilled". Reads are own-row-only: counts leave through the
--     service-role aggregate and render only after the viewer takes part
--     (reaction-count precedent, DESIGN.md §4 social honesty).
--   * comments.is_credited_answer is retired from writes but KEPT as
--     history — pre-migration credits still render their badge, and the
--     backfill below promotes them to the helper seat.

-- ---------------------------------------------------------------------------
-- Helper columns + legacy trace

alter table posts
  add column ask_helper_user_id uuid references users (id) on delete set null,
  add column ask_helped_at      timestamptz,
  add column ask_fulfilled_at   timestamptz,
  -- Pre-migration ask_status value for rows this migration rewrote — the
  -- dictionary-migration "legacy backfill" audit trail (null = row was never
  -- rewritten).
  add column legacy_ask_status  text;

-- Helper fields belong to asks alone (mirrors posts_ask_status_only_for_asks).
alter table posts
  add constraint posts_ask_helper_only_for_asks check (
    type = 'ask'
    or (ask_helper_user_id is null and ask_helped_at is null and ask_fulfilled_at is null)
  );

-- "Waa la caawinayaa" is a claim about a PERSON — in_progress without a named
-- helper would be an anonymous claim the UI can't render honestly.
alter table posts
  add constraint posts_ask_in_progress_has_helper check (
    ask_status is distinct from 'in_progress' or ask_helper_user_id is not null
  );

-- §14 anti-gaming: no points from self-interactions — structurally.
alter table posts
  add constraint posts_ask_helper_not_author check (
    ask_helper_user_id is null or ask_helper_user_id <> author_user_id
  );

create index posts_ask_helper_idx on posts (ask_helper_user_id)
  where ask_helper_user_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill: answered → fulfilled, credited answerer → named helper
--
-- The old flow's "credited answer" IS the helper credit (§14/§15) — the
-- credited comment's author takes the helper seat, timestamped by their
-- comment; fulfilment is stamped with the row's last update as the closest
-- surviving signal. Self-credit was refused by the old route, but the update
-- guards anyway so the new CHECK can never fire mid-migration.

update posts p
set legacy_ask_status  = 'answered',
    ask_status         = 'fulfilled',
    ask_helper_user_id = c.author_user_id,
    ask_helped_at      = c.created_at,
    ask_fulfilled_at   = coalesce(p.updated_at, p.created_at)
from comments c
where p.type = 'ask'
  and p.ask_status = 'answered'
  and c.post_id = p.id
  and c.is_credited_answer
  and c.author_user_id <> p.author_user_id;

-- Answered rows whose credited comment is gone (deleted account edge):
-- still resolved, just nobody left to name.
update posts
set legacy_ask_status = 'answered',
    ask_status        = 'fulfilled',
    ask_fulfilled_at  = coalesce(updated_at, created_at)
where type = 'ask'
  and ask_status = 'answered';

-- ---------------------------------------------------------------------------
-- post_offers — "Waan caawin karaa" (offer = private DM, no public count)

create table post_offers (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts (id) on delete cascade,
  helper_user_id  uuid not null references users (id) on delete cascade,
  -- The Fariimo thread the offer opened (startConversation) — the asker's
  -- "Fur fariinta" link. Nullable: the DM can outlive or predate the offer.
  conversation_id uuid references conversations (id) on delete set null,
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  unique (post_id, helper_user_id)
);

create index post_offers_post_idx on post_offers (post_id, created_at desc);

alter table post_offers enable row level security;

-- Exactly two people may know an offer exists: the offerer and the asker.
-- No count, no enumeration, no public artifact (HANDOFF acceptance: the only
-- public trace of the offer flow is the helper strip after acceptance).
create policy post_offers_select_participants on post_offers
  for select to authenticated
  using (
    helper_user_id = (select auth.uid())
    or exists (
      select 1 from posts p
      where p.id = post_offers.post_id
        and p.author_user_id = (select auth.uid())
    )
  );

-- Writes are API-only (offer creation pairs with the DM send; acceptance is
-- the asker's lifecycle transition) — same model as posts/comments.
revoke all on public.post_offers from anon;
revoke insert, update, delete on public.post_offers from authenticated;

-- ---------------------------------------------------------------------------
-- post_cosigns — Garab on a resolved Codsi (D3 dabqaad, never a like)

create table post_cosigns (
  post_id    uuid not null references posts (id) on delete cascade,
  user_id    uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table post_cosigns enable row level security;

-- The WITH CHECK is the product rule: Garab exists only post-fulfilled, on a
-- published ask the viewer can actually see (posts RLS applies inside the
-- subquery, so lab-scoped asks stay garab-able only by who can read them).
create policy post_cosigns_insert_own_fulfilled on post_cosigns
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from posts p
      where p.id = post_cosigns.post_id
        and p.type = 'ask'
        and p.ask_status = 'fulfilled'
        and p.status = 'published'
    )
  );

-- Own-rows only, both directions: the count is a service-role aggregate
-- ("Tiradu waxay muuqataa oo keliya markaad ka qaybqaadato" — the number
-- shows only once you take part), never a client-side enumeration.
create policy post_cosigns_select_own on post_cosigns
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy post_cosigns_delete_own on post_cosigns
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.post_cosigns from anon;
revoke update on public.post_cosigns from authenticated;
