# Phase 7/8 live-smoke checklist

Run against a deployed staging instance (real Supabase + `CRON_SECRET` set).
No production credentials are needed in tests — this is manual pre-launch smoke.
Every step is safe to repeat (idempotent).

## Prereqs
- [ ] `SUPABASE_URL` / `SUPABASE_SECRET_KEY` set (GoTrue reachable)
- [ ] `CRON_SECRET` set
- [ ] Migrations applied through `20260709100000_phase8_ai_api.sql`

## Seeding
- [ ] `pnpm --filter @xidig/web seed` → returns a summary (tags/playbooks/posts/listings counts)
- [ ] Re-run the seed → same counts, **no duplicates** (check `/admin/seed`)
- [ ] `/admin/seed` (as admin) shows the seed run + seeded content counts
- [ ] AI account `@xidig_ai` profile shows the **"AI assistant"** chip
- [ ] A seeded Plaza post shows the **"Seeded"/"AI-assisted"** label
- [ ] A seeded listing in the directory shows the **"Seeded"** label + "Unclaimed"

## API keys
- [ ] `POST /api/me/api-keys` (as a member) with `["read","plaza:write"]` → returns a `secret` once
- [ ] `POST /api/me/api-keys` with `["admin"]` as a **member** → `403 forbidden`
- [ ] `GET /api/me/api-keys` → lists the key, **never** a hash
- [ ] `DELETE /api/me/api-keys/{id}` → revokes

## External REST API
- [ ] `GET /api/external/health` (no key) → `{status:"ok",...}`
- [ ] `GET /api/external/listings` with **no** key → `401 invalid_api_key`
- [ ] `GET /api/external/listings` with a **revoked/expired** key → `401`
- [ ] `GET /api/external/listings` with a `read` key → published listings, no contacts
- [ ] `POST /api/external/plaza/posts` with a `read`-only key → `403 insufficient_scope`
- [ ] `POST /api/external/plaza/posts` with `plaza:write` + `idempotencyKey` → `201 created`
- [ ] Repeat the same call → `200`, `created:false` (idempotent)
- [ ] Confirm the new post is authored by `@xidig_ai`, labelled, and in `audit_logs` with `api_key_id`

## MCP
- [ ] `XIDIG_API_KEY=… pnpm --filter @xidig/web mcp`, then `tools/list` → 5 tools
- [ ] `tools/call xidig_search_listings` → results
- [ ] `tools/call xidig_create_seeded_plaza_post` with a `read`-only key → tool error with §27 copy
- [ ] Writes appear in `audit_logs`

## Weekly digest
- [ ] `GET /api/cron/digest?dryRun=1` (Bearer CRON_SECRET) → candidates, no post
- [ ] `GET /api/cron/digest` → creates a pinned "This week in Xidig" post
- [ ] Re-run same week → `created:false` (no duplicate post)
- [ ] Digest post is pinned, labelled AI-assisted, links resolve, no private content

## Reputation / awards (Phase 7 hardening)
- [ ] `GET /api/cron/reputation` (Bearer CRON_SECRET) → `{ok:true}` (scores recompute/decay)
- [ ] `POST /api/admin/award-cycles` (as admin) `{quarter,closesAt}` → opens a cycle; award voting now works

## Provider resilience (fail-safe)
- [ ] Unset `CRON_SECRET` → cron + seed endpoints return `503`/reject, app still boots
- [ ] Unset `UPSTASH_*` → rate limiting fails open (warns), requests still work
- [ ] Unset `EMAIL_*` → digest still pins its post (email deferred), no crash
