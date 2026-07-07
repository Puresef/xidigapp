# Xidig — Go-Live Runbook (v1.0 alpha)

Ordered steps to take the consolidated `main` branch (Phases 1–5) from
build-complete to **live** on Supabase + Vercel. Ubuntu terminal commands.
Companion to [runbook.md](runbook.md) (ongoing ops) — this doc is the one-time
launch sequence.

Legend: 🖥️ = your terminal · 🌐 = a provider dashboard (needs your login) · ⏱️ ~time.

---

## 0. Prerequisites (🖥️, ~5 min)

```bash
node --version      # need 22+  (nvm install 22 if not)
corepack enable && corepack prepare pnpm@11.9.0 --activate
cd ~/xidigapp && pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm build   # sanity: all green before you deploy
```

The Supabase CLI is run on demand via `pnpm dlx supabase@latest …` (nothing to
install globally). Optionally install the Vercel CLI: `pnpm add -g vercel`.

---

## 1. GitHub — push the consolidated branch (🖥️, ~5 min)

The remote is already set to `git@github.com:puresef/xidigapp.git`, **but this
machine currently can't authenticate to it** (`git fetch` fails). Fix auth first:

**Option A — SSH key (recommended):**
```bash
ssh-keygen -t ed25519 -C "you@xidig" -f ~/.ssh/id_ed25519   # if you don't have one
eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub        # → paste into GitHub → Settings → SSH and GPG keys
ssh -T git@github.com            # expect "Hi puresef!"
```

**Option B — HTTPS + Personal Access Token:**
```bash
git remote set-url origin https://github.com/puresef/xidigapp.git
# git will prompt for username + a PAT (create one: GitHub → Settings →
# Developer settings → Fine-grained tokens, repo:contents read/write)
```

Then push everything (main now contains Phases 1–5; branches preserved):
```bash
git push -u origin main
git push origin phase-4.5-experience-expansion phase-5-capital   # optional, for review
```
> ⚠️ If `git fetch origin` shows the remote `main` has commits you don't have,
> STOP and reconcile (`git pull --rebase`) before pushing — don't force-push a
> shared branch.

---

## 2. Provider accounts + keys (🌐, ~45–60 min)

Every runtime variable is validated at boot by `apps/web/src/env.ts` — the app
**refuses to start** if a required one is missing. Collect these first; you'll
paste them into Vercel in step 5.

| # | Service | Sign up | Keys you need | Notes |
|---|---------|---------|---------------|-------|
| 1 | **Supabase** | supabase.com | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Project → Settings → **API Keys**. Use the new **publishable** (`sb_publishable_…`) + **secret** (`sb_secret_…`) keys. URL = `https://<ref>.supabase.co`. Also note the **project ref** and **DB password** (step 3). |
| 2 | **Resend** | resend.com | `EMAIL_API_KEY` | Verify a **sending subdomain** `mail.xidig.net` (SPF/DKIM/DMARC — see runbook §Deliverability). Set `EMAIL_FROM="Xidig <noreply@mail.xidig.net>"`. |
| 3 | **MapTiler** | maptiler.com | `MAPTILER_KEY` | Free tier fine for alpha. |
| 4 | **Meilisearch** | cloud.meilisearch.com (or self-host) | `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` | Required at boot. (v1.0 directory/global search runs on Postgres trigram; Meilisearch ranking is a later wire-up — but env still requires a reachable instance.) |
| 5 | **PostHog** | posthog.com (EU or US) | `POSTHOG_KEY`, `POSTHOG_HOST` | Analytics gated behind consent; events fire from Phase 7. Host default `https://us.i.posthog.com`. |
| 6 | **Upstash** | upstash.com | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis (REST) for rate limits. Fail-open, but env requires it. URL must be `https://…` (not `tcp://`). |
| 7 | **Sentry** | sentry.io | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (same DSN) | Optional build-time: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (source-map upload). |
| 8 | **OpenAI** (moderation) | platform.openai.com | `AI_API_KEY` (an OpenAI key), `AI_MODERATION_PROVIDER=openai` | Moderation pre-scan uses the **free** `omni-moderation-latest` (text+image). Fail-open. Anthropic/Claude for writing/seeding is a separate Phase 8 key. |

---

## 3. Supabase — schema, RLS, auth (🖥️ + 🌐, ~30 min)

**3a. Link + push all 11 migrations** (🖥️):
```bash
pnpm dlx supabase@latest login          # opens browser / paste access token
cd ~/xidigapp/packages/db
pnpm dlx supabase@latest link --project-ref <your-project-ref>
pnpm dlx supabase@latest db push        # applies 20260704…schema → 20260707…phase5_capital
```
This creates every table, RLS policy, helper function, trigger, and the Realtime
publication. Migrations are additive and ordered; a fresh project applies all 11.

**3b. Regenerate types against the live project** (🖥️, keeps `database.types.ts` honest):
```bash
cd ~/xidigapp && SUPABASE_PROJECT_ID=<ref> pnpm db:gen-types
git diff --stat packages/db/src/database.types.ts   # should be empty/no-op if in sync
```

**3c. Enable Realtime** (🌐) — Dashboard → Project Settings → Realtime → **on**
(required for live DMs/notifications; the migration already registered the tables).

**3d. Auth dashboard settings** (🌐) — apply the table in
[runbook.md §Supabase auth configuration](runbook.md#supabase-auth-configuration).
The load-bearing ones:
- **Allow new users to sign up → OFF** (beta gate; the DB trigger is the second layer).
- Email OTP expiry → **3600 s**; do **not** enable Supabase SMTP (the app sends auth email).
- **Site URL** → `https://app.xidig.net` (must equal `APP_URL`).
- Phone provider (Twilio/compatible) → enable for SMS-OTP; SMS OTP expiry **600 s**, length **6**.

**3e. Storage** — nothing to do: the public `post-media` bucket (WebP, 5 MB) is
created lazily on first upload by `lib/media/storage.ts`. All media kinds
(avatar/cover/listing/space/candidate) share it.

**3f. Backups** (🌐) — confirm daily backups + set PITR (Dashboard → Database → Backups).

---

## 4. Environment file mapping (reference)

`.env.example` is the template. **Required** (app won't boot without a real value):
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`NEXT_PUBLIC_SUPABASE_URL` (=URL), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (=publishable),
`EMAIL_API_KEY`, `MAPTILER_KEY`, `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`,
`POSTHOG_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `AI_API_KEY`.

**Set for production** (have defaults, but you want real values):
- `APP_URL=https://app.xidig.net` — **critical**: auth links are built from this.
- `AI_MODERATION_PROVIDER=openai` — uses the free OpenAI omni-moderation model
  (with `AI_API_KEY` = your OpenAI key). Leave unset/`auto` only if you're using an
  Anthropic key instead. `console` = ship unscanned (reports + human queue only).
- `EMAIL_FROM="Xidig <noreply@mail.xidig.net>"`, `EMAIL_PROVIDER=auto`
- `CRON_SECRET=<openssl rand -hex 32>` — else the two cron sweeps 503 (see step 6).
- `EMAIL_WEBHOOK_SECRET=<whsec_… from Resend>` — else bounce-suppression is off.
- `AI_MODERATION_PROVIDER=auto`, `POSTHOG_HOST=…`

**Optional — Web Push (PWA)**, generate once (🖥️):
```bash
npx web-push generate-vapid-keys
# → VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY (=public),
#   VAPID_SUBJECT=mailto:ops@xidig.net   (unset = push disabled, in-app still works)
```

Local dev: `cp .env.example apps/web/.env.local` and fill in. Prod: step 5.

---

## 5. Vercel — deploy (🌐 + 🖥️, ~15 min)

1. **Import** the GitHub repo at vercel.com → New Project → `puresef/xidigapp`.
2. **Root Directory:** leave repo root (it's a pnpm monorepo; Vercel detects
   Next.js in `apps/web`). Build command / install are auto (`pnpm build` runs
   with `SKIP_ENV_VALIDATION=true`, so the build never needs secrets — real
   validation happens at runtime boot).
3. **Environment Variables** → add every var from step 4 (Production scope; add
   Preview too if you want preview deploys to boot). Paste from your collected keys.
4. **Production branch** → `main`.
5. **Deploy.** First deploy builds and boots; if a required env var is missing the
   runtime logs show the single aggregated "Invalid or missing environment
   variables" error naming each key.
6. **Cron** — `vercel.json` already declares the two jobs (`/api/cron/plaza`
   hourly, `/api/cron/labs` daily 03:00). Vercel auto-registers them and sends
   `Authorization: Bearer $CRON_SECRET` — just make sure `CRON_SECRET` is set.

CLI alternative for env (🖥️): `vercel env add APP_URL production` (repeat per var),
then `vercel --prod`.

---

## 6. DNS — app.xidig.net (🌐, ~5 min + propagation)

- In your DNS provider, add the record Vercel shows under Project → Settings →
  Domains for `app.xidig.net` (usually a `CNAME` → `cname.vercel-dns.com`).
- Keep the marketing site on `xidig.net` (unchanged); the app lives at
  `app.xidig.net` (matches the app-side external-links model).
- Confirm `APP_URL` and Supabase **Site URL** both equal `https://app.xidig.net`.

---

## 7. Email + SMS deliverability (🌐)

- Resend → Webhooks → add `https://app.xidig.net/api/webhooks/email`, events
  `email.bounced` + `email.complained`; copy the signing secret into
  `EMAIL_WEBHOOK_SECRET`.
- Publish SPF/DKIM/DMARC for `mail.xidig.net` (runbook §DNS authentication).
- Run the runbook's route-testing matrix (Proton link+code, Gmail, Somali SMS
  carriers) before inviting real members.

---

## 8. Post-deploy smoke (🖥️/browser, ~15 min)

- App loads at `https://app.xidig.net`; language toggle + dark mode work.
- **Seed the first admin/ops account** via the `signup_grants` path in
  [runbook.md §Ops/seed accounts](runbook.md#supabase-auth-configuration) — do
  **not** use the `xidig_gate_bypass` shortcut (500s on real GoTrue).
- Sign in (email+password / magic link / SMS-OTP); complete a profile (avatar
  upload → confirms the `post-media` bucket + transcode + moderation path).
- Create a Club, promote to Lab, post in Plaza (image + embed), send a DM
  (confirms Realtime), create a Candidate and confirm the region gate: a
  non-Somalia session sees the informational view with **no** Maalgeli button.
- Check Sentry receives events and PostHog is reachable (analytics stay dark
  until consent + Phase 7).

---

## 9. What is deliberately NOT live yet (tracked, not blockers)

- **Analytics events** (§23) fire from **Phase 7**; PostHog is provisioned but the
  Capital/experience events aren't emitted yet.
- **Candidate reporting / mod queue** and a dedicated verifier role → **Phase 6**
  (v1.0 reviewers = mod/admin, with recusal).
- **REST/MCP API** exposure → **Phase 8**.
- Native Somali copy review of new strings; WhatsApp OTP (v1.1); the v1.0
  experience backlog (Events+RSVP, business trust fields, tasks, page-block
  editor) — see the project notes.
