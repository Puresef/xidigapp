-- Test-account quarantine (12 Sep 2026): a durable marker for seeded/test
-- accounts, so fake people are never presented as organic community proof.
--
-- Why: the 12 Sep production audit found the test-community seeder's 62 fake
-- members (60 personas + 2 AI helpers) on the Supabase project labelled
-- "Dev Xidig App" (tbdryvhxxiqadseuxclm), which is the LIVE production
-- database for xidig.net. Their profiles, badges, verification, reputation,
-- award votes and Spaces read as real community proof. An owner-approved
-- containment (12 Sep) banned them and hid their public Spaces/listings, but
-- nothing in the schema says "this account is not a real member".
--
-- What this adds:
--   * users.is_test boolean not null default false — the quarantine marker,
--     mirroring users.is_ai. The app reads it through lib/account-flags.ts
--     (service role) and excludes marked accounts from counters, rankings,
--     awards, trust, search, discovery and public projections.
--   * No client grant. The users write-grant stays preferred_language /
--     low_bandwidth_enabled / onboarding_state (20260704200000:504-506), so
--     only the service role can set or clear the marker. Row visibility is
--     unchanged (users_select_own / users_select_admin).
--   * A deterministic backfill (below). It never relies on @example.com alone:
--       (a) a source-defined test-community fixture handle
--           (apps/web/src/lib/seed/test-community/personas.ts: TEST_PERSONAS
--           + TEST_AI_HELPERS; the list is pinned by a test) AND the reserved
--           example.com domain AND at least one test-community seed marker
--           (seed_runs label test-community-v1 / -v2 / -awards) present; or
--       (b) the one named verification-session account zz_deltest_decoy
--           (owner-identified, 12 Sep) on the reserved example.com domain.
--     Other @example.com verification-session accounts are NOT marked here;
--     that is a separate owner decision.
--
-- What it deliberately does NOT do: no row is deleted, anonymised or hidden;
-- no badge, vote, ballot or reputation row is changed; no function is
-- re-created (the founding-member trigger, award_vote_tally,
-- candidate_interest_counts and recompute_reputation_scores still count test
-- accounts in SQL; the app excludes them where it reads).
--
-- DEPLOY ORDER: apply this BEFORE deploying app code that reads users.is_test
-- (claude/test-account-quarantine and anything built on it). It is additive and
-- safe with the older app, which ignores the column. It sorts before the
-- deploy-order-gated 20260912100000 / 20260912100100, which still follow the
-- app deploy. Production (the project labelled "Dev Xidig App") applies it
-- only as explicitly approved production work.
--
-- Rollback (fix-forward, owner call): a new migration that sets is_test = false
-- for the affected ids, or drops the column once no app code reads it. Not a
-- revert of this file.

alter table public.users
  add column is_test boolean not null default false;

comment on column public.users.is_test is
  'Quarantined seeded/test account (not a real member). Service-role only. '
  'Excluded from organic proof, counts, rankings, awards, trust, search, discovery '
  'and public projections. See 20260912050000_test_account_quarantine.sql.';

-- BEGIN test-account backfill
update public.users u
   set is_test = true
  from public.profiles p
 where p.user_id = u.id
   and not u.is_test
   and u.email::text ilike '%@example.com'
   and (
         (exists (select 1 from public.seed_runs s
                   where s.label in ('test-community-v1', 'test-community-v2', 'test-community-awards'))
          and lower(p.handle::text) in (
         'abshir_maal', 'abwaan_dhool', 'amina_biyo', 'arday_hargeisa',
         'asli_cijaar', 'axmed_caafi', 'ayaan_dev', 'bashiir_baro',
         'burhaan_qaylo', 'caawiye_ai', 'cabdi_daawo', 'cali_macalin',
         'cawo_cargo', 'cumar_mod', 'daahir_maqan', 'daauud_devops',
         'dalmar_dood', 'deeq_organiser', 'deeqa_dirham', 'faadumo_qa',
         'faarax_gaadiid', 'fartuun_forsa', 'geedi_xoolo', 'guhaad_ganax',
         'guuleed_dhismo', 'hafsa_dugsi', 'hamdi_agritech', 'hibo_dhar',
         'hodan_mod', 'idil_warbaahin', 'ifrah_invest', 'jamaal_bir',
         'kalluun_kismayo', 'khadra_coop', 'khalid_codes', 'koos_kubad',
         'leyla_verifier', 'liibaan_data', 'luul_dukaan', 'maryan_kalkaal',
         'muna_macaan', 'nasra_sec', 'nimco_caafimaad', 'nuur_samafal',
         'qali_qarsoon', 'saciid_makaanik', 'safiya_aragto', 'sagal_ux',
         'sahra_xinne', 'samatar_sawir', 'tahliil_textile', 'tuute_cusub',
         'ubax_beerta', 'warda_gabay', 'warsame_admin', 'warshad_ai',
         'xaawo_hadal', 'xaliimo_hooyo', 'xasan_beero', 'yusuf_xawilaad',
         'zakariye_ml', 'zamzam_dugsiga'
          ))
      or lower(p.handle::text) = 'zz_deltest_decoy'
   );
-- END test-account backfill
