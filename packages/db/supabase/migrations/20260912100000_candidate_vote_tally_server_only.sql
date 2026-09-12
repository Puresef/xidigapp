-- Xidig Plus doctrine, P1 (owner rulings, 12 Sep): the candidate vote is PAUSED,
-- and live tallies must leave every normal surface WITH NO DIRECT BACK DOOR.
--
-- candidate_vote_tally(uuid) is SECURITY DEFINER with no candidate-visibility
-- and no eligibility check, and EXECUTE was granted to `authenticated`. Any
-- signed-in member could therefore call it over PostgREST for ANY candidate
-- id, including drafts and reviewers-only candidates they cannot read, and get
-- the live approve/reject/total counts of a ballot that only the paid tier
-- could cast. The app no longer reads it: lib/capital/views.ts projects no
-- tally, and the vote route returns none. So:
--
--   * EXECUTE is revoked from public, anon and authenticated.
--   * service_role keeps it. That is the narrowly scoped server/admin path for
--     future reviewer or audit tooling under an approved, non-paid vote rule.
--     No app route calls it while the vote is paused.
--
-- Deliberately a GRANT change only, exactly like Packet B's
-- candidate_interest_counts quarantine (20260911001000). The body is untouched,
-- so this composes with the deletion branch's 20260911000400 `create or
-- replace` (its lifecycle guard stays in force). `create or replace` keeps
-- existing ACLs, and its explicit re-grant sorts BEFORE this file, so this
-- revoke is the last word. No ballot is read, changed or deleted: existing
-- candidate_votes rows stay as restricted records.
--
-- Rollback (fix-forward, owner call): a new migration that re-grants EXECUTE to
-- authenticated. It is not a revert of this file.

revoke execute on function public.candidate_vote_tally(uuid) from public, anon, authenticated;
grant execute on function public.candidate_vote_tally(uuid) to service_role;
