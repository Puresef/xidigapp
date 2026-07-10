# Xidig v1.0 — Alpha Hardening backlog (Phases 1–8)

Single consolidated backlog for closing out v1.0. Build is complete through
Phase 8; everything here is **provisioning, hardening, or review** — not new
features. Companion runbooks: [GO-LIVE.md](GO-LIVE.md) (deploy),
[runbook.md](runbook.md) (Supabase/auth ops), [phase-8-smoke.md](phase-8-smoke.md)
(API/seed/digest smoke), [dpia-verification.md](dpia-verification.md) (compliance).

Legend: 🖥️ can be done locally/in-repo · 🌐 needs a provider account/live env ·
👤 needs a human (native speaker / lawyer / decision) · ✅ done in-repo.

---

## Current build status

| Phase | Scope | Build | Notes |
|---|---|---|---|
| 1 | Auth · profiles · directory · map · social | ✅ | 3 migrations; RLS-tested |
| 2 | Plaza (posts/asks/polls/reactions/HITL) | ✅ | API-only writes; hourly sweep = external cron |
| 3 | DMs · notifications · push (VAPID) | ✅ | realtime, no polling; push optional |
| 4 / 4.5 | Labs/Spaces · media identity · settings · social · search | ✅ | playbooks seeded; Lite/MediaSlot normative |
| 5 | Capital/Maal (candidates · intent) | ✅ | intent-only, region-gated; no money movement |
| 6 | Admin · mod · verification · account lifecycle | ✅ | verifier grants; DPIA gate for recording |
| 7 | Reputation · badges · onboarding · matching · awards · mentor · analytics | ✅ | decay recompute now on cron |
| 8 | AI seeding · REST API · MCP · weekly digest | ✅ | all gates green |

Gates (local): typecheck ✅ · lint ✅ · unit 749 ✅ · DB/RLS 64 ✅ · i18n ✅ · build ✅.

---

## Launch blockers (must clear before inviting real members)

1. **🌐 DB push** — apply all 16 migrations to the live Supabase project
   (`supabase db push`), through `20260709100000_phase8_ai_api.sql`. Ordered list
   below. Every prior phase note says "migration unpushed" — build-first strategy,
   this is the push.
2. **🌐 Required env vars** — the app refuses to boot without: `APP_URL`,
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Set in
   Vercel (GO-LIVE §4).
3. **🌐 Supabase auth config** — Site URL = `https://app.xidig.net`, redirect
   URLs, email/SMS providers, `signup_mode`. Seed the first admin via the
   `signup_grants` path (NOT `xidig_gate_bypass` — 500s on real GoTrue).
4. **👤 Biometric DPIA sign-off** — required before enabling real
   verification-call **recording** (UK GDPR, §14/§22). Until signed, do not
   enable recording in production (the build hard-gates on recorded consent;
   the DPIA is the controller sign-off). See dpia-verification.md.
5. **🌐 `CRON_SECRET` set** — otherwise all cron routes + the seed job return
   503/reject (fail-safe, but the sweeps/digest/decay won't run).

## Alpha Hardening checklist (do before/around silent launch)

### Migrations & types
- [ ] 🌐 Push migrations (order): `20260704000000_schema` → `20260704200000_phase1_auth`
      → `20260704210000_phase1_api_surface` → `20260705000000_deliverability`
      → `20260705010000_member_search` → `20260705020000_feed_and_claims`
      → `20260706000000_phase2_plaza` → `20260706100000_phase3_fariimo`
      → `20260706200000_phase4_labs` → `20260706300000_experience_expansion`
      → `20260707000000_phase5_capital` → `20260708000000_following_feed`
      → `20260708010000_lab_playbook_seed` → `20260708100000_phase6_moderation`
      → `20260709000000_phase7_reputation_awards` → `20260709100000_phase8_ai_api`.
- [x] ✅ Supabase types regenerated (`gen-types:local`, offline) — now current
      through Phase 8; this also picked up the Phase-4 sweep functions
      (`mark_dormant_labs`/`flag_skill_gaps`), whose stale `as never` casts were
      removed. After a real `supabase db push`, optionally re-run against the live
      project to confirm parity.

### Provider config (🌐 — optional providers fail safe when unset)
- [ ] `EMAIL_API_KEY` / `EMAIL_PROVIDER` / `EMAIL_FROM` / `EMAIL_WEBHOOK_SECRET` (Resend + Svix)
- [ ] `UPSTASH_REDIS_REST_URL` / `_TOKEN` (rate limiting — else fail-open, no limits)
- [ ] `POSTHOG_KEY` / `POSTHOG_HOST` (analytics — stays dark until consent UI regardless)
- [ ] `AI_API_KEY` / `AI_MODERATION_PROVIDER` (content pre-scan — else ships `skipped`, fail-open)
- [ ] `MAPTILER_KEY` (map tiles — else OSM fallback)
- [ ] `VAPID_*` (Web Push — else in-app only)
- [ ] `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` (error monitoring)
- [ ] `MEILISEARCH_*` — leave unset (Postgres trgm search; Meili deferred)

### Cron setup (🌐)
- [ ] Vercel auto-registers the 4 daily+ jobs from `vercel.json` (labs, lifecycle,
      reputation, digest). Confirm they appear under Project → Cron.
- [ ] External hourly scheduler for `/api/cron/plaza` (Hobby plan can't do hourly)
      — cron-job.org GET with the `CRON_SECRET` bearer (GO-LIVE §5).

### Seed / digest verification (🌐 live, after push)
- [ ] Run `pnpm --filter @xidig/web seed`; re-run → no duplicates (`/admin/seed`).
- [ ] Confirm AI account `@xidig_ai` badge + seeded/AI labels on cards.
- [ ] `GET /api/cron/digest?dryRun=1` then live; re-run same week → no dup post.
- [ ] Full API/MCP/seed matrix: [phase-8-smoke.md](phase-8-smoke.md).

### Digest bulk email go-live (🌐 — extras item 6, BUILT 10 Jul; supersedes the
    "digest bulk email channel" backlog line below)
- The Monday digest cron now bulk-emails opted-in members, but the channel is
  STRUCTURALLY DARK until `EMAIL_API_KEY` is set (response shows
  `email.skipped: 'email_not_configured'`). Setting the key is the go-live
  switch — no code change. Dev can exercise the full loop against the console
  provider with an explicit `EMAIL_PROVIDER=console`.
- [ ] Migration `20260710060000_digest_email_sends` pushed (send ledger —
      per-(edition, member) claim rows are the never-double-send guarantee).
- [ ] BEFORE setting `EMAIL_API_KEY`: confirm the default opt-in posture is
      wanted for the first cohort. Recipients = active human members with
      `user_settings.digest_frequency` weekly (the default) AND the
      `weekly_digest`/email pref on (§26 default ON). Both knobs live on
      `/settings/notifications`; every email footer links there.
- [ ] First live send: `GET /api/cron/digest` with the bearer → check the
      `email` summary (recipients/claimed/sent/failed/suppressed); re-run the
      same week → `alreadyClaimed` = everyone, zero new sends.
- [ ] Failed rows (`digest_email_sends.status='failed'`) are NOT auto-retried
      (never-double-send outranks retry) — inspect via admin select and decide
      manually.
- The old-site Resend audience is NEVER auto-enrolled here (front-door-plan §7
  keeps it in the updates-only lane; unchanged by this item).

### Security / RLS review (🖥️ — status below)
- [x] ✅ "RLS enabled on every public table" — enforced by a passing test
      (`migrations.test.ts`); default-deny everywhere.
- [x] ✅ Privileged writes are service-role-only; SECURITY DEFINER functions set
      `search_path = ''` and are granted narrowly (reputation/award/verifier/
      advisor/seed paths).
- [x] ✅ Phase-8 tables (seed_runs/seed_entities/digest_editions) admin-select,
      client-writes revoked; `api_keys` RLS-locked (hash never client-readable);
      audit trail on external writes.
- [ ] 🌐 Post-deploy: confirm anon cannot reach member data through PostgREST;
      spot-check the public SSR projections (login-free profile/listing/lab pages)
      leak only intended fields.

### Privacy / legal / compliance (👤/🌐)
- [ ] 👤 Biometric DPIA sign-off (blocker above) + 24-month recording retention,
      access-logging (verification recording).
- [ ] 👤 Privacy Policy / ToS published on the marketing site; analytics-consent
      copy live (the consent gate stays fail-closed until then — intended).
- [ ] 🌐 Data-export (`POST /api/me/export`) + account deletion/anonymisation
      (lifecycle cron) verified end-to-end against live data.
- [ ] 👤 Consent capture shipped in-repo ([consent-capture.md](consent-capture.md)):
      signed-in banner + Settings › Data choices, `consent_records` +
      `xidig_consent` cookie, Sentry-replay gate, migration
      `20260709210000_consent_capture` (adds `error_monitoring`). Remaining:
      legal review of the banner copy + linked draft Privacy Policy, native SO
      pass on `consent.*`, and remember `signup_completed`/`invite_accepted`/
      `lab_revived` still structurally can't fire (Phase 7) — consent doesn't
      unblock them.

### Native Somali copy review (👤)
- [ ] Review SO **drafts** in these namespaces (shipped as drafts, English
      fallback keeps UI whole): `lab`, `lite`, `saved`, `social`, `search`,
      `capital`, `matching`, `awards`, `mentor`, `reputation`, `content` (Phase 8
      seeded/AI labels), `error.invalidApiKey`/`apiKeyExpired`/`insufficientScope`,
      `admin.seed*`. Launch-floor namespaces are 100% translated but the newer
      ones want a native pass.

### Beta / silent-launch checklist
- [ ] All launch blockers cleared.
- [ ] Post-deploy smoke (GO-LIVE §8) + Phase-8 smoke green.
- [ ] Seed launch density (tags/listings/Lab templates/Plaza) + verify labels.
- [ ] First digest generated (pinned post visible).
- [ ] Invite the first cohort via `signup_grants`/invites; monitor Sentry.

---

## v1.0 backlog extras (in-scope for v1.0, not yet built)

From the project's v1.0 experience backlog (build, not hardening):
- Events + RSVP; business trust fields; tasks/kanban; per-type profile/space
  templates; Lab focus split; page-block **editor** (renderer is v1.0.x, editor
  deferred per the page-blocks note).
- Community-Awards tally → auto-post winners to Plaza; the related-skill 0.5
  matcher weight (Phase 7 deferred).
- Email templating for the notification types currently in-app-only (Phase 3/6
  note); digest bulk email channel.

## Post-v1.0 / deferred (explicitly out of scope)

- WhatsApp OTP + WhatsApp reminder bots; React Native app (v1.2 — the API-first
  boundary already supports it).
- Paid membership tier billing beyond the schema stubs (v1.1).
- Meilisearch ranking layer.
- Live-Lab creation via API; candidate/Capital writes via API (compliance).
- Webhooks outbound delivery (table exists, delivery unwired).
- **Not for v1.0 (locked):** algorithmic feed ranking, analytics personalization,
  AI recommendations, money movement / pledge ledger / payouts / token mechanics,
  co-op work-ledger / governance entities (future backlog decision only).
