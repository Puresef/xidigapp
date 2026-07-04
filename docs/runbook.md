# Xidig Runbook

Operational reference for running, backing up, restoring, and responding to
incidents in Xidig. This is a **stub** — fill in real values (project refs,
dashboards, on-call rotations) as the infrastructure is provisioned.

## Contents

- [Environment](#environment)
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
| Email            | _TBD_         | `EMAIL_API_KEY`                                                                                                                       |
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
