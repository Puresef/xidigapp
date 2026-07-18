-- ============================================================================
-- Seq 49.5 — pre-launch security hardening: column-scope verifications SELECT
-- ============================================================================
-- FINDING (this launch-gate review): the Phase-6 migration opened two SELECT
-- policies on `verifications` for the `authenticated` role —
-- `verifications_select_own` (user_id = auth.uid()) and
-- `verifications_select_verifier` (is_verifier()) — but never column-scoped the
-- grant. Because Supabase's default posture GRANTs SELECT on every column to
-- `authenticated`, a member (or verifier) hitting PostgREST DIRECTLY with the
-- publishable key could read their own row's `recording_url`
-- (special-category BIOMETRIC data, §14), `recording_expires_at`,
-- `verifier_user_id` and `decision_notes` — bypassing the "verifier/admin-only,
-- access-logged" control the migration's own comment promises
-- ("recording_url stays server-only ... every read of it is written to
-- verification_access_log by the API").
--
-- The app NEVER reads `verifications` through the user (authenticated) client —
-- the verifier queue, the member's own-request list and the recording fetch all
-- go through the SERVICE ROLE (getSupabaseAdmin), and the recording fetch writes
-- verification_access_log first. So scoping the `authenticated` SELECT grant to
-- the member-safe columns breaks NO app path (service_role keeps its default
-- all-column grant) and makes the documented invariant DB-enforced (fail-closed).
--
-- This mirrors the column-scoping already applied to `profiles`
-- (20260704200000_phase1_auth.sql) and `events` (20260710063000_events.sql).

revoke select on public.verifications from anon, authenticated;

grant select (
  id,
  user_id,
  listing_id,
  type,
  status,
  scheduled_at,
  consent_given,
  consent_recorded_at,
  booking_url,
  info_requested_at,
  decided_at,
  created_at,
  updated_at
) on public.verifications to authenticated;

-- recording_url, recording_expires_at, verifier_user_id and decision_notes are
-- deliberately NOT granted to authenticated: they are verifier/admin/service
-- surfaces only, read exclusively through the service role (which logs access).
