-- ============================================================================
-- Xidig v1.0 — Phase 1 hardening: email deliverability (suppression list)
-- ============================================================================
-- Auth depends on external delivery (email links + SMS codes). Addresses that
-- hard-bounce or complain get suppressed here via the provider webhook
-- (/api/webhooks/email) so we stop sending into a black hole and can tell the
-- member honestly (§27 email_undeliverable) instead of "check your inbox".
--
-- Locked table: service role only — written by the webhook, read by the
-- centralized send path (apps/web/src/lib/email/send.ts).

create table email_suppressions (
  email          citext primary key,
  -- 'bounced' | 'complained' | 'manual'
  reason         text not null,
  -- provider event id/type for the audit trail
  source         text,
  event_count    integer not null default 1,
  last_event_at  timestamptz not null default now(),
  -- ops can release an address after investigating (kept, not deleted)
  released_at    timestamptz,
  created_at     timestamptz not null default now()
);

alter table email_suppressions enable row level security;
-- no policies: anon/authenticated read zero rows, cannot write.
