-- ============================================================================
-- Hygiene (Supabase advisor, 10 Jul): the phase7 award_votes_guard_open_cycle
-- trigger function was created without an explicit EXECUTE revoke, so PostgREST
-- exposes it at /rpc (calling a trigger-returning function errors, so the risk
-- is nil — but the house posture is explicit revokes on everything not meant to
-- be called). Trigger firing does NOT need caller EXECUTE, so this is safe.
-- Pre-existing equivalents (handle_auth_user_*, touch_*) are an alpha-hardening
-- sweep item, deliberately not expanded here.
-- ============================================================================

revoke all on function public.award_votes_guard_open_cycle() from public, anon, authenticated;
