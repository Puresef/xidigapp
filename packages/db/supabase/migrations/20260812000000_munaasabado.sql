-- Munaasabado P1 (frames 9a-9c, e1-e7; rulings 1/6, HANDOFF mechanics rows).
--
-- 1) Event covers ride the standard media pipeline (denormalized path+blurhash,
--    docs/lite-mode.md contract). 2) Capacity becomes a DB guarantee: the API
--    pre-check stays for friendly errors, but the BEFORE trigger serializes on
--    the event row so two simultaneous RSVPs can never oversell a seat — and a
--    cancel (row delete) releases it atomically. 3) RSVPs are named social
--    commitments (show_publicly defaults true; the UI states it). 4) Check-in
--    turns past events into records: "X qof ayaa yimid" comes from check-in,
--    else the going count. 5) content_source gains 'system' for vote-earned
--    award auto-posts (provenance is mandatory, never 'ai' which would claim
--    AI assistance). 6) Mentor-in-residence becomes bookable (Warshad-hosted,
--    free, N-minute slots); booker identity is column-scoped away from members.

-- 1. Event cover media kind + columns ---------------------------------------
insert into media_kinds (id, description)
values ('event_cover', 'Event cover (1600x600 inside, 480 thumb, still)')
on conflict (id) do nothing;

alter table events
  add column cover_path     text,
  add column cover_blurhash text,
  add column agenda         jsonb not null default '[]'::jsonb
    constraint events_agenda_is_array check (jsonb_typeof(agenda) = 'array');

-- The cover and agenda are public content (unlike venue_address/online_url):
-- extend the events column-scoped grant so member (RLS) reads can see them.
grant select (cover_path, cover_blurhash, agenda) on public.events to authenticated;

-- 2. Named RSVP default ------------------------------------------------------
alter table event_rsvps alter column show_publicly set default true;

-- 3. Check-in ----------------------------------------------------------------
alter table event_rsvps add column checked_in_at timestamptz;

-- 4. Atomic capacity guard ---------------------------------------------------
create function public.event_rsvps_capacity_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_capacity integer;
  v_going    integer;
begin
  if new.status <> 'going' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'going' then
    return new; -- already holds a seat
  end if;
  select capacity into v_capacity
    from public.events
    where id = new.event_id
    for update; -- serialize concurrent RSVPs on the same event
  if v_capacity is null then
    return new;
  end if;
  select count(*) into v_going
    from public.event_rsvps
    where event_id = new.event_id
      and status = 'going'
      and (tg_op = 'INSERT' or user_id <> new.user_id);
  if v_going >= v_capacity then
    raise exception 'event_full' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger event_rsvps_capacity
  before insert or update on event_rsvps
  for each row execute function public.event_rsvps_capacity_guard();

-- 5. System provenance value -------------------------------------------------
alter type content_source add value if not exists 'system';
-- (Never referenced elsewhere in THIS file: new enum values are unusable in the
--  same transaction that adds them.)

-- 6. Award results -----------------------------------------------------------
create table award_results (
  quarter      text not null references award_cycles (quarter) on delete cascade,
  category     award_category not null,
  target_type  entity_type not null,
  target_id    uuid not null,
  votes        integer not null check (votes > 0),
  evidence     jsonb not null default '{}'::jsonb,
  post_id      uuid references posts (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (quarter, category)
);
alter table award_results enable row level security;
create policy award_results_select_all on award_results
  for select to authenticated using (true);
revoke insert, update, delete on public.award_results from anon, authenticated;

-- 7. Mentor residencies: Warshad host + hours + slot length ------------------
alter table mentor_residencies
  add column lab_id       uuid references labs (id) on delete set null,
  add column hours_note   text,
  add column slot_minutes integer not null default 20
    constraint mentor_residencies_slot_minutes check (slot_minutes between 5 and 120);

-- 8. Mentor bookable slots ---------------------------------------------------
create table mentor_slots (
  id                 uuid primary key default gen_random_uuid(),
  residency_id       uuid not null references mentor_residencies (id) on delete cascade,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  booked_by_user_id  uuid references users (id) on delete set null,
  booked_at          timestamptz,
  created_at         timestamptz not null default now(),
  constraint mentor_slots_window check (ends_at > starts_at),
  constraint mentor_slots_booking_pair
    check ((booked_by_user_id is null) = (booked_at is null))
);
create index mentor_slots_residency_idx on mentor_slots (residency_id, starts_at);
create unique index mentor_slots_one_booking_per_member
  on mentor_slots (residency_id, booked_by_user_id)
  where booked_by_user_id is not null;

alter table mentor_slots enable row level security;
create policy mentor_slots_select_all on mentor_slots
  for select to authenticated using (true);
revoke all on public.mentor_slots from anon, authenticated;
-- Members see open/taken and their own booking through the API; the booker's
-- identity never reaches other members' clients:
grant select (id, residency_id, starts_at, ends_at, booked_at, created_at)
  on public.mentor_slots to authenticated;
