# External REST API + security model (Phase 8, §21)

A small, scoped REST surface for **trusted external agents** (AI seeding bots,
integrations). It reuses the app's existing service layer — nothing here forks
validation, RLS, rate-limit, or audit logic. Base path: `/api/external`.

## Authentication

Every route except `/health` requires a **scoped API key**, sent as either:

```
Authorization: Bearer xdg_live_xxxxxxxx…
# or
x-api-key: xdg_live_xxxxxxxx…
```

Keys are minted by a signed-in account at **`POST /api/me/api-keys`** (see
below). The plaintext key is shown **once** at creation and never again — only
a SHA-256 hash is stored (`api_keys.key_hash`). Losing it means minting a new
one. What a key can do is bounded by its scopes **and by its owner's current
account standing** (see *Key owner standing*).

### Managing keys

| Method | Route | Auth | Notes |
| ------ | ----- | ---- | ----- |
| `POST` | `/api/me/api-keys` | signed-in account | `{ name, scopes[], expiresInDays? }` → `{ key, secret }`. `secret` is the plaintext key (shown once). Members, mods and accounts in the deletion grace may mint `read` only; only an **active admin** may mint the write scopes or `admin`. Asking for a scope your standing does not allow → `403`. 10 keys/day. |
| `GET`  | `/api/me/api-keys` | member | list own keys (safe projection — never the hash; each key carries `status`: `active` \| `revoked` \| `expired`) plus `mintableScopes` — exactly the scopes this caller may request today |
| `DELETE` | `/api/me/api-keys/{id}` | member | revoke (idempotent; an active admin may revoke any key) |

## Scopes

| Scope | Grants | Provenance of writes | Who may mint / use |
| ----- | ------ | -------------------- | ------------------ |
| `read` | read member/public-visible directory, listings, Labs, Plaza + digest candidates | no writes | any live account (active or in the deletion grace) |
| `plaza:write` | create labelled seeded Plaza posts | published as the **platform** — authored by the badged AI account | active admin only (operational) |
| `listings:write` | create/update labelled seeded listings | published as the **platform** — no owner; claimable | active admin only (operational) |
| `labs:write` | create/update labelled seeded **Lab templates** (playbooks) | published as the **platform** — no creator; upserts by template slug | active admin only (operational) |
| `admin` | system superset (satisfies every scope) | — | active admin only |

`admin` is a superset: an `admin` key satisfies any required scope. No route
currently requires `admin` specifically.

### Provenance rule for write scopes

External writes must not simulate or obscure organic member activity. **No
write scope preserves the key owner's own provenance**: every write publishes
as the platform (the AI account, or no owner/creator), carries a non-`member`
`source` (`seed` | `ai`) that the UI labels, and records the owner and key only
in `audit_logs`. The write scopes are therefore **operational**: only an active
admin may mint or use them, and every write is audited. A member- or mod-held
key minted with a write scope before this rule still exists but is narrowed to
`read` on every request — its writes are refused with `403
insufficient_scope`. There is no provenance-preserving (member-attributed)
write route today, and none is planned in this layer: a future member-authored
write API would have to preserve real member/integration provenance and would
need its own approval.

**Legacy keys are revoked, not just narrowed.** Migration
`20260911000800_revoke_legacy_unsafe_api_keys` revoked every live key that
lists `plaza:write`, `listings:write`, `labs:write` or `admin` and whose owner
is active or in the deletion grace but not an active admin. From then on, a
trigger revokes such keys whenever an owner stops being an active admin while
still live (demotion, entering the grace, reinstatement as a non-admin).
Each revocation writes an immutable `audit_logs` row (`api_key.revoked`,
reason `legacy_non_admin_write_scope_revoked` or
`owner_no_longer_active_admin`; no key material). Suspended and deactivated
owners' keys are not revoked — they are refused on use and work again only if
the account is reinstated in a standing that allows them.

### Key owner standing

Every request re-reads the key owner's account and narrows the key's granted
scopes to what that standing allows **at that moment**:

| Owner standing | Key authenticates? | Usable scopes |
| -------------- | ------------------ | ------------- |
| active admin | yes | everything the key was granted |
| active member or mod | yes | `read` (if granted) |
| deletion grace (`pending_deletion`) | yes | `read` (if granted) — no write or `admin` scope |
| suspended or deactivated | **no** — `401 invalid_api_key` | none (the key is not revoked; it works again if the account is reinstated) |
| deleted | **no** — `401 invalid_api_key` | none; the key is also **revoked** in the data when the account becomes deleted |

An admin whose role is removed loses `admin` and the write scopes on their
existing keys at once. Denials are audited with the reason
(`owner_not_live`, `owner_not_active`, `scope_admin_only`,
`insufficient_scope`) — never with key material.

## Endpoints

| Method | Route | Scope | Notes |
| ------ | ----- | ----- | ----- |
| `GET`  | `/api/external/health` | none | status + version + scope list. No secrets. |
| `GET`  | `/api/external/listings` | `read` | deterministic directory read; filters `city`, `country`, `category` (slug), `tag` (name), `limit` (≤50), `cursor`. Published-only, discovery fields, **no contacts/address**. |
| `POST` | `/api/external/plaza/posts` | `plaza:write` | create seeded Plaza post (authored by the AI account). Body below. Idempotent. |
| `POST` | `/api/external/listings` | `listings:write` | create seeded **unclaimed** listing. Idempotent. |
| `PATCH`| `/api/external/listings/{id}` | `listings:write` | update a **seeded** listing (never a member's). |
| `POST` | `/api/external/labs` | `labs:write` | create/update a seeded **Lab template** (playbook), idempotent on slug. Live-Lab creation is deferred (see below). |
| `PATCH`| `/api/external/labs/{id}` | `labs:write` | update a seeded Lab template. |
| `GET`  | `/api/external/digest/candidates` | `read` | deterministic weekly-digest candidates (Wins/Asks/Labs/listings/mentor). |

### `POST /api/external/plaza/posts` body

```jsonc
{
  "type": "win",              // intro | ask | win | update
  "title": "First 100 users", // optional
  "body": "We shipped …",     // required, ≤5000
  "linkUrl": "https://…",     // optional
  "tags": ["fintech"],        // optional — EXISTING tag names only (unknown ignored, never created)
  "source": "seed",           // seed | ai (default seed) — sets the visible label
  "idempotencyKey": "abc123"  // optional — a retry with the same key is a no-op
}
```

### `POST /api/external/listings` body

```jsonc
{
  "businessName": "Banadir Fresh Produce",
  "category": "agriculture",   // listing_categories slug (required)
  "shortDescription": "…",
  "city": "Mogadishu", "country": "Somalia",
  "landmark": "…", "latitude": 2.04, "longitude": 45.31,
  "tags": ["agri-food"],
  "source": "seed",
  "idempotencyKey": "…"
}
```

## Idempotency

Seed writes de-duplicate through the `seed_entities` registry. The dedup key is
namespaced per API key so two callers never collide:

- with `idempotencyKey`: `ext:<api_key_id>:<idempotencyKey>`
- without: `ext:<api_key_id>:auto:<sha256(content)>` — an identical retry still
  de-duplicates.

A retry returns the existing entity with `created: false` (HTTP 200); a fresh
write returns `created: true` (HTTP 201).

## Rate limits

Per-key, default **120 requests/minute** (Upstash Redis, fail-open). A key may
carry a tighter `rate_limit_per_minute` override. Over the limit → `429`
`rate_limited`.

## Error shape (§27)

All errors use the app envelope with plain-language, locale-resolved copy:

```jsonc
{ "error": { "code": "invalid_api_key", "message": "That API key isn't valid. …" } }
```

| Code | HTTP | Meaning |
| ---- | ---- | ------- |
| `invalid_api_key` | 401 | missing / unknown / revoked key, or the owner is suspended / deactivated / deleted |
| `api_key_expired` | 401 | key past its `expires_at` |
| `insufficient_scope` | 403 | valid key, wrong scope — or a scope the owner's current standing does not allow |
| `rate_limited` | 429 | over the per-key limit |
| `invalid_request` | 400 | body/params failed validation |

## Auditing

Every external write records an `audit_logs` row carrying `api_key_id`, the
acting owner, the action (`external.post.created`, `external.listing.updated`,
`external.denied.<scope>`, …), the target entity, and a PII-free metadata blob.
Rejected under-scoped attempts are audited too.

## Security model

- **Service-role boundary.** External routes hold no user session; they use the
  service-role client but every read hard-codes the same predicates RLS would
  enforce (published-only, public-only), and every write goes through the
  labelled seed builders. No route echoes service-role data without an authz
  check.
- **RLS.** New Phase-8 tables (`seed_runs`, `seed_entities`, `digest_editions`)
  are admin-select-only with client writes revoked. `api_keys` is RLS-locked to
  every client role (the hash is never client-readable).
- **What agents CAN do:** read published directory/Plaza/Lab/digest data
  (discovery fields); and, **with an active admin's operational key only**,
  create/update **labelled seeded** posts, listings, and Lab templates. **What
  they CANNOT do:** read private DMs, admin notes, moderation internals,
  hidden/removed content, member contact details in bulk; impersonate a member
  (seeded posts are authored by the badged AI account); publish as the platform
  on a member's or mod's key; mutate a real member's content; outlive their
  owner's suspension, deactivation or deletion; mint admin keys; or earn
  reputation.

## Deferred (documented, not built)

- **Live Lab instances via API** — a fake active build-in-public Lab is fake
  social proof and needs a human lead. Only Lab *templates* (playbooks) are
  writable. 
- **Candidate/Capital writes** — compliance-sensitive (no money movement, §17);
  candidate data is read-only where public.
- **Webhooks** — the `webhook_endpoints` table exists (Phase 0) but outbound
  delivery is not wired in v1.0.
- **Meilisearch** — search + the external listings read run on Postgres trgm;
  Phase 8 does not depend on Meilisearch, so its sync stays deferred (Alpha
  Hardening Debt).
