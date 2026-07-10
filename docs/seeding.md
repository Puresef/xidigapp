# Seeding + weekly digest (Phase 8, §21)

How launch-density seeding and the weekly digest work, and how to run them
safely. Everything here is **idempotent** and **labelled**.

## AI-assistant account

A single badged `is_ai` account (handle **`xidig_ai`**, display "Xidig AI")
authors all seeded/AI content, so seeded content never impersonates a member.
Provisioned by the seed job (via a signup grant + `admin.createUser`, the path
verified to work on real GoTrue). Phase 7's reputation engine already blocks
`is_ai` accounts from Helper score; seeded content earns **no** reputation at
all, so an AI account can never climb a human leaderboard.

## What gets seeded

- **AI-assistant account** (once, idempotent on handle)
- **Tags** — ~10 approved starter tags (idempotent on name)
- **Lab templates (playbooks)** — a few venture charters (idempotent on slug;
  complements the migration-seeded set)
- **Plaza posts** — welcome + demo Wins/Ask/Update (source `seed`/`ai`)
- **Listings** — ~6 UNCLAIMED starter listings (generic demo names, never a real
  business; real owners can claim them via the §18 flow)

Dataset lives in `apps/web/src/lib/seed/data.ts` (curated + deterministic — not
live-LLM-generated, so it is reproducible and safe to re-run).

## How to run

Seeding runs inside the app (so it reuses the labelled content builders + env).
Start the dev/staging server, then drive the job with the CLI (authenticated by
`CRON_SECRET`, service scope):

```bash
# Run (idempotent — re-running is a no-op):
CRON_SECRET=... APP_URL=http://localhost:3000 pnpm --filter @xidig/web seed

# Reset a run (local/staging only; blocked in production):
CRON_SECRET=... APP_URL=http://localhost:3000 pnpm --filter @xidig/web seed -- --reset
```

Under the hood the CLI calls `POST /api/admin/seed` (or `DELETE` for reset),
which is authorised by **either** an admin session **or** the `CRON_SECRET`
bearer. Admins can also trigger it from a dashboard button.

## How idempotency works

- Entities with a natural unique key (tags.name, playbooks.slug) upsert on that
  key.
- Posts + listings register in the **`seed_entities`** table, keyed by a
  deterministic `(entity_type, dedup_key)` — `seed:<run_label>:<natural_key>`.
  A re-run resolves to the existing entity instead of duplicating.
- The named batch lives in **`seed_runs`** (`label` unique); reset deletes the
  run's registered posts/listings + the demo playbooks (leaving shared tags and
  the AI account intact).

## Labels

Every seeded row carries a non-`member` `source` (`seed` | `ai`). The UI renders
a violet **`ContentSourceBadge`** — "Seeded" / "AI-assisted" — on Plaza post
cards, listing cards, and the digest post; the AI account shows an "AI assistant"
chip on its profile. Admins review seeded content at **`/admin/seed`**.

## Safe environments

- Reset is **blocked in production** (`DELETE /api/admin/seed` returns 403 when
  `NODE_ENV=production`).
- Seeding requires a real Supabase (GoTrue) to provision the AI account; it
  fails with a clear error otherwise (it does not crash the app).

## Launch-day density manifest (extras plan item 7)

What "occupied, not empty" looks like per surface on day one, all inside the
locked rules: **badge-labeled, earns no reputation, never front-door proof, no
fake people, no real-business impersonation.** The dataset in
`apps/web/src/lib/seed/data.ts` implements this manifest; the guards in
`apps/web/src/lib/seed/data.test.ts` make the rules structural (unique keys,
`(demo)` labels, self-describing bodies, known tags/categories, sizing
ceilings), so expanding the dataset without honoring the manifest fails CI.

| Surface | Day-one target | Shape | Why this size |
|---|---|---|---|
| **Plaza** | 8 posts (ceiling 12) | 1 AI welcome + 3 Wins + 2 Asks + 2 Updates, spread across tags | First screen shows every post type in use; few enough that the first organic post is immediately visible (chronological feed, no ranking) |
| **Suuq** | 10 unclaimed listings (ceiling 12) | 10 of the 15 categories, 6 cities, all "(demo)"-suffixed and claimable via the §18 flow | The directory demonstrates breadth (category + map spread) without crowding out the first real businesses |
| **Labs** | **0 seeded live Labs — ever** | Density = templates only: 3 seeded playbooks + the migration-seeded charter set | A "building in public" surface with fake activity is exactly the fabrication the front door forbids; empty-but-honest beats occupied-but-fake here |
| **Tags** | 10 approved starter tags (+15 migration-seeded) | Covers the seeded posts/listings | Enough for real posts to find an existing tag; no expansion needed |

**Retirement plan.** Feeds are chronological with no ranking, so seeded posts
age out mechanically as organic content arrives — a seed can never resurface
above a newer member post. Seeded listings persist as *claimable* rows (a real
owner claiming one converts it into real content, which is the goal). Staging
tears down via `seed -- --reset`; in production (reset blocked) seeds simply
stay labelled and sink — never delete member replies by removing a seeded
parent. **Never top up density post-launch**: raising the ceilings in
`data.test.ts` is a product decision that happens in this document first.

**Expansion procedure.** New entries go in `data.ts` under the same
`launch-density-v1` run label with new deterministic keys (re-run stays
idempotent; existing rows untouched), must pass `data.test.ts`, and must stay
generic/honest — descriptive demo names, no real business's identity, no
invented people. The organic-proof invariant tests
(`apps/web/src/lib/front/organic.test.ts`) independently guarantee none of it
ever counts as front-door proof.

---

# Weekly digest

Compiles a **"This week in Xidig"** summary — top Wins, open Asks, new public
Labs, new listings, and the mentor highlight — into a **pinned Plaza post**
authored by the AI account (labelled AI-assisted).

## Run

Scheduled by Vercel Cron (`vercel.json`): **`/api/cron/digest`, Mondays 08:00
UTC**, authorised by `CRON_SECRET`. Manual:

```bash
# Publish this week's digest (idempotent per ISO week):
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/digest"

# Dry run — collect candidates + build the email template WITHOUT pinning a post:
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/digest?dryRun=1"
```

## Idempotency + visibility

- One edition per ISO week (`digest_editions.period_key` unique). Generating
  twice for the same week returns the existing edition — no second post, no
  duplicate spam.
- Candidates are **deterministic** (chronological, no ranking/personalization)
  and **visibility-safe** (published Plaza posts, public+listed Labs, published
  listings only — never a private Lab, hidden content, or DMs). The stored
  snapshot is PII-free (ids + public titles).
- Publishing unpins the previous week's digest so the highlights slot stays
  clean.

## Email

The digest **email template** (subject/text/html) is built and returned, but
**bulk sending to members is deferred** — the digest-email channel is not yet
wired to a safe bulk sender with per-member consent/quiet-hours. This is
documented Alpha Hardening Debt; the pinned post ships now.
