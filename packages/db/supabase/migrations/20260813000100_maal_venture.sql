-- Maal P1 — venture workspace: goal, workstreams, task board, the contribution
-- ledger, the declared capital need, and the system-timeout demotion path.
-- Frames 7a-7g + states m1-m5; HANDOFF rows "Maal index/overview/work/ledger/
-- capital"; DECISIONS-2026-08-06 rulings 1, 2, 4, 5; docs/maal-f2-prereqs.md.
--
-- The shape of the thing:
--
-- 1) A Maal is a Warshad that declared a goal and switched on the org tools. The
--    goal lives on `labs` (statement + target + unit + progress) because it is a
--    property of the space, not a separate object.
-- 2) Work is `venture_workstreams` (a named owner or an open seat) and
--    `venture_tasks` (open -> claimed -> submitted -> attested -> verified). A
--    lead cannot attest or verify their own task — recusal is a DB CHECK, not a
--    UI convention.
-- 3) `work_events` is the ledger and it is the serious part. Append-only, and
--    hash-chained per lab so that "nothing was rewritten" is something a member
--    can VERIFY rather than something we assert. A correction is a new event
--    with negative quantity pointing at what it reverses; the original stays
--    exactly where it was. UPDATE and DELETE are refused for every role
--    including service_role — a revoke alone would still leave a dashboard
--    session able to rewrite history (the Phase 6 reasoning, reused).
-- 4) Money exists in the ledger as a recorded-never-executed contribution type
--    and as a declared need with the decision behind it. There is deliberately
--    NO pledge table: pledge controls ship built-and-disabled (ruling: escrow
--    does not exist yet), and a table would imply a movement we cannot make.
-- 5) Share % is never stored. It is read out of the events by
--    `venture_contribution_tally()` so that changing the (member-voted) weight
--    scheme re-reads history instead of rewriting it. Ruling 5: ledger units are
--    economic and member-voted; reputation gates nomination only — it never
--    weights a vote and never becomes an economic unit. One verified member,
--    one vote.
-- 6) Demotion (ruling 2) is a real code path now, not a comment: a timed-out
--    Maal returns to Warshad by the system role only, is announced before it
--    happens, is written to the public Governance Log, and preserves the work
--    history in full — only the current stage changes.

-- 1. Venture goal + member-set visibility + demotion bookkeeping -------------
-- `hours_visibility` is the 7b toggle "Saacadaha hoggaamiyayaasha kaliya"; it is
-- enforced in RLS below, not merely hidden in a projection. Its own enum rather
-- than lab_visibility, which carries a 'public' value that would be a wrong
-- answer for a ledger.
create type venture_scope as enum ('members', 'leads');

alter table labs
  add column goal_statement      text,
  add column goal_unit           text,
  add column goal_target         integer check (goal_target is null or goal_target > 0),
  add column goal_progress       integer not null default 0 check (goal_progress >= 0),
  add column venture_since       timestamptz,
  add column ledger_visibility   venture_scope not null default 'members',
  add column hours_visibility    venture_scope not null default 'members',
  add column demotion_warned_at  timestamptz,
  add column demoted_at          timestamptz;

comment on column labs.venture_since is
  'When this space became a Maal. Survives demotion: history is never rewritten.';
comment on column labs.demoted_at is
  'Last system-timeout demotion (ruling 2). Member-initiated demotion does not exist.';

-- No column grant needed: unlike `events`, `labs` is not column-scoped — its
-- SELECT is table-wide and gated by the labs_select_readable policy. The goal is
-- public-facing anyway (7e shows it before you join).

-- 7e: an applicant picks the workstream they want to work in.
alter table lab_members add column requested_workstream_id uuid;

-- 2. Workstreams --------------------------------------------------------------
create type venture_workstream_status as enum ('active', 'waiting');

create table venture_workstreams (
  id            uuid primary key default gen_random_uuid(),
  lab_id        uuid not null references labs (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 80),
  owner_user_id uuid references users (id) on delete set null,
  status        venture_workstream_status not null default 'active',
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index venture_workstreams_lab_idx on venture_workstreams (lab_id, position);
create unique index venture_workstreams_name_uq on venture_workstreams (lab_id, lower(name));

alter table lab_members
  add constraint lab_members_requested_workstream_fk
  foreign key (requested_workstream_id) references venture_workstreams (id) on delete set null;

-- 3. Task board ---------------------------------------------------------------
-- Board columns (7c): Qorshe = open, Socda = claimed, "Marag & ansixin" =
-- submitted|attested, Dhammaystiran = verified.
create type venture_task_status as enum ('open', 'claimed', 'submitted', 'attested', 'verified');

create table venture_tasks (
  id                 uuid primary key default gen_random_uuid(),
  lab_id             uuid not null references labs (id) on delete cascade,
  workstream_id      uuid references venture_workstreams (id) on delete set null,
  title              text not null check (length(btrim(title)) between 1 and 200),
  status             venture_task_status not null default 'open',
  assignee_user_id   uuid references users (id) on delete set null,
  created_by_user_id uuid references users (id) on delete set null,
  attested_by_user_id uuid references users (id) on delete set null,
  verified_by_user_id uuid references users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Recusal, at the storage layer: you cannot witness or approve your own work.
  constraint venture_tasks_attester_recusal
    check (attested_by_user_id is null or attested_by_user_id <> assignee_user_id),
  constraint venture_tasks_verifier_recusal
    check (verified_by_user_id is null or verified_by_user_id <> assignee_user_id),
  constraint venture_tasks_claimed_has_assignee
    check (status = 'open' or assignee_user_id is not null)
);
create index venture_tasks_board_idx on venture_tasks (lab_id, status, updated_at desc);
create index venture_tasks_workstream_idx on venture_tasks (workstream_id)
  where workstream_id is not null;

-- 4. Weight scheme ------------------------------------------------------------
-- Recorded, versioned, and pointed at the decision that set it. Changing the
-- weights inserts a new row; every past event keeps the weight it was recorded
-- with, so re-weighting re-reads history instead of editing it.
create table venture_weight_schemes (
  id             uuid primary key default gen_random_uuid(),
  lab_id         uuid not null references labs (id) on delete cascade,
  weights        jsonb not null,
  decision_id    uuid references lab_decisions (id) on delete set null,
  effective_from timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint venture_weight_schemes_is_object check (jsonb_typeof(weights) = 'object')
);
create index venture_weight_schemes_lab_idx
  on venture_weight_schemes (lab_id, effective_from desc);

-- 5. The ledger ---------------------------------------------------------------
-- 'money' is present and recorded; it is never executed. See §7 below and the
-- capital surface: the structure is honest about what it cannot do yet.
create type work_event_type as enum ('hours', 'code', 'design', 'intro', 'money');

create table work_events (
  id                 uuid primary key default gen_random_uuid(),
  lab_id             uuid not null references labs (id) on delete cascade,
  seq                bigint not null,
  member_user_id     uuid not null references users (id) on delete cascade,
  event_type         work_event_type not null,
  quantity           numeric(12,2) not null check (quantity <> 0),
  unit_weight        integer not null check (unit_weight >= 0),
  units              integer not null,
  task_id            uuid references venture_tasks (id) on delete set null,
  note               text check (note is null or length(note) <= 400),
  occurred_at        timestamptz not null,
  recorded_at        timestamptz not null default now(),
  recorded_by_user_id uuid references users (id) on delete set null,
  reverses_event_id  uuid references work_events (id) on delete restrict,
  prev_hash          text not null,
  hash               text not null,
  -- A correction is the only way to take something back, and it is itself an
  -- event: negative quantity, pointing at what it reverses. Everything else is
  -- positive. One rule, both directions.
  constraint work_events_reversal_sign
    check ((reverses_event_id is not null) = (quantity < 0)),
  constraint work_events_units_follow_weight
    check (units = round(quantity * unit_weight))
);
create unique index work_events_seq_uq on work_events (lab_id, seq);
create unique index work_events_reversal_once_uq on work_events (reverses_event_id)
  where reverses_event_id is not null;
create index work_events_member_idx on work_events (lab_id, member_user_id);
create index work_events_occurred_idx on work_events (lab_id, occurred_at desc);
create index work_events_task_idx on work_events (task_id) where task_id is not null;

comment on table work_events is
  'Append-only, hash-chained contribution ledger. Corrections are reversal events; '
  'UPDATE and DELETE are refused for every role. Share % is never stored here.';

-- Witness. "Marag" on 7c/7g. A member co-sign or a lead's approval; never your own.
create table work_event_attestations (
  work_event_id     uuid not null references work_events (id) on delete cascade,
  attester_user_id  uuid not null references users (id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (work_event_id, attester_user_id)
);
create index work_event_attestations_attester_idx
  on work_event_attestations (attester_user_id);

-- 5a. Chain assignment -------------------------------------------------------
-- seq and both hashes are assigned here, never by the caller. Serializing on the
-- lab row is the same device the RSVP capacity guard uses: two concurrent
-- contribution logs on one venture cannot both claim the same seq, and a chain
-- with a duplicated link is not a chain.
create function public.work_events_assign_chain()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_prev_hash text;
  v_seq       bigint;
  v_payload   text;
begin
  perform 1 from public.labs where id = new.lab_id for update;

  select we.hash, we.seq
    into v_prev_hash, v_seq
    from public.work_events we
    where we.lab_id = new.lab_id
    order by we.seq desc
    limit 1;

  new.seq       := coalesce(v_seq, 0) + 1;
  new.prev_hash := coalesce(v_prev_hash, 'genesis');

  -- Every field a reader would care about is inside the digest. Field order is
  -- fixed and must never be reordered: the chain of every existing venture
  -- depends on it. verify_work_chain() rebuilds this exact string.
  v_payload :=
    new.lab_id::text                       || '|' ||
    new.seq::text                          || '|' ||
    new.prev_hash                          || '|' ||
    new.member_user_id::text               || '|' ||
    new.event_type::text                   || '|' ||
    trim(to_char(new.quantity, 'FM9999999999990.00')) || '|' ||
    new.unit_weight::text                  || '|' ||
    new.units::text                        || '|' ||
    coalesce(new.task_id::text, '')        || '|' ||
    coalesce(new.note, '')                 || '|' ||
    to_char(new.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '|' ||
    coalesce(new.reverses_event_id::text, '');

  -- sha256() is pg_catalog (PostgreSQL 11+), deliberately NOT pgcrypto's
  -- digest(): `create extension if not exists pgcrypto` is a no-op on a project
  -- where Supabase already installed it into the `extensions` schema, and under
  -- `set search_path = ''` a `public.digest` that lives elsewhere does not
  -- resolve. A built-in cannot move.
  new.hash := encode(sha256(convert_to(v_payload, 'UTF8')), 'hex');
  return new;
end;
$$;

create trigger work_events_chain
  before insert on work_events
  for each row execute function public.work_events_assign_chain();

-- 5b. A reversal must reverse something real, in the same venture, for the same
-- member, and must not itself be reversed.
create function public.work_events_check_reversal()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_lab    uuid;
  v_member uuid;
  v_is_rev boolean;
begin
  if new.reverses_event_id is null then
    return new;
  end if;
  select we.lab_id, we.member_user_id, we.reverses_event_id is not null
    into v_lab, v_member, v_is_rev
    from public.work_events we
    where we.id = new.reverses_event_id;
  if v_lab is null then
    raise exception 'work_events: reversed event does not exist'
      using errcode = 'foreign_key_violation';
  end if;
  if v_lab <> new.lab_id or v_member <> new.member_user_id then
    raise exception 'work_events: a reversal must match the original venture and member'
      using errcode = 'check_violation';
  end if;
  if v_is_rev then
    raise exception 'work_events: a reversal cannot itself be reversed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger work_events_reversal_target
  before insert on work_events
  for each row execute function public.work_events_check_reversal();

-- 5c. Immutability. The trigger fires for EVERY role — a revoke would still
-- leave an owner/superuser/dashboard session able to rewrite the past, which is
-- exactly the thing the ledger promises it cannot do (Phase 6 reasoning).
create trigger work_events_immutable
  before update or delete on work_events
  for each row execute function public.forbid_mutation();

create trigger work_event_attestations_immutable
  before update on work_event_attestations
  for each row execute function public.forbid_mutation();

revoke update, delete on public.work_events from service_role;

-- 5d. Chain verification — a member-checkable claim, not a marketing line.
create function public.verify_work_chain(p_lab_id uuid)
returns table (ok boolean, broken_seq bigint)
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  r         record;
  v_prev    text := 'genesis';
  v_payload text;
begin
  for r in
    select * from public.work_events we where we.lab_id = p_lab_id order by we.seq
  loop
    v_payload :=
      r.lab_id::text                        || '|' ||
      r.seq::text                           || '|' ||
      r.prev_hash                           || '|' ||
      r.member_user_id::text                || '|' ||
      r.event_type::text                    || '|' ||
      trim(to_char(r.quantity, 'FM9999999999990.00')) || '|' ||
      r.unit_weight::text                   || '|' ||
      r.units::text                         || '|' ||
      coalesce(r.task_id::text, '')         || '|' ||
      coalesce(r.note, '')                  || '|' ||
      to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '|' ||
      coalesce(r.reverses_event_id::text, '');
    if r.prev_hash <> v_prev
       or r.hash <> encode(sha256(convert_to(v_payload, 'UTF8')), 'hex') then
      ok := false; broken_seq := r.seq; return next; return;
    end if;
    v_prev := r.hash;
  end loop;
  ok := true; broken_seq := null; return next;
end;
$$;

-- 6. Declared capital need ----------------------------------------------------
-- The need and the decision behind it. No pledge table: see the header.
create table venture_capital_needs (
  id           uuid primary key default gen_random_uuid(),
  lab_id       uuid not null references labs (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  currency     char(3) not null default 'USD',
  purpose      text not null check (length(btrim(purpose)) between 1 and 400),
  decision_id  uuid references lab_decisions (id) on delete set null,
  declared_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index venture_capital_needs_lab_idx
  on venture_capital_needs (lab_id, declared_at desc);

-- 7. Readability helpers ------------------------------------------------------
-- Same conventions as Phase 4: security definer, empty search_path, no uid
-- parameter (a caller can only ever ask about themselves).
create function public.is_venture_lead(p_lab_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.labs l
      where l.id = p_lab_id and l.lead_user_id = (select auth.uid())
  ) or exists (
    select 1 from public.lab_members m
      where m.lab_id = p_lab_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role in ('lead', 'core')
  );
$$;
revoke all on function public.is_venture_lead(uuid) from public, anon;
grant execute on function public.is_venture_lead(uuid) to authenticated, service_role;

create function public.can_read_venture_ledger(p_lab_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.labs l
      where l.id = p_lab_id
        and (public.is_lab_member(p_lab_id) or public.is_venture_lead(p_lab_id) or public.is_mod())
        and (
          l.ledger_visibility = 'members'
          or public.is_venture_lead(p_lab_id)
          or public.is_mod()
        )
  );
$$;
revoke all on function public.can_read_venture_ledger(uuid) from public, anon;
grant execute on function public.can_read_venture_ledger(uuid) to authenticated, service_role;

-- The 7b toggle: with hours_visibility = 'private' only leads (and the member
-- themselves, below in the policy) see per-member hours; everyone else gets the
-- total, which is what the toggle's own copy promises.
create function public.can_read_venture_hours(p_lab_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.labs l
      where l.id = p_lab_id
        and (
          l.hours_visibility = 'members'
          or public.is_venture_lead(p_lab_id)
          or public.is_mod()
        )
  );
$$;
revoke all on function public.can_read_venture_hours(uuid) from public, anon;
grant execute on function public.can_read_venture_hours(uuid) to authenticated, service_role;

-- 8. Tally (the read model) ---------------------------------------------------
-- No internal readability guard: this is called with the service role where
-- auth.uid() is null, and a guard inside would zero every row (the Phase 5
-- lesson, learned the expensive way on poll_results and the capital tallies).
-- Readability is enforced by the caller's own RLS load.
create function public.venture_contribution_tally(p_lab_id uuid)
returns table (
  member_user_id  uuid,
  hours           numeric,
  code_count      integer,
  design_count    integer,
  intro_count     integer,
  money_cents     numeric,
  units           integer,
  verified_units  integer,
  event_count     integer
)
language sql
stable
security definer set search_path = ''
as $$
  select
    we.member_user_id,
    coalesce(sum(we.quantity) filter (where we.event_type = 'hours'), 0)::numeric,
    coalesce(sum(we.quantity) filter (where we.event_type = 'code'), 0)::integer,
    coalesce(sum(we.quantity) filter (where we.event_type = 'design'), 0)::integer,
    coalesce(sum(we.quantity) filter (where we.event_type = 'intro'), 0)::integer,
    coalesce(sum(we.quantity) filter (where we.event_type = 'money'), 0)::numeric,
    coalesce(sum(we.units), 0)::integer,
    -- Verified = witnessed AND still standing. A reversal is a DIFFERENT row
    -- that carries no attestation of its own, so an attestation-only filter
    -- cancels the original's `units` while leaving its units inside
    -- verified_units forever: a member whose one witnessed contribution was
    -- corrected would keep showing verified work that no longer exists. Both
    -- halves of a correction are therefore excluded — the reversed row because
    -- it was taken back, and the reversal row because letting an attested
    -- correction count would swing verified_units negative instead of to zero.
    coalesce(sum(we.units) filter (
      where we.reverses_event_id is null
        and exists (select 1 from public.work_event_attestations a
                      where a.work_event_id = we.id)
        and not exists (select 1 from public.work_events rev
                          where rev.reverses_event_id = we.id)
    ), 0)::integer,
    count(*)::integer
  from public.work_events we
  where we.lab_id = p_lab_id
  group by we.member_user_id;
$$;
-- service_role ONLY, and this is a deliberate departure from the Phase 2/5
-- tallies (poll_results, candidate_vote_tally), which are granted to
-- `authenticated`. Those return aggregates over a whole object. This one returns
-- a row PER MEMBER including their hours — precisely what the members-only
-- ledger policy and the hours_visibility toggle exist to protect. Granted to
-- `authenticated` it would be a direct PostgREST bypass of both. The caller
-- resolves readability first and then calls it with the service role.
revoke all on function public.venture_contribution_tally(uuid) from public, anon, authenticated;
grant execute on function public.venture_contribution_tally(uuid) to service_role;

-- 9. RLS ----------------------------------------------------------------------
-- Write model, unchanged from Phase 4/5: every write is API-only behind route
-- authz, executed by the service role.
alter table venture_workstreams enable row level security;
alter table venture_tasks enable row level security;
alter table venture_weight_schemes enable row level security;
alter table work_events enable row level security;
alter table work_event_attestations enable row level security;
alter table venture_capital_needs enable row level security;

-- 7e is explicit: the goal, the members and the open seats are public; the work,
-- the artifacts and the contribution ledger are members-only. So the board and
-- the ledger key off membership, not off can_read_lab().
create policy venture_workstreams_select on venture_workstreams
  for select to authenticated
  using (public.can_read_lab(lab_id));

create policy venture_tasks_select on venture_tasks
  for select to authenticated
  using (public.is_lab_member(lab_id) or public.is_mod());

create policy venture_weight_schemes_select on venture_weight_schemes
  for select to authenticated
  using (public.can_read_venture_ledger(lab_id));

create policy work_events_select on work_events
  for select to authenticated
  using (
    public.can_read_venture_ledger(lab_id)
    and (
      event_type <> 'hours'
      or member_user_id = (select auth.uid())
      or public.can_read_venture_hours(lab_id)
    )
  );

create policy work_event_attestations_select on work_event_attestations
  for select to authenticated
  using (
    exists (
      select 1 from public.work_events we
        where we.id = work_event_id
          and public.can_read_venture_ledger(we.lab_id)
    )
  );

create policy venture_capital_needs_select on venture_capital_needs
  for select to authenticated
  using (public.is_lab_member(lab_id) or public.is_mod());

revoke insert, update, delete on public.venture_workstreams from anon, authenticated;
revoke insert, update, delete on public.venture_tasks from anon, authenticated;
revoke insert, update, delete on public.venture_weight_schemes from anon, authenticated;
revoke insert, update, delete on public.work_events from anon, authenticated;
revoke insert, update, delete on public.work_event_attestations from anon, authenticated;
revoke insert, update, delete on public.venture_capital_needs from anon, authenticated;

-- 10. Demotion — the system timeout path (ruling 2) ---------------------------
-- What this does NOT touch is the point: ledger, tasks, workstreams, members,
-- decisions, lab_events, promoted_at, venture_since. Only the current stage
-- changes. Warning first (demotion_warned_at, set by the caller a fortnight
-- earlier), then the stage change, then the public record.
create function public.demote_timed_out_ventures(
  p_timeout_days integer default 84,
  p_warned_days  integer default 7
)
returns setof uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  r         record;
  v_named   boolean;
  v_subject text;
begin
  for r in
    update public.labs l
      set space_mode = 'lab',
          demoted_at = now(),
          updated_at = now()
      where l.space_mode = 'venture'
        and l.last_activity_at < now() - make_interval(days => p_timeout_days)
        -- Advance notice is a precondition, not a courtesy: no venture is
        -- demoted that was not told first.
        and l.demotion_warned_at is not null
        and l.demotion_warned_at < now() - make_interval(days => p_warned_days)
      returning l.id, l.name, l.slug, l.last_activity_at, l.visibility, l.is_listed
  loop
    insert into public.lab_events (lab_id, event_type, metadata)
    values (
      r.id,
      'demoted_timeout',
      jsonb_build_object(
        'from', 'venture', 'to', 'lab',
        'timeout_days', p_timeout_days,
        'last_activity_at', r.last_activity_at,
        'actor', 'system'
      )
    );

    -- Published immediately: "publicly logged" is the whole promise. But the
    -- promise is about the STAGE CHANGE, not about the Space's identity — and
    -- every active member can read this table. A private venture, or one whose
    -- members chose to stay out of Discover, would otherwise be disclosed by
    -- name AND slug through a sweep it never asked for, which is a worse
    -- outcome than the one the log exists to prevent. So the entry is always
    -- published and always says the same thing; only the identifying half is
    -- conditional, and it is present exactly when the Space is already
    -- readable-and-findable without it. The lab_events row above stays fully
    -- detailed either way — that one is Space-scoped.
    v_named := r.visibility = 'public' or (r.visibility <> 'private' and r.is_listed);
    v_subject := case when v_named then r.name else 'A venture' end;

    insert into public.governance_log_entries (title, body, category, published_at)
    values (
      v_subject || ' — Maal → Warshad',
      v_subject || ' returned to Warshad after ' || p_timeout_days ||
        ' days without activity. The system made this change, not a member. '
        || 'Its work history, ledger, contributions and past decisions are unchanged; '
        || 'only its current stage moved.'
        || case when v_named then ' Slug: ' || r.slug::text || '.' else '' end,
      'stage_demotion',
      now()
    );

    return next r.id;
  end loop;
end;
$$;
revoke all on function public.demote_timed_out_ventures(integer, integer) from public, anon, authenticated;
grant execute on function public.demote_timed_out_ventures(integer, integer) to service_role;

-- The warning pass. Separate call so the sweep can notify between the two.
create function public.warn_timed_out_ventures(p_warn_after_days integer default 70)
returns setof uuid
language sql
security definer set search_path = ''
as $$
  update public.labs l
    set demotion_warned_at = now()
    where l.space_mode = 'venture'
      and l.demotion_warned_at is null
      and l.last_activity_at < now() - make_interval(days => p_warn_after_days)
    returning l.id;
$$;
revoke all on function public.warn_timed_out_ventures(integer) from public, anon, authenticated;
grant execute on function public.warn_timed_out_ventures(integer) to service_role;

-- Logging work IS activity — a venture whose members are contributing must never
-- drift toward a timeout because nobody wrote a prose update that week.
create trigger work_events_touch_activity
  after insert on public.work_events
  for each row execute function public.touch_lab_last_activity();

create trigger venture_tasks_touch_activity
  after insert on public.venture_tasks
  for each row execute function public.touch_lab_last_activity();

-- Activity clears a pending warning: one update genuinely revives the venture,
-- which is what the dormancy copy promises ("hal cusboonaysiin ayaa dib u
-- firfircoonaysa").
create or replace function public.touch_lab_last_activity()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.labs
    set last_activity_at = now(),
        dormant_since = null,
        demotion_warned_at = null
    where id = new.lab_id;
  return new;
end;
$$;
