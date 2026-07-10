# Xidig Front Door — the public site grows out of the app

*Strategy for scrapping the old xidig.net marketing site and building the front-facing layer inside `apps/web`, which then moves to the apex domain. Synthesizes the winning ideas from `xidig/SITE_RETHINK.md` (already critique-hardened) against a full recon of the app codebase, then adversarially re-reviewed from technical and strategy lenses. 9 Jul 2026.*

---

> **Positioning update (9 Jul, Warya):** the front door is **social-app-first, proof-first — never dashboard-first**. Public framing: *"The Somali social app for connection, discovery, and building."* The casual visitor comes for the feed/people/businesses/DMs (competing with WhatsApp groups, Instagram, TikTok — by being more useful, searchable, and Somali-first, not by copying engagement bait); the serious user stays for Labs/Capital/governance. Live numbers are optional modules behind the §4 data floor; if numbers are sparse or unsafe, show qualitative proof. Counters/charts never drive the layout. The funnel ladder: casual visitor → feed/people/businesses → profile + follow → first post/Ask/Win → DM/bookmark/share → join Lab / attend event → co-sign / Supporter → governance/Capital. Homepage sections implemented to this framing in Phase A (hero, "everything your groups are missing", Madal/Profiles/Suuq/Fariimo/Labs/Capital blocks, Lite + community-owned, "real by default", final CTA). Extras roadmap reframed in `docs/social-app-extras-plan.md`.

## 1. Verdict

The rethink's core discipline survives intact and gets **cheaper, faster, and more honest** in the merged world — reframed per the positioning note above: the organizing principle is a **fast, honest, bilingual proof-of-work front door**, not a dashboard. The load-bearing rule it keeps — *every impact/social claim is a live projection of real app data, or it does not appear, delivered under a hard low-bandwidth budget* — survives as a governing constraint: live numbers are optional modules behind the §4 data floor, and named real examples carry the proof otherwise. That rule was designed for a separate marketing repo that would have to pipe app data across an API boundary. Merging the front door into `apps/web` collapses that boundary: the "live projections" become internal function calls that already exist (`getPublicLabView`, `getPublicCandidateView`, `getPublicProfileView`), the bilingual and low-bandwidth commitments are already institutionalized as build gates and components (i18n coverage floor, `MediaSlot`/Lite), and the honest-CTA problem the rethink flagged as its most load-bearing open question is **already solved in the app's code**.

Three recon findings that reshape the plan:

1. **The signup gate is already graceful and honest (build-verified).** The rethink's Phase 0 ("verify what `/signup` does when signups are OFF") passes in code: signup is gated app-side by a `signup_grants` DB trigger + `app_settings.signup_mode` (`invite_only`/`waitlist`), a gateless submission renders a friendly banner with a "Join the waitlist" CTA (`src/lib/errors.ts:66-77`), and `/waitlist` captures email/phone into `waitlist_entries` with a live Founding-Member N/500 counter (`src/app/waitlist/page.tsx:19-27`). No hard-fail path exists, and the Supabase dashboard toggle is irrelevant — the app is its own gate. *Caveat: build-verified only; the migrations behind it are unpushed (Alpha Hardening Debt), so the cutover checklist includes a live smoke of exactly this flow (§8).*
2. **The data layer is one predicate away from marketing-safe, and one module away from cheap.** Per-entity public projections exist; what's missing is *list* projections, an aggregate stats module, and caching (every public page is `force-dynamic`; zero ISR/`unstable_cache` in the codebase). Critically, no existing public projection filters seeded/AI content — see the organic-proof invariant (§4).
3. **The old site's one durable asset ports in an afternoon.** 14 SEO reports live in a single 102KB JSON (`xidig/src/data/economic-indicators.json`) with FAQs, per-report Article/FAQPage JSON-LD patterns, and 10 PDFs. Everything else of value is tokens (`#0077cc` somali-blue / `#FF8C00` sunset-orange / `#0D0D0D`), the Organization-schema `areaServed` list of Somali cities + diaspora hubs, and a working Resend email integration (whose `WeeklyUpdateEmail` template doubles as the missing Phase-8 digest email rail).

What the merge genuinely dissolves: the cross-origin CTA/UTM plumbing, the "site fakes what the app has" failure mode (same codebase renders both), and the burden of keeping two deployments in sync. What it does **not** dissolve: the legal review burden — the two-document coordination problem goes away, but a single product-wide policy set now sits on the public acquisition surface and **gates the domain cutover** (§8).

## 2. Architecture: viewer-branched single shell

Three options considered:

- **Second app in the monorepo (`apps/marketing`)** — rejected. Recreates the exact boundary we're merging to remove: separate deployment, duplicated i18n/link/legal surfaces, data access via API instead of function calls.
- **Route-group split (`(marketing)`/`(app)` with a minimal root layout)** — rejected as the *primary* mechanism. It forces relocating ~50 route segments, `/` can only live in one group (the signed-in home and the landing share that URL), and it fights the house pattern: 41 pages already branch per-request on `getAuthContext()`.
- **Viewer-branched shell (chosen).** The root layout already resolves the viewer server-side (`getHeaderViewer()`) but today renders identical chrome either way — only `UserMenu` branches, and `BadgeProvider` fires a guaranteed-401 notifications fetch for every anonymous visitor. The work is to extend that resolved-viewer branch to the whole header and provider mount: **signed-out visitors get marketing chrome** (front-door nav: Product / Labs / Capital / Reports / Membership + one "Request Access"/"Join" CTA; no BadgeProvider, no notification polling, no supabase-js in the bundle), **signed-in members get the current app chrome unchanged**. This is new construction of a second chrome branch, not a tweak — but it verifies as clean: `BadgeProvider` wraps only the header, `useBadges` has a default context value, and marketing pages need only the already-present `LocaleProvider`. `src/app/page.tsx`'s signed-out arm (today: three strings and a button) becomes the full landing page. Marketing-only static pages live in a `(front)` route-group folder for organization — same root layout, no URL impact.

The governing principle: **don't build marketing copies of app surfaces — give app routes a public signed-out branch.** `/labs/[slug]`, `/c/[id]`, `/u/[handle]`, `/search` already work this way, and the proxy doesn't fight it (its `PROTECTED_PREFIXES` are only `/settings`, `/admin`, `/onboarding`; `/labs` and `/capital` gate app-side today and can grow public branches without touching middleware). Signed-out = acquisition surface, signed-in = product, same URL. The brochure *is* the product. A WhatsApp share of any Lab or profile lands a signed-out visitor on a page whose chrome sells the product — every share link becomes a landing page for free.

**Page-layer caching contract (stated, so nobody discovers it in an incident):** session-branched routes (`/`, `/labs`, `/capital`) are dynamic SSR by construction — there is no static home in this architecture. v1 keeps them dynamic with all *data* served from the cached stats/list modules (§4), so TTFB is dominated by cached reads. If CDN/edge caching is ever added to these routes, the cache key **must** vary on session-cookie presence — otherwise a member's home page can be served to anonymous visitors (or vice versa). The CI budget tracks TTFB alongside page weight (§5).

## 3. Route map and redirects

### New/changed public surfaces (xidig.net)

| Route | State | Content |
|---|---|---|
| `/` (signed-out) | **REPLACE** welcome stub | Front-door landing (fast, honest, bilingual proof-of-work): the one-sentence promise, proof strip as an optional data-floor-governed module (§4), launch-day proof surface (§4), Request Access CTA, Founding-Member N/500 counter |
| `/product` | **NEW** (static) | The present-tense "what you get today" tour: Plaza / Labs / Capital / Directory / Verification. Kept **separate from `/about` on purpose** — the old site's root identity failure was blending product, fund, and manifesto into one incoherent pitch; we don't rebuild that on one URL |
| `/about` | **NEW** (static) | Story + manifesto (absorbs old `/about`, `/vision`); fund/Maalgeli section **last and legal-gated** (§9-Q3) |
| `/labs` (signed-out) | **NEW branch** | Public Labs directory — `visibility='public'` list projection, honest Dormant badges |
| `/capital` (signed-out) | **NEW branch** | Public venture candidates list (`timeline_public` gate) + decided-items governance log; never invest language (matches `/c/[id]` precedent) |
| `/membership` | **NEW** (static + tier data) | Canonical pricing from `membership_tiers` (free / supporter $1/mo); honest "billing rails not live yet" phrasing |
| `/reports`, `/reports/[slug]` | **PORT** (static) | 14 reports 1:1 slug-frozen; sourcing labels ("community-compiled + cited"); Article/FAQPage JSON-LD; images re-encoded AVIF |
| `/business` | **NEW, Phase B** (thin but real) | The business lane the old site served with two working intakes: SSR projection of published listings + directory pointers + the Resend enquiry intake. Business trust fields are on the v1.0 backlog — this audience is in-scope, not deferred |
| `/contact` | **PORT, Phase A** | Old site's working Resend intake (`/api/send` + React Email templates) |
| `/privacy`, `/terms` | **NEW** | Single product-wide policies. Capital/payments/governance sections **severable and gated** like the fund section (preserving the protective intent of the rethink's split inside the one-doc model); Biometric-Verification disclosures depend on the DPIA (`docs/dpia-verification.md`, a launch gate). **Legal sign-off gates the domain cutover, not Phase A** |
| `/waitlist` | exists | Gains `from` attribution + an "updates only" lane (§5) |
| `/support/guidelines` | exists (stub) | Becomes real **only after** the content policy is finalized + legally reviewed (rethink rule preserved) |

Deliberately absent, per the rethink's rejections: no autoplay video, no glassmorphism/glow, no fake anything, no separate newsletter page (the waitlist's "updates only" lane is the capture path until the Phase-8 digest email rail ships and becomes the newsletter), no `/events` (fake events die; when the v1.0-backlog Events+RSVP feature ships in-app, a public events surface joins the front door then).

### 301 map — topical targets, no homepage dumps

Path-only rules are host-agnostic and **staged in `next.config` from Phase A** (they're inert until the apex points at the app, but harmless if hit on app.xidig.net). The host-level `app.xidig.net/* → xidig.net/*` 308 is **not** stageable — deployed early it would redirect all product traffic to the old marketing site. It ships env-gated (included only when `APP_URL === 'https://xidig.net'`) as cutover step 7, and excludes `/api/cron/*` so scheduled callers that don't follow redirects keep working until re-pointed.

| Old xidig.net route | → | Rationale |
|---|---|---|
| `/reports/[slug]` ×14 | same paths | port 1:1, slugs frozen — no redirect needed |
| `/how-it-works` | `/product` | rethink's own mapping, restored |
| `/vision`, `/investment-guide`, `/public-fund`, `/about` | `/about` | ambition/fund content consolidates; fund section gated |
| `/ventures`, `/submit-project` | `/capital` | topical survivor |
| `/membership-tiers`, `/membership` | `/membership` | canonical pricing |
| `/business-network`, `/partnerships`, `/business-enquiries` | `/business` (until it ships: `/contact`) | keeps the business lane's working-intake equity; re-point at Phase B |
| `/community-guidelines` | `/support/guidelines` | content-policy-gated target |
| `/coming-soon`, `/newsletter` | `/waitlist` | the honest capture surface |
| `/events`, `/events/[slug]` | `/waitlist` | capture surface beats a homepage dump |
| `/careers`, `/contributor-roles` | `/about` **(default pending §9-Q6)** | if Warya keeps `/careers`, re-point before cutover |
| `/community`, `/social-hub` | `/` | **explicit equity write-off** — thin fabricated pages with ~no real equity; we accept the soft-404 treatment rather than pretend a topical target exists |

### SEO plumbing (net-new — the app has none today) + the duplicate-content rule

`metadataBase` from `env.APP_URL`; `app/robots.ts`; `app/sitemap.ts`; canonicals on public pages; keep the per-member `discoverable_search_engines=false → noindex` rule (it composes cleanly with app-level robots). Port the Organization JSON-LD with the Somali-cities/diaspora-hubs `areaServed` list verbatim from `xidig/src/data/schemas.ts`.

**Indexing is env-gated: while the app serves on app.xidig.net, all front-door routes are `noindex` and robots disallows them; indexing flips on only when `APP_URL` is the apex.** This closes the cross-host duplicate-content window — during the overlap, the old xidig.net remains the sole indexed owner of the 14 report URLs, and Google never sees the same reports (or a second product narrative) on two hosts. The reports port can therefore land whenever convenient; it becomes visible to crawlers exactly once, on the apex. Post-cutover robots: allow front-door + public projections (`/u/*`, `/l/*`, `/labs/*`, `/c/*`); disallow `/api`, `/admin`, `/settings`, `/messages`, `/onboarding`, `/auth`, `/signin`, `/signup`.

## 4. Data contracts

**The organic-proof invariant (non-negotiable, new):** every front-door count and projection excludes seeded/AI content — *never launder seed data into social proof*. In-app, seeded content is fine (it wears `ContentSourceBadge`); on the front door, presenting it as organic proof is exactly the fabrication the rethink calls existential. Per-table mechanics, because the schema isn't uniform:

- `source='member'` where the `content_source` column exists: `posts`, `comments`, `business_listings`, `labs`, `lab_updates`, `tags`.
- `venture_candidates` has **no** source column — filter via creator `users.is_ai` / the `seed_entities` registry (exposure is currently theoretical: the Phase-8 seeder never writes candidates or labs), or add the column in the Phase-B migration for uniformity.
- Member counts exclude `users.is_ai` — including the Founding-Member counter, which today counts all users.

No existing public projection applies any of this (`getPublicLabView`, `getPublicCandidateView`, `getPublicProfileView`, the waitlist counter) — Phase B retrofits them all.

> **Status (extras item 7, 10 Jul):** the invariant now has teeth where the front door queries live today. `apps/web/src/lib/front/organic.ts` is the single shared helper module (`countFoundingSpotsLeft` / `foundingMembersCountQuery` / `applyOrganicContentFilter` / the `SOURCE_COLUMN_TABLES` list); the founding counter on `/waitlist` **and** the signed-out home both count through it (the `is_ai` exclusion above is done). `apps/web/src/lib/front/organic.test.ts` unit-tests the filters *and* source-scans every front-door module (`lib/front`, `components/front`, `app/(front)`, the home + waitlist pages): a future front-door query touching `users` or a `source`-carrying table without the organic filter **fails the test suite** — Phase B's stats/list projections must route through these helpers or the scan makes forgetting loud. Seed-data honesty is separately guarded by `apps/web/src/lib/seed/data.test.ts` against the launch-density manifest in `docs/seeding.md`.

| Surface | Source | Status |
|---|---|---|
| Home counter strip (members, Labs active 7d, ventures in review, Asks answered, co-signs) | New `lib/stats` module: service-role counts over `users` / `labs.last_activity_at` / `venture_candidates.status` / `posts.ask_status` / `interests`, cached (`unstable_cache`, 5–15 min revalidate — verified the right API on this Next version; the service-role module reads no cookies, so it caches cleanly), organic-filtered | **Build** |
| Founding-Member N/500 | `FOUNDING_MEMBER_CAP` + `users` count | **Exists** on `/waitlist`; reuse + cache + exclude `is_ai` |
| Public Labs list | `visibility='public'` + `LAB_PUBLIC_COLUMNS` + `computeDormant()` | **Build** (per-slug projection exists; list is new) |
| Public candidates list + governance decided log | `getPublicCandidateView` gate (`timeline_public ∧ visibility='all_members' ∧ status≠draft`) + `decided_at` items | **Build**; public vote-tally exposure is a policy call — default keep members-only |
| Plaza highlights strip | New narrow projection: `pinned_at IS NOT NULL ∧ status='published' ∧ source='member'`, excerpt columns only, reaction counts via service-role aggregate | **Build** + consent (below) |
| Directory intelligence ("N fintech builders in X") | `profiles.location_*` + `lanes`/`skills` GIN indexes; suppress cells with N<5 | **Build later** (Phase C) — nothing exists |
| Reports | Static port of the 14-report JSON | **Port** |

**Data floor (kept verbatim from the rethink):** counters ship only above minimum thresholds (≥8 public Labs, ≥3 ventures in review, ≥1 week non-zero reaction activity; highlights need ≥5 cleared pinned posts). Below the floor, the strip degrades to a curated "Building right now" rail of 3–5 named real Labs with their latest real build-log line.

**And below *that* — the launch-day reality.** The rail itself has a floor the pre-launch DB likely doesn't clear: 3–5 *organic* public Labs may simply not exist on day one (the seeder populates only seed-marked content, which the invariant excludes). So the terminal state is **designed content, not an error fallback**: founder-voice narrative ("what we're building, in public, starting now"), the reports pillar, and the Founding-Member N/500 counter — the one number that is real, scarce, and compelling from day zero. Pre-Phase-A checkpoint: count today's organic public Labs (rethink Open Q#2's "with what real numbers" half) and pick the landing's launch tier accordingly. The ladder is: terminal designed content → named rail → counters, each rung turning on as thresholds clear.

**Resilience rule:** every live surface degrades on error one rung down the same ladder (stale cache → rail → designed terminal content). The front door must never 500 or skeleton-flash because a count query hiccuped.

**Member-spotlight consent (kept from the rethink, now cheap):** public-in-app ≠ consent to be marketing material. Before the Plaza highlights strip or any member spotlight ships: a toggle in `/settings/privacy` scoped to **all of Xidig's public/marketing surfaces** (front page, `/about` strips, OG/social reuse, annual-report examples — not just "the front page"), honored by every spotlight projection, with a stated takedown SLA: **a toggle-off takes effect within the cache window, ≤15 minutes**. Opt-out vs opt-in default is Warya's call (§9-Q2).

## 5. Instrumentation without betraying the consent posture

The app's analytics deliberately drop anonymous events (`hasAnalyticsConsent()` default-deny; anon ingest dropped at the gate). The front door must be measured — the old site's cardinal sin was zero instrumentation — without quietly reversing that stance:

1. **Waitlist attribution (the funnel spine):** an optional `from` field on `POST /api/waitlist` + column on `waitlist_entries` (one additive migration — the Zod schema extends non-breakingly), populated from each CTA's `?from=<page>` param. Plus an **"updates only" flag** on the same form, so a reports reader who wants the digest-newsletter but not membership has an honest capture lane until the Phase-8 digest email rail ships. Conversion by source page, zero cookies.
2. **Cookieless aggregate counters:** a `front_door_counters` table keyed `day × path × event × mode` — `mode` distinguishes signed-out renders (increment only those; member traffic on dual-mode routes would otherwise swamp visitor numbers), with a basic known-crawler UA filter (robots.ts *invites* bots onto these routes post-cutover). Service-role increment, no identifiers, no cookies. (Low-effort alternative: Vercel Analytics, also cookieless — but the first-party table matches the house posture and costs one insert.)
3. **Bounce: explicitly dropped, not silently missing.** The counter schema has no session concept, and building one would mean identifiers. Attribution (1) + per-page CTA clicks (2) cover the decisions bounce would inform. If Warya wants a bounce proxy later, it's a separate, consciously-taken step.
4. **CI budget:** per-route **compressed transfer size** and **TTFB**, enforced per PR.
5. **Inherited wart to fix in Phase A:** `trackClient` currently writes a persistent `xidig_anon_id` to localStorage for *signed-out* visitors (via the always-mounted `LiteAutoPrompt`) even though the server then drops the event. Make anon-id generation lazy/signed-in-only so the "no identifiers on the front door" claim is actually true, not just true-at-the-server.

**Per-phase acceptance criteria (the rethink's rule — every phase reports against the same signals):** Phase A ships when waitlist conversion is measurable per source page and the CI weight/TTFB budget is green. Phase B ships when the data-floor thresholds are evaluated against real numbers and each live surface demonstrably degrades down the ladder. Phase C reports against the same set.

## 6. The Somali commitments: Two Tongues + Performance-as-Brand

Both of the rethink's delivery constraints are already load-bearing infrastructure here — the front door inherits rather than builds them:

- **i18n:** all front-door copy in a new `marketing.*` namespace in `@xidig/i18n`. The coverage gate *forces* the decision the rethink asked for: a new namespace must be classified, and launch-floor classification requires 100% Somali before the build passes. Recommendation: launch-floor it — Somali-first is the brand. Plain-register SO ships first; *gabay* editorial voice lands only behind native review (§9-Q7). Composed legal-link sentences use the existing bracketed-sentinel pattern. The locale default already honors `Accept-Language` with Somali fallback — exactly the rethink's baseline.
- **Low-bandwidth, with the real numbers:** the current shell ships Sentry **with session-replay statically bundled** (~70–100KB gz on its own) plus supabase-js via the unconditional header components — so "<100KB" is unachievable until Phase A does two things: gate the app-only client JS behind the viewer branch (§2) and make Sentry replay lazy (or signed-in-only). The budget is stated precisely: **<100KB compressed transfer for signed-out front-door routes** (HTML+CSS+JS over the wire), plus a TTFB target, both in CI. All imagery through `MediaSlot` (blurhash + tap-to-load, connection-aware); report images re-encoded 21MB → ~3–4MB AVIF/WebP; system font stack already (no webfonts — verified); starfield/graph as static SSR SVG only; motion behind the existing reduced-motion pref. Phase C says it on the page — "This page: 47KB" — mirroring Lite's data-saved framing.
- **Design system:** the front door uses the **app's** design system and the real blue-X/star logo (unified-experience), not a port of the old site's CSS. The old duotone (`#0077cc`/`#FF8C00`) informs marketing-surface art direction (starfield, accents) as brand continuity, not a parallel theme. The Constellation Graph (Phase C) keeps its rethink contract: static build-time SVG, top ~40–60 nodes by real activity, degrades below ~12 nodes to the named rail.

## 7. Salvage manifest (what we take from the corpse)

From `xidig/` (trimmed 896MB → 23MB): `src/data/economic-indicators.json` (14 reports + FAQs), `public/Economic Indicators/` (10 PDFs), `public/images/reports/` (26 PNGs → re-encode), the JSON-LD patterns (`schemas.ts` Organization + areaServed list; Article/FAQPage/Breadcrumb components as patterns), the Resend integration (`api/send` + React Email templates — `WeeklyUpdateEmail` doubles as the missing Phase-8 digest email rail), `logo.png` + `butterfly_star.webm` as brand reference. **Plus one operational item: audit the existing Resend/newsletter audience** — any old-site subscribers get migrated into the "updates only" lane (with notice), not silently orphaned or re-framed as a membership waitlist they never joined. Nothing else. After the port lands, delete `xidig/` entirely.

## 8. Sequenced roadmap

Consistent with build-first: everything below is build-complete work; db push/domain DNS/provider config remain Alpha Hardening Debt — with one exception: **the cutover is a hard deadline, not "whenever"** (see Phase 0).

### Phase 0 — Tourniquet (old site, ~half a day, parallel with Phase A)
The old site keeps serving a **legally false privacy policy** ("no accounts/login"), fabricated social proof, and a funnel into a fake waitlist while we build. That was the rethink's *ship-this-week* finding and it doesn't get to quietly wait for cutover. Minimal triage on the old repo, no redesign: fix the privacy statement; strip fake posts / fake team / "500+" claims; repoint `/coming-soon` and every in-page CTA to `app.xidig.net/waitlist?from=<page>`. If Warya prefers not to touch the old codebase at all, the alternative is committing the cutover to a hard date immediately after Phase A smoke — one of the two must happen; the bleeding doesn't continue for an unbounded window.

### Phase A — Front Door Shell (days; one tiny additive migration)
Landing page replacing the 3-string welcome (promise sentence, launch-tier proof surface per §4, CTA, N/500 counter) · viewer-branched marketing chrome + app-JS gating + Sentry-replay lazy-loading (§6) · `/product`, `/about`, `/membership`, `/contact` (Resend port) · `/privacy` + `/terms` drafts (**cutover-gated on legal sign-off; Capital/payments sections severable; DPIA dependency named**) · flip `src/lib/external-links.ts`: footer + signup-terms links become internal (footer's plain-`<a>` comment updated); the `/support/guidelines` stub gets **reworked, not flipped** (it would otherwise link to itself) · `metadataBase` + env-gated robots/sitemap/canonicals (noindex until apex, §3) · waitlist `from` + updates-only migration · path-only 301 rows staged · anon-id fix (§5.5) · `marketing.*` namespace EN+SO · CI weight/TTFB budget. *Deploys to app.xidig.net, fully functional and un-indexed there.*

### Phase B — Make It Real (1–2 weeks; small read-layer + one settings toggle + optional `venture_candidates.source` column)
`lib/stats` cached module + data-floor ladder on the landing · public `/labs` index branch · public `/capital` index branch + decided-items log · reports port (JSON + AVIF pipeline + JSON-LD + PDFs) · `/business` thin-but-real page (listings projection + enquiry intake; re-point the three business 301s) · Plaza highlights projection + spotlight-consent toggle in `/settings/privacy` (scope + SLA per §4) · **organic-proof invariant retrofitted across all public projections and counters** · `front_door_counters`.

### Phase C — Category of One (design/content investment)
Constellation Graph per the node contract · directory-intelligence aggregates (N≥5 suppression) · on-page weight counter · gabay editorial pass (native-review-gated) · annual "State of Somali Diaspora Building" report fed by directory data.

### Domain cutover (hard-scheduled after Phase A smoke; legal sign-off of `/privacy` + `/terms` is a gate)
1. Verify front door live on app.xidig.net — including **live smoke of the gate**: a waitlist submission lands in `waitlist_entries` with its `from` value; a gateless signup attempt renders the graceful waitlist banner (this pays the relevant Alpha Hardening Debt: migrations must be pushed first) → 2. add `xidig.net` + `www` to the Vercel project → 3. flip `APP_URL=https://xidig.net` + redeploy (this simultaneously un-gates indexing and arms the host-308 rule) → 4. Supabase Site URL + redirect allow-list → 5. Resend webhook URL → 6. cron-job.org plaza URL → 7. host-308 `app.xidig.net/*` + `www` → apex live (excludes `/api/cron/*`; verify an auth-confirm link and a share link survive with query strings) → 8. decommission old site's apex DNS (the actual cut) → 9. smoke: auth email lands on new domain; push re-subscribe (origin-bound subscriptions die — one-time member re-opt-in; sessions re-auth once); MCP/external-API clients repoint `XIDIG_API_URL` → 10. Search Console + sitemap submit; update `docs/GO-LIVE.md` §3d/4/5.6/6/7/8, `runbook.md`, `alpha-hardening.md`, test fixtures. (`embeds.ts` already lists all three hosts in `INTERNAL_HOSTS` — nothing to do there.)

## 9. Decisions that are Warya's (everything else above is resolved)

1. **CTA copy:** "Request Access" vs "Join the waitlist" — both are honest today given the graceful gate; pick by tone. (Flip `signup_mode` to `waitlist`/open later and the CTA copy updates with it.)
2. **Spotlight consent default:** opt-out (featured unless toggled off) vs opt-in (featured only if toggled on). Rethink minimum is opt-out; opt-in is the stronger trust story.
3. **Fund section legal sign-off:** still gates the fund/Maalgeli portion of `/about` and the Capital/payments sections of `/terms`. The `/c/[id]` projection's "no invest language" rule is the precedent; ship both pages without those sections until cleared. Who signs off, and by when — this now also gates the cutover date.
4. **$1/mo:** commit the number on `/membership` (it's seeded in `membership_tiers`) or keep "~$1, reviewed with members"? And confirm the "billing not live yet" phrasing.
5. **Reports byline:** named analysts vs "community-compiled + cited." Recommend the latter now; either way the unsourced dollar figures get sourced or cut during the port.
6. **`/careers`:** fold into `/about` (the 301 default) or keep as a standalone static page for its recruiting voice. Decide before cutover so the redirect points right the first time.
7. **Native SO review:** who reviews the `marketing` namespace? Launch floor forces full SO coverage — plain register is fine to ship; gabay waits for the reviewer.
8. **Phase 0 form:** patch the old site (half a day in the old repo) or commit to a hard cutover date immediately after Phase A — which bleeding-stopper do you prefer?
