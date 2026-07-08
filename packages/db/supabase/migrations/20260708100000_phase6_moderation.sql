-- ============================================================================
-- Phase 6 — Admin / Moderation / Reports / Audit / Verification / Account
-- lifecycle (§6, §10, §14, §19, §27).
-- ============================================================================
-- ADDITIVE ONLY. Every Phase-6 entity (reports, mod_actions, appeals,
-- audit_logs, verifications, governance_log_entries, vouches, the users
-- lifecycle columns, and all the enums) already shipped in the Phase 0 schema.
-- This migration ACTIVATES them for the app surface rather than redefining
-- them:
--   1. helpers — is_verifier() (a least-privilege grant seam beside mod/admin)
--      + author_is_active() / is_active_account() (suspension enforcement);
--   2. suspension content-hiding — augments the existing content SELECT
--      policies so a suspended/deactivated/pending-deletion author's published
--      content disappears from public/member reads while staying in the table
--      as evidence (authors still see their own; mods still see everything);
--   3. moderation RLS — mod/verifier/appellant read policies for the queues
--      (reports, mod_actions, appeals, verifications, governance_log_entries),
--      keeping every write API-only (service role) as the rest of the app does;
--   4. immutability — the §19 append-only guarantee, hardened from
--      privilege-revocation to a trigger that no role (incl. service_role /
--      table owner) can bypass, on audit_logs + mod_actions +
--      capital_gate_evaluations + the new access log;
--   5. evidence + compliance tables — report_snapshots (report-contextual DM
--      review with NO blanket mod read) and verification_access_log (§14
--      "access-logged" biometric-recording reads);
--   6. small missing columns — reports.assigned_to (claim/triage),
--      verifications.booking_url / info_requested_at (video-call scheduling),
--      users.deactivated_at / anonymised_at (lifecycle auditability).
--
-- Nothing here weakens an earlier phase: the Capital recusal predicate
-- (can_review_candidate) and the no-money-movement stance are untouched; the
-- verifier axis is deliberately SEPARATE from the Capital reviewer axis.

-- ============================================================================
-- 1. HELPERS
-- ============================================================================
-- House idiom: SECURITY DEFINER + empty search_path, no uid parameter (they
-- only ever answer for auth.uid()), execute revoked from public/anon and
-- granted to authenticated + service_role. Same shape as is_mod()/is_admin().

-- Is the CURRENT caller an active account? Drives the suspension write-block on
-- the client-writable participation policies below (a suspended member must
-- not be able to keep reacting/voting/endorsing/editing their profile through
-- a direct PostgREST call that skips the requireUser() API guard).
create function public.is_active_account()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.status = 'active'
  );
$$;

-- Is the given author an active account? Drives suspension content-HIDING in
-- the content SELECT policies. Reads another user's status (which authenticated
-- cannot do directly), so it must be SECURITY DEFINER. 'active' is the only
-- visible state: suspended / deactivated / pending_deletion / deleted authors
-- all have their published content hidden from everyone but themselves + mods.
create function public.author_is_active(author_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = author_id and u.status = 'active'
  );
$$;

-- Verifier gate (§14). A least-privilege capability that sits BESIDE mod/admin
-- rather than a 4th user_role enum value: (a) it keeps this a single migration
-- (ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
-- references the new label), (b) it matches the lookup-over-enum house rule for
-- extensible sets, and (c) it lets identity/business verification — which
-- exposes biometric call recordings (§14) — be granted to a SMALL trusted set
-- WITHOUT handing every mod access to that sensitive surface. Admin inherits
-- verifier (as it inherits mod). A suspended/deactivated verifier loses it via
-- the status='active' check, same as is_mod()/is_admin().
create table verifier_grants (
  user_id             uuid primary key references users (id) on delete cascade,
  granted_by_user_id  uuid references users (id) on delete set null,
  note                text,
  granted_at          timestamptz not null default now(),
  revoked_at          timestamptz  -- soft-revoke; a revoked grant keeps the audit trail
);

create function public.is_verifier()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.verifier_grants g
      join public.users u on u.id = g.user_id
      where g.user_id = auth.uid()
        and g.revoked_at is null
        and u.status = 'active'
    );
$$;

revoke all on function public.is_active_account() from public, anon;
revoke all on function public.author_is_active(uuid) from public, anon;
revoke all on function public.is_verifier() from public, anon;
grant execute on function public.is_active_account() to authenticated, service_role;
grant execute on function public.author_is_active(uuid) to authenticated, service_role;
grant execute on function public.is_verifier() to authenticated, service_role;

-- verifier_grants: admins manage the roster; the roster itself is admin-visible
-- only. Every write is API-only (service role), audited via the role route.
alter table verifier_grants enable row level security;

create policy verifier_grants_select_admin on verifier_grants
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.verifier_grants from anon, authenticated;

-- ============================================================================
-- 2. IMMUTABILITY — trigger-enforced append-only (§19 / §21)
-- ============================================================================
-- audit_logs already revokes UPDATE/DELETE from service_role (phase1_auth), but
-- that is privilege-only: a table-owner / superuser connection (a migration, a
-- psql session, the dashboard SQL editor) could still rewrite history. §19's
-- "immutable audit log" is a hard guarantee, so back it with a trigger that
-- fires for EVERY role — no BYPASSRLS, owner, or service_role escapes it. Same
-- treatment for the other append-only ledgers: mod_actions (the action trail),
-- capital_gate_evaluations (the §17 compliance log), and verification_access_log
-- (the §14 biometric-access trail). INSERT is untouched — these tables are
-- written, never edited.

create function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'relation "%" is append-only; % is not permitted (Phase 6 immutability)',
    tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger audit_logs_immutable
  before update or delete on audit_logs
  for each row execute function public.forbid_mutation();

create trigger mod_actions_immutable
  before update or delete on mod_actions
  for each row execute function public.forbid_mutation();

create trigger capital_gate_evaluations_immutable
  before update or delete on capital_gate_evaluations
  for each row execute function public.forbid_mutation();

-- mod_actions was never revoked from service_role writes (only audit_logs was).
-- Match the audit-log posture: insert-only for every role. capital_gate_
-- evaluations likewise (phase5 only revoked anon/authenticated).
revoke update, delete on public.mod_actions from service_role;
revoke update, delete on public.capital_gate_evaluations from service_role;
-- reports are the §19 trail too: status transitions (UPDATE) are legitimate,
-- but a resolved report is never deleted — lock that door.
revoke delete on public.reports from service_role;

-- ============================================================================
-- 3. MODERATION QUEUE — mod/admin/appellant read policies
-- ============================================================================
-- Every write stays API-only (service role) exactly like the AI pre-scan queue:
-- these tables have no client write grant, so a direct PostgREST insert with
-- the publishable key fails. We only open the READS the queues need.

-- reports: the reporter already sees their own (reports_select_own, phase3).
-- Add the mod/admin queue read. Reporter identity is mod-only — never surfaced
-- to the reported member (the app projects a redacted view).
create policy reports_select_mod on reports
  for select to authenticated
  using (public.is_mod());

-- Claim/triage: which mod is handling a report (nullable — unassigned = open
-- pool). Set via the API only (no client grant added).
alter table reports
  add column assigned_to_user_id uuid references users (id) on delete set null,
  add column assigned_at         timestamptz;

create index reports_assigned_idx on reports (assigned_to_user_id)
  where assigned_to_user_id is not null;

-- mod_actions: the immutable action ledger is mod/admin-readable (queue detail,
-- appeal context). Writes are service-role-only + now immutable (§2 above).
create policy mod_actions_select_mod on mod_actions
  for select to authenticated
  using (public.is_mod());

-- appeals: the appellant reads their own appeal + outcome; a mod/admin reads
-- the appeals queue. The "routed to a SECOND mod/admin" recusal (reviewer !=
-- original actor) is enforced in the decide-appeal route (it needs the
-- mod_action.actor_user_id, which RLS here does not join) and re-asserted by a
-- DB CHECK on write. Writes are API-only (service role).
create policy appeals_select_own on appeals
  for select to authenticated
  using (appellant_user_id = (select auth.uid()));

create policy appeals_select_mod on appeals
  for select to authenticated
  using (public.is_mod());

revoke insert, update, delete on public.appeals from anon, authenticated;

-- Defense-in-depth for the §19 "second mod/admin" rule: even a service-role
-- bug cannot record a self-reviewed appeal decision.
alter table appeals
  add constraint appeals_reviewer_not_appellant
    check (reviewed_by_user_id is null or reviewed_by_user_id <> appellant_user_id);

-- governance_log_entries (§19 transparent governance log): every active member
-- reads PUBLISHED entries; admins additionally see drafts (unpublished). Writes
-- are admin-only via the API (service role).
create policy governance_select_published on governance_log_entries
  for select to authenticated
  using (published_at is not null);

create policy governance_select_admin on governance_log_entries
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.governance_log_entries from anon, authenticated;

-- ============================================================================
-- 4. VERIFICATION — queue RLS + scheduling columns + access log (§14)
-- ============================================================================
-- verifications had NO policies (service-role-only). Open the two reads it
-- needs: the requester sees their own request/status; verifiers + admins see
-- the queue. recording_url stays server-only — it is NEVER selected into a
-- member-facing projection, and every read of it is written to
-- verification_access_log by the API.
create policy verifications_select_own on verifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy verifications_select_verifier on verifications
  for select to authenticated
  using (public.is_verifier());

revoke insert, update, delete on public.verifications from anon, authenticated;

-- External-booking link for the v1 video-call scheduling step (§14: "schedule
-- a call"), and the timestamp a verifier asked the member for more info
-- (request_more_info without an enum change — status stays pending/scheduled).
alter table verifications
  add column booking_url        text,
  add column info_requested_at  timestamptz;

-- §14 "access-logged": every issuance of a signed URL / view of a call
-- recording (special-category biometric data) writes a row here. Admin-audit
-- readable; append-only (immutable, §2 style) so the access trail cannot be
-- scrubbed. Written by the API (service role) whenever recording_url is read.
create table verification_access_log (
  id                  uuid primary key default gen_random_uuid(),
  verification_id     uuid not null references verifications (id) on delete cascade,
  accessed_by_user_id uuid not null references users (id),
  access_type         text not null,  -- 'recording_view' | 'queue_detail' | ...
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index verification_access_log_verification_idx
  on verification_access_log (verification_id, created_at desc);
create index verification_access_log_actor_idx
  on verification_access_log (accessed_by_user_id, created_at desc);

alter table verification_access_log enable row level security;

create policy verification_access_log_select_admin on verification_access_log
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.verification_access_log from anon, authenticated;

create trigger verification_access_log_immutable
  before update or delete on verification_access_log
  for each row execute function public.forbid_mutation();

-- ============================================================================
-- 5. REPORT SNAPSHOTS — report-contextual review, NO blanket DM read (§13/§19)
-- ============================================================================
-- The DM privacy invariant is absolute: there is NO mod/admin SELECT policy on
-- conversations or messages, and this migration adds none. Instead, when a
-- participant reports a message, the API captures the reported content (+ a
-- small, bounded context window) into a snapshot at report time. The mod queue
-- reads the SNAPSHOT, never the live thread — so a moderator can adjudicate a
-- DM report without ever gaining the ability to read arbitrary private
-- conversations. The same table preserves post/comment/candidate evidence so a
-- later removal or appeal review still has the original content even after an
-- edit or delete. One snapshot per report.
create table report_snapshots (
  report_id      uuid primary key references reports (id) on delete cascade,
  entity_type    entity_type not null,
  entity_id      uuid not null,
  captured_body  text,               -- the reported content at report time
  captured_context jsonb not null default '{}'::jsonb,  -- bounded surrounding context
  created_at     timestamptz not null default now()
);

alter table report_snapshots enable row level security;

-- Mod/admin-readable only. NOT visible to the reporter (they already have their
-- own report row) and NEVER to the reported member.
create policy report_snapshots_select_mod on report_snapshots
  for select to authenticated
  using (public.is_mod());

revoke insert, update, delete on public.report_snapshots from anon, authenticated;

-- Evidence integrity: a captured snapshot is never edited (it would defeat the
-- point). DELETE is left to the report cascade (which never fires — reports are
-- not deletable, §2) so we only forbid UPDATE.
create trigger report_snapshots_no_update
  before update on report_snapshots
  for each row execute function public.forbid_mutation();

-- ============================================================================
-- 6. ACCOUNT LIFECYCLE — auditability timestamps (§19)
-- ============================================================================
-- status + suspended_at + deletion_requested_at already exist. Add the two
-- lifecycle timestamps the flows need for UI + audit: when a self-service
-- deactivation happened, and when the post-grace anonymisation ran. Not
-- client-writable (users write-grant is preferred_language/low_bandwidth/
-- onboarding only) — the lifecycle API sets them via service role.
alter table users
  add column deactivated_at timestamptz,
  add column anonymised_at  timestamptz;

-- ============================================================================
-- 7. SUSPENSION CONTENT-HIDING — augment content SELECT policies
-- ============================================================================
-- Phase 6 requirement (§19): a suspended user's content is hidden per policy.
-- Today the content SELECT policies filter status ('published'/'hidden'/
-- 'removed') but NOT the author's account status, so content published before a
-- suspension stays fully visible. The clean fix — recommended over a suspend-
-- time bulk UPDATE or a trigger cascade — is an author_is_active() clause on
-- the published branch of each content policy: single source of truth
-- (users.status), instantly reversible on unsuspend, no batch job, evidence
-- preserved. The author's own branch and the mod branch are untouched, so an
-- author still sees their own hidden-by-suspension content and mods still see
-- everything for adjudication. Each policy below is reproduced VERBATIM from
-- its latest definition with the single new clause added.

-- posts (latest def: phase4_labs) -------------------------------------------
drop policy if exists posts_select_visible on posts;
create policy posts_select_visible on posts
  for select to authenticated
  using (
    (
      status = 'published'
      and (author_user_id is null or public.author_is_active(author_user_id))
      and (lab_id is null or public.is_lab_member(lab_id))
    )
    or author_user_id = (select auth.uid())
    or public.is_mod()
  );

-- comments (latest def: phase5_capital) -------------------------------------
drop policy if exists comments_select_visible on comments;
create policy comments_select_visible on comments
  for select to authenticated
  using (
    author_user_id = (select auth.uid())
    or public.is_mod()
    or (
      status = 'published'
      and (author_user_id is null or public.author_is_active(author_user_id))
      and post_id is not null
      and exists (
        select 1 from posts p
        where p.id = comments.post_id
          and (
            (
              p.status = 'published'
              and (p.author_user_id is null or public.author_is_active(p.author_user_id))
              and (p.lab_id is null or public.is_lab_member(p.lab_id))
            )
            or p.author_user_id = (select auth.uid())
          )
      )
    )
    or (
      status = 'published'
      and (author_user_id is null or public.author_is_active(author_user_id))
      and candidate_id is not null
      and public.can_read_candidate(candidate_id)
    )
  );

-- lab_updates (latest def: phase4_labs) -------------------------------------
drop policy if exists lab_updates_select_readable on lab_updates;
create policy lab_updates_select_readable on lab_updates
  for select to authenticated
  using (
    public.can_read_lab(lab_id)
    and (
      (status = 'published' and (author_user_id is null or public.author_is_active(author_user_id)))
      or author_user_id = (select auth.uid())
      or public.is_mod()
    )
  );

-- lab_artifacts (latest def: phase4_labs) -----------------------------------
drop policy if exists lab_artifacts_select_readable on lab_artifacts;
create policy lab_artifacts_select_readable on lab_artifacts
  for select to authenticated
  using (
    public.can_read_lab(lab_id)
    and (
      (status = 'published' and (added_by_user_id is null or public.author_is_active(added_by_user_id)))
      or added_by_user_id = (select auth.uid())
      or public.is_mod()
    )
  );

-- lab_decisions (latest def: phase4_labs) -----------------------------------
drop policy if exists lab_decisions_select_readable on lab_decisions;
create policy lab_decisions_select_readable on lab_decisions
  for select to authenticated
  using (
    public.can_read_lab(lab_id)
    and (
      (status = 'published' and (created_by_user_id is null or public.author_is_active(created_by_user_id)))
      or created_by_user_id = (select auth.uid())
      or public.is_mod()
    )
  );

-- business_listings (latest def: phase1_api_surface) ------------------------
drop policy if exists listings_select_published on business_listings;
create policy listings_select_published on business_listings
  for select to authenticated
  using (
    (status = 'published' and (owner_user_id is null or public.author_is_active(owner_user_id)))
    or owner_user_id = (select auth.uid())
    or public.is_mod()
  );

-- ============================================================================
-- 8. SUSPENSION WRITE-BLOCK — augment client-writable participation policies
-- ============================================================================
-- Content creation (posts/comments/DMs/labs/candidates/listings) is already
-- service-role-only, so a suspended user cannot create it via a direct client
-- call (no insert grant) or via the API (requireUser throws account_suspended).
-- The remaining client-writable surfaces are the low-stakes participation
-- toggles. Add is_active_account() to the ones that constitute "writing" so a
-- suspended member cannot keep participating by skipping the API. (Self-scoped
-- toggles that are pure personal state — follows/mutes/bookmarks — are left
-- alone: blocking them adds friction with no safety benefit, and a suspended
-- user muting someone harms no one.) Each policy is reproduced verbatim + the
-- new clause.

-- poll_votes (latest def: phase4_labs) --------------------------------------
drop policy if exists poll_votes_insert_own on poll_votes;
create policy poll_votes_insert_own on poll_votes
  for insert to authenticated
  with check (
    voter_user_id = (select auth.uid())
    and public.is_active_account()
    and exists (
      select 1 from posts p
      where p.id = poll_votes.post_id
        and p.type = 'poll'
        and p.status = 'published'
        and (p.lab_id is null or public.is_lab_member(p.lab_id))
        and p.poll_status = 'open'
        and (p.poll_closes_at is null or p.poll_closes_at > now())
    )
  );

drop policy if exists poll_votes_update_own on poll_votes;
create policy poll_votes_update_own on poll_votes
  for update to authenticated
  using (voter_user_id = (select auth.uid()))
  with check (
    voter_user_id = (select auth.uid())
    and public.is_active_account()
    and exists (
      select 1 from posts p
      where p.id = poll_votes.post_id
        and p.type = 'poll'
        and p.status = 'published'
        and (p.lab_id is null or public.is_lab_member(p.lab_id))
        and p.poll_status = 'open'
        and (p.poll_closes_at is null or p.poll_closes_at > now())
    )
  );

-- reactions (latest def: phase4_labs) ---------------------------------------
drop policy if exists reactions_insert_own on reactions;
create policy reactions_insert_own on reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_account()
    and (
      (
        post_id is not null
        and exists (
          select 1 from posts p
          where p.id = reactions.post_id
            and p.status = 'published'
            and (p.lab_id is null or public.is_lab_member(p.lab_id))
        )
      )
      or (
        comment_id is not null
        and exists (
          select 1 from comments c
          join posts p on p.id = c.post_id
          where c.id = reactions.comment_id
            and c.status = 'published'
            and p.status = 'published'
            and (p.lab_id is null or public.is_lab_member(p.lab_id))
        )
      )
    )
  );

-- skill_endorsements (latest def: phase1_api_surface) -----------------------
drop policy if exists skill_endorsements_insert_own on skill_endorsements;
create policy skill_endorsements_insert_own on skill_endorsements
  for insert to authenticated
  with check (
    endorser_user_id = (select auth.uid())
    and public.is_active_account()
  );

-- profiles: a suspended member must not edit their profile (e.g. swap links or
-- handle) to evade or to keep operating during a suspension. (latest def:
-- phase1_auth)
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.is_active_account()
  );
