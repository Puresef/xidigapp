# Xidig Runbook

Operational reference for running, backing up, restoring, and responding to
incidents in Xidig. This is a **stub** — fill in real values (project refs,
dashboards, on-call rotations) as the infrastructure is provisioned.

## Contents

- [Environment](#environment)
- [Supabase auth configuration](#supabase-auth-configuration)
- [Auth deliverability (email + SMS)](#auth-deliverability-email--sms)
- [Backup & Restore](#backup--restore)
- [Incident Response](#incident-response)
- [Runbooks (placeholders)](#runbooks-placeholders)

---

## Environment

All runtime configuration is validated at boot by `apps/web/src/env.ts`. A
missing or malformed required variable makes the app refuse to start with a
single error listing every offending key.

- Local: copy `.env.example` → `.env` and fill in values.
- CI/build: `next build` runs with `SKIP_ENV_VALIDATION=true` so it never needs
  real secrets. Validation still runs at real boot (`next start` / `next dev`).

| Concern          | Provider      | Keys                                                                                                                                  |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Database / auth  | Supabase      | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| App identity     | —             | `APP_URL` (canonical origin; auth links are built from it)                                                                           |
| Email            | Resend (default; adapter-swappable) | `EMAIL_API_KEY`, `EMAIL_PROVIDER` (auto/resend/console), `EMAIL_FROM`                                           |
| Maps             | MapTiler      | `MAPTILER_KEY`                                                                                                                        |
| Search           | Meilisearch   | `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`                                                                                             |
| Analytics        | PostHog       | `POSTHOG_KEY`, `POSTHOG_HOST`                                                                                                         |
| Rate limiting    | Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                                  |
| Error monitoring | Sentry        | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (+ build-time-only `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`, not in env.ts)           |
| AI               | _TBD_         | `AI_API_KEY`                                                                                                                          |

### Local Meilisearch

For dev, run a free, self-hosted Meilisearch instance instead of a paid cloud
plan:

```bash
pnpm search:up    # docker compose up -d meilisearch
pnpm search:down  # docker compose down
```

Requires `MEILI_MASTER_KEY` set in the repo-root `.env` (read by
`docker-compose.yml`, generate with `openssl rand -base64 24`) and
`apps/web/.env.local` pointing at it:

```
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=<same value as MEILI_MASTER_KEY>
```

Data persists in the `meilisearch_data` Docker volume; `docker compose down -v`
wipes the index. Not used in CI/build — `next build` runs with
`SKIP_ENV_VALIDATION=true` and never needs Meilisearch running.

---

## Supabase auth configuration

Phase 1 auth assumes the following **dashboard settings** on the Supabase
project (Auth → Providers / Sessions / URL configuration). They are part of
the security model — re-apply them on any new environment.

| Setting | Value | Why |
| --- | --- | --- |
| **Allow new users to sign up** | **OFF** | Beta gate: all account creation goes through our API (invite/waitlist → signup grant → admin API). The `on_auth_user_created` DB trigger blocks ungated signups even if this is misconfigured — two independent layers. |
| Email provider → **Email OTP expiry** | **3600 s** (60 min) | This single global value must cover the longest-lived email link: password reset (§27: 60 min). The app enforces the **10-minute** window for magic-link / signup / email-change links itself via `auth_email_tokens` (see `apps/web/src/app/auth/confirm/route.ts`). |
| Email provider → SMTP / templates | **Not used** | Auth emails are sent by the app (`EMAIL_PROVIDER`/`EMAIL_API_KEY`) via `auth.admin.generateLink()` — copy lives in `apps/web/src/lib/email/templates.ts`. Do not enable Supabase email sending; users would get duplicate/competing emails. |
| **Secure email change** (double confirm) | **Single confirmation** | The linking flow confirms only the NEW address (`email_change_new`); double-confirm would dead-end because no email is ever sent to the old address. |
| Phone provider | **Enabled**, Twilio (or compatible) creds | SMS-OTP sign-in (§9). Without a provider the API degrades to the §27 "We couldn't send a text message" error — email methods keep working. |
| Phone → **SMS OTP expiry** | **600 s** (10 min) | §26: codes expire after 10 minutes (natively enforced — no app-side ledger needed for SMS). |
| Phone → SMS OTP length | 6 digits | Matches the `/^[0-9]{4,10}$/` guard + brute-force rate limits in `otp/verify`. |
| **Site URL** | the deployment's `APP_URL` | Must equal the `APP_URL` env var; auth links are built from `APP_URL` only (host-header injection is a non-issue by construction). |
| Refresh token rotation | ON (default) | Session persistence + expiry handling. |

Residual risk (documented, accepted for beta): because GoTrue's email OTP
expiry is global at 60 min, a raw magic-link token POSTed directly to the
GoTrue verify endpoint remains valid up to 60 min even though our
`/auth/confirm` rejects it after 10. The advertised path (the emailed link)
always goes through `/auth/confirm`.

**WhatsApp OTP (v1.1):** the OTP layer is channel-agnostic
(`apps/web/src/lib/auth/otp.ts`). To enable: configure a WhatsApp-capable
provider (Twilio Verify) in the dashboard and add `'whatsapp'` to
`ENABLED_OTP_CHANNELS`.

**Deleting users:** Supabase's native "delete user" fails by design while the
app-level `public.users` row exists (FK is NO ACTION — §19 anonymise, never
delete). Account deletion ships as an app-level anonymise routine in a later
phase; do not hand-delete rows to force it.

**Ops/seed accounts:** provision by issuing a `signup_grants` row first, then
creating the user — the `on_auth_user_created` trigger finds the open grant
and admits the signup (this is the same path the app's signup route uses):

```js
// service-role client
const expires = new Date(Date.now() + 3600_000).toISOString();
await admin.from('signup_grants').insert({ email, expires_at: expires });
const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
// → public.users row created, grant consumed, founding-member badge if ≤500
```

> **Do NOT use** the `app_metadata: { xidig_gate_bypass: 'true' }` shortcut with
> `createUser`. It works against the embedded-postgres test stub but **500s on
> real GoTrue** (`XIDIG_SIGNUP_NOT_ALLOWED`): GoTrue does not populate
> `raw_app_meta_data` with the custom key at the moment the AFTER INSERT trigger
> fires, so the gate-bypass branch in `handle_auth_user_created` never matches.
> The bypass branch still exists for direct SQL inserts into `auth.users`
> (migrations/backfills), where you control `raw_app_meta_data` at insert time.
> Verified live 5 Jul 2026. `app_metadata` remains not settable by end users.

---

## Auth deliverability (email + SMS)

Auth depends on external delivery, and Somali routes + privacy-focused inboxes
(Proton) can be slow or filtered. The app ships four delivery-independence
layers — the ops work below keeps the channels themselves healthy.

**What the app already does (no ops needed):**

- **Password path** — a member with a password never waits on delivery; the
  §20 nudge pushes passwordless members to set one.
- **Numeric fallback** — magic-link and signup emails carry a copy-pasteable
  6-digit code (same token, same 10 minutes) entered on the same screen, for
  clients that mangle or pre-fetch links.
- **Cross-channel guidance** — the sent-state UI offers "try SMS instead" /
  "try email instead"; SMS provider failures CTA to the magic link (§27).
- **Resend UX** — visible resend with a 60 s cooldown and attempt counter;
  server-side rate limits per identifier + per IP stay authoritative.
- **Suppression list** — hard bounces/complaints (via the webhook below) stop
  further sends to that address and surface the §27 "can't deliver email
  there" error instead of "check your inbox".

### DNS authentication (before real members — Seq 22 provider)

- [ ] Use a **dedicated sending subdomain** (e.g. `mail.xidig.net`) so auth
      mail reputation is isolated from marketing/personal mail.
- [ ] **SPF** record for the provider (Resend: `send.` CNAME/TXT per their
      dashboard) — verify in the provider UI.
- [ ] **DKIM** keys published + verified.
- [ ] **DMARC** at `p=none` initially with `rua=` reporting; tighten to
      `p=quarantine` once reports are clean for 2+ weeks.
- [ ] **Warmup:** ramp volume gradually the first weeks (invites are naturally
      low-volume — fine); avoid batch-blasting waitlist invites on day one.

### Delivery-event webhook (suppression list)

- [ ] Resend → Webhooks → add endpoint `{APP_URL}/api/webhooks/email`,
      events `email.bounced` + `email.complained`.
- [ ] Copy the signing secret into `EMAIL_WEBHOOK_SECRET` (unset = endpoint
      answers 503 and no suppressions are recorded).
- [ ] Suppressed addresses live in `email_suppressions` (service-role only).
      To release one after investigating: set `released_at = now()` — a fresh
      bounce re-suppresses automatically.

### Monitoring & alerts

- [ ] Sentry: alert rule on the `email suppressed` warning events (a spike =
      route-level deliverability incident, not one bad address).
- [ ] Provider dashboard: watch delivery rate; investigate under ~95%.
- [ ] SMS: monitor delivery/failure rates in the SMS provider console; the
      app logs every failed send (`[auth] … OTP send failed`).
- [ ] Audit trail: every suppression writes an `email.suppression.*` audit
      row (admin-visible).

### Route testing matrix (before launch, then quarterly)

Send a magic link + signup confirm + reset to each, and an SMS OTP to Somali
numbers on each carrier you can access:

- [ ] Proton Mail (link AND code path — Proton's link protection can rewrite
      URLs; the code is the designed fallback)
- [ ] Gmail, Outlook/Hotmail (spam-folder check)
- [ ] Common Somali webmail/ISP inboxes available to the team
- [ ] SMS: Hormuud, Somtel, Telesom numbers — measure latency; if a route is
      unreliable, configure a secondary provider in Supabase (Twilio ↔
      MessageBird) and document the switch procedure here.
- [ ] WhatsApp OTP (v1.1): once a WhatsApp-capable provider is configured,
      flip `ENABLED_OTP_CHANNELS` — the API already accepts the channel.

---

## Backup & Restore

> ⚠️ Placeholder — validate and rehearse before relying on any of this.

### Database (Supabase / Postgres)

**Backups**

- [ ] Confirm Supabase automated daily backups are enabled and the retention
      window is set (Project → Database → Backups).
- [ ] Configure Point-in-Time Recovery (PITR) if required by RPO.
- [ ] Add an off-provider logical backup (e.g. scheduled `pg_dump`) and store it
      in object storage with lifecycle rules. Command (fill in connection):

  ```bash
  pg_dump "$DATABASE_URL" --format=custom --file "xidig-$(date +%F).dump"
  ```

**Restore**

- [ ] Document the exact restore procedure and the last time it was tested.

  ```bash
  pg_restore --clean --if-exists --dbname "$DATABASE_URL" xidig-<date>.dump
  ```

- [ ] Record target **RPO** (max acceptable data loss): _TBD_.
- [ ] Record target **RTO** (max acceptable downtime): _TBD_.

### Schema & types

- Migrations live in `packages/db/supabase/migrations/`.
- Regenerate types after schema changes:

  ```bash
  SUPABASE_PROJECT_ID=<project-ref> pnpm db:gen-types
  ```

### Other stateful services

- [ ] Meilisearch — reindex procedure / snapshot strategy: _TBD_.
- [ ] Upstash Redis — treated as ephemeral cache (no backup) or not: _TBD_.

---

## Incident Response

> ⚠️ Placeholder — assign owners and links before an incident, not during one.

**On-call:** _TBD_ · **Escalation:** _TBD_ · **Status page:** _TBD_

### First 15 minutes

1. Acknowledge the alert; declare severity (SEV1–SEV3).
2. Open an incident channel and assign an Incident Commander.
3. Check dashboards: Sentry (errors), PostHog (traffic), Supabase (DB health).
4. Decide: mitigate (roll back / disable feature) vs. investigate.

### Severity levels

| Sev  | Definition                   | Response                    |
| ---- | ---------------------------- | --------------------------- |
| SEV1 | Full outage / data loss risk | Page immediately, all hands |
| SEV2 | Major degradation            | Page on-call                |
| SEV3 | Minor / partial              | Next business day           |

### After the incident

- [ ] Write a blameless post-mortem (timeline, root cause, action items).
- [ ] File follow-up issues and assign owners.

---

## Runbooks (placeholders)

- [ ] Roll back a bad deploy
- [ ] Rotate a leaked secret / API key
- [ ] Restore the database from backup
- [ ] Scale up under load
- [ ] Recover from a failed migration

---

## Phase 2 (Plaza) operations

### Scheduled sweeps

`GET /api/cron/plaza` runs the 7-day stale-Ask nudge (§15/§26, in-app only)
and the Seq-14 poll auto-close. `vercel.json` schedules it hourly; Vercel
sends `Authorization: Bearer <CRON_SECRET>` automatically once the env var is
set. Unset `CRON_SECRET` = endpoint disabled (503). Any other scheduler works
too — it just needs the bearer header. Both sweeps are idempotent.

### AI moderation pre-scan

- Provider selection: `AI_MODERATION_PROVIDER` (`auto` = Anthropic in prod,
  console/log in dev). Uses `AI_API_KEY`. FAIL-OPEN by design: provider outage
  → content ships with verdict `skipped` (Sentry records the failure).
- Text scans run after the response; a confident flag auto-hides the post/
  comment and notifies the author. Uncertain content (Somali especially, by
  prompt design) stays live and lands in the human queue.
- Human review queue: `/admin/moderation` (mod/admin), filter `?language=so`
  for the Somali lane. Decisions write `mod_actions` + audit rows.

### Media

The `post-media` Storage bucket is public (WebP only, 5MB cap) and is created
lazily by the app (`lib/media/storage.ts`) — no dashboard step needed. The
local CLI stack also declares it in `packages/db/supabase/config.toml`.
Uploads are re-encoded to WebP (EXIF/GPS stripped) and pre-scanned before
storage; confidently-flagged images are rejected and never stored.

### Pending `supabase db push`

As of 7 Jul, all Phase 1–5 migrations are consolidated on `main` and unpushed to
the hosted project. The full launch sequence (link + `db push` of all 11
migrations, provider keys, Vercel env, DNS, auth-dashboard config, smoke test)
lives in **[GO-LIVE.md](GO-LIVE.md)** — follow it end to end for a fresh
environment. Nothing works live until `supabase db push` applies the chain
(tables exist from Phase 0, but every RLS open + the Phase 2–5 tables/functions
arrive with their phase migration).

## Phase 3 (Fariimo — DMs + notifications) operations

### Supabase Realtime (required for live DMs)

DM delivery is Supabase Realtime "Postgres changes" — **no polling**. The
migration `20260706100000_phase3_fariimo.sql` adds `messages`, `notifications`
and `conversations` to the `supabase_realtime` publication (guarded, so it is
idempotent and safe in the migration test harness, which has no
Supabase-provisioned publication). After `supabase db push`:

- Confirm Realtime is enabled for the project (Dashboard → Project Settings →
  Realtime, or `[realtime] enabled = true` in `config.toml` for local).
- Delivery is authorized per-subscriber by each table's RLS SELECT policy, so a
  client subscribed to `messages` with `conversation_id=eq.<id>` receives an
  INSERT only if the participant policy lets them read that row —
  non-participants get nothing, even mid-stream.
- `messages`/`conversations` are set to `REPLICA IDENTITY FULL` so RLS resolves
  correctly on UPDATE/DELETE events (read-receipt bumps, moderation soft-delete).

### Web push (Fariimo) — VAPID

Push is a payload-LESS "new activity" tickle (privacy: no message body leaves
the server; the service worker `public/sw.js` shows a generic notification and
opens the app). It is dependency-free (Node crypto signs the VAPID JWT — no
`web-push` package). To enable:

1. Generate a keypair once: `npx web-push generate-vapid-keys`.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (`mailto:ops@…` or an https URL), and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (=
   the public key) — see `.env.example`.
3. **Fail-safe:** unset keys ⇒ push disabled with one server warning; in-app
   notifications keep working and the opt-in toggle explains the state. Dead
   endpoints (404/410 from the push service) are auto-pruned (`revoked_at`).

iOS supports web push only for **installed** PWAs on 16.4+; Android/desktop
Chrome work in-browser. The toggle lives on `/notifications`.

### Email notifications

`§26` email channel: **DM requests** send an email (best-effort, via the same
suppression-checked provider as auth email — `lib/email/send.ts`). **Candidate
status** email is wired as a channel capability (`candidateStatusEmail` +
`notifications.type = 'candidate_status'`) but nothing emits it until Capital
(Phase 5). Transactional emails are English-only for now (same as the auth
emails); a localized-email pass is future work.

### Abuse throttles

DM requests: **5/day** (§26) — enforced twice: Upstash edge limit (fail-open)
**and** a durable DB-count backstop (`countDmRequestsToday`) so the cap still
bites when Upstash is unset. Message sends: 30/min burst guard (Upstash).
Reports: 20/hour. Blocks halt any live conversation and block sends both
directions.

### Pending `supabase db push` (Phase 3)

Add `20260706100000_phase3_fariimo.sql` to the push list above — it opens RLS
on conversations/messages/push_subscriptions/user_blocks/reports, adds the
`dm_inbox()`/`dm_unread_count()` helpers + the message→conversation touch
trigger, and registers the Realtime publication. DMs/notifications stay dark
until it's pushed.
