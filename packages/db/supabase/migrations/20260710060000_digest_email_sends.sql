-- ============================================================================
-- DIGEST EMAIL SENDS — per-edition, per-member send ledger (extras plan item 6)
-- ============================================================================
-- The weekly digest email channel (docs/social-app-extras-plan.md item 6)
-- needs a send registry so a cron re-run for the same edition NEVER
-- double-sends: one row per (edition, member), claimed BEFORE the provider
-- call. Rules encoded here:
--
--   * unique (edition_id, user_id) is the idempotency guarantee — a recipient
--     is claimed at most once per edition, across re-runs and concurrent
--     workers (INSERT ... ON CONFLICT DO NOTHING decides the winner).
--   * status: 'pending' (claimed, provider call in flight), 'sent',
--     'failed' (provider rejected — recorded, NOT auto-retried: a timeout may
--     still have delivered, and never-double-send outranks retry), and
--     'suppressed' (address on email_suppressions — skipped by design).
--   * `email` is the address AT SEND TIME (auditable even after the member
--     changes address); rows cascade away with the edition/user.
--
-- Service-role-only writes; admins may read for ops audit. Members' opt-in
-- lives in user_settings.digest_frequency + notification_prefs
-- (weekly_digest/email) — this table is delivery bookkeeping, not consent.

create table digest_email_sends (
  id          uuid primary key default gen_random_uuid(),
  edition_id  uuid not null references digest_editions (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  email       text not null,
  status      text not null default 'pending'
                check (status in ('pending', 'sent', 'failed', 'suppressed')),
  error       text,
  claimed_at  timestamptz not null default now(),
  sent_at     timestamptz,
  constraint digest_email_sends_once unique (edition_id, user_id)
);

create index digest_email_sends_edition_idx on digest_email_sends (edition_id, status);

alter table digest_email_sends enable row level security;

-- Ops audit read for admins; no member-facing surface reads this ledger.
create policy digest_email_sends_select_admin on digest_email_sends
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.digest_email_sends from anon, authenticated;
