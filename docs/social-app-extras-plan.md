# Xidig as a Somali social app — v1.0 extras: canonical phased build plan

*Canonical plan for everything v1.0 beyond Phases 1–8 (which are build-complete; unpushed migrations are Alpha Hardening Debt, never blockers). Supersedes the 9 Jul draft while keeping its social-app-first positioning, funnels, and locked deferrals. Companion to `docs/front-door-plan.md` and `docs/alpha-hardening.md`. 9 Jul 2026.*

## 1. Positioning (unchanged)

**"The Somali social app for connection, discovery, and building."** Casual promise: post wins, ask for help, follow people and Labs, find businesses, DM safely, RSVP to events, save/share useful things — then naturally deepen into Labs → Capital → Supporter governance. Compete with WhatsApp groups / Instagram / TikTok / Facebook groups by being **more useful, searchable, trusted, Somali-first, low-data, and community-owned** — never by engagement-bait algorithms.

Approved register: *"Keep WhatsApp for family chats. Xidig is the Somali community you can search, follow, build with, and come back to."* Never "TikTok killer / WhatsApp replacement."

**Honesty rules survive every phase:** no fake metrics, posts, members, or dashboards. Homepage UI panels with invented Somali names/content cross the fabrication line — Phase A shipped feature blocks only; real UI panels arrive in Front Door Phase B from spotlight-consented real content (or clearly schematic, nameless illustrations). The front door is a **fast, honest, bilingual proof-of-work front door — never dashboard-first**; live numbers are optional modules behind the data floor, named real examples otherwise.

## 2. Shipped context (9 Jul)

**Front Door Phase A is live** inside `apps/web`: social-app-first homepage (`marketing.*` EN + plain SO), waitlist `source_page` attribution, env-gated SEO (noindex until apex), 301s staged, 14 reports ported text-first, teasers on `/labs` + `/capital`, real `is_ai`-excluded Founding-Member counter. Award-grade visual pass done same day. The Events block joins the homepage **only when Events ships** — the front door never advertises unbuilt features.

## 3. Casual funnels (measurement spine)

- **Scroller:** Plaza highlight → request access → follow 3 → react → Intro post → DMs → Lab/save.
- **Business owner:** listing page → claim → hours/photos/WhatsApp → contact clicks → updates → Supporter.
- **Student/young builder:** profile/Lab → create profile → skills → matched to Labs → task done → badge.
- **Diaspora supporter:** Candidate → co-sign → follow Lab → Supporter → governance vote.
- **Community member:** event/award/digest → request access → RSVP/follow → weekly digest → regular.

Measure via waitlist `source_page` + Phase-B `front_door_counters` (cookieless) + consented in-app analytics. **`signup_completed` / `invite_accepted` / `lab_revived` structurally cannot fire (documented Phase 7) — never fake or hand-report them**; funnel claims use only signals that actually emit.

## 4. Classification at a glance

| # | Item | Category |
|---|---|---|
| 1 | Consent-capture UI | **Before alpha — IN BUILD (Part A, parallel session)** |
| 2 | xidig.net tourniquet decision (Stop-the-Bleeding) | Before alpha (decision + ≤half-day execution) |
| 3 | Global search polish | Before alpha |
| 4 | Interest-based follow suggestions | Before alpha |
| 5 | Business trust fields | Before alpha |
| 6 | Digest bulk email channel | Before alpha (build; live sends after provider config) |
| 7 | Launch density plan | Before alpha |
| 8 | Events + RSVP | Before alpha |
| 9 | Lab tasks/kanban | During alpha |
| 10 | Per-type profile/Space templates | During alpha |
| 11 | Lab focus split | During alpha |
| 12 | Awards tally → Plaza auto-post | During alpha |
| 13 | Related-skill 0.5 matcher | During alpha |
| 14 | Notification email templating | During alpha |
| 15 | Front Door Phase B proof rails | Before public beta |
| 16 | "State of Somali Business" launch stat | Before public beta |
| 17 | Page-block editor | Post-v1.0 (v1.1) — pull-forward trigger only |
| 18 | Co-op / work-ledger / governance-engine ideas | Decision-only (category 5) — not v1.0 unless explicitly approved |

## 5. Item cards

### Before alpha

**1. Consent-capture UI — IN BUILD NOW (Part A, parallel session — do not double-build)**
- **Why:** Unblocks digest email + product-analytics opt-in; the §12 consent posture stays fail-closed until it ships. Not needed for front-door measurement (attribution + counters are consent-free by design).
- **Scope (as being built):** categories `essential`/`analytics`/`error_monitoring`; `consent_records` + `xidig_consent` cookie; banner signed-in only; settings surface.
- **Non-goals:** anon-visitor consent banners on the front door; dark patterns; pre-checked boxes.
- **Accept:** opt-in lands in `consent_records`; analytics stay dark without it; withdrawal immediate; Sentry honors `error_monitoring`.
- **Deps:** none — in flight. Dependents: item 6, PostHog activation.
- **Risk/privacy:** the gate must stay fail-closed on absent records; treat the parallel session's files as read-only.

**2. xidig.net tourniquet (Stop-the-Bleeding)**
- **Why:** The old site still serves a legally false privacy policy ("no accounts/login"), fabricated proof, and a dead-end funnel — a bounded window is mandatory (front-door-plan Phase 0).
- **Scope:** Warya picks one of two forms: (a) ≤half-day patch of the old repo (fix privacy statement, strip fabrications, repoint CTAs to `app.xidig.net/waitlist?from=<page>`), or (b) commit a hard cutover date immediately after Phase A live smoke. Then execute.
- **Non-goals:** old-site redesign; any new old-repo features.
- **Accept:** false privacy statement gone OR cutover date committed in writing; no CTA leads to `/coming-soon`.
- **Deps:** decision only. Cutover itself gates on legal sign-off of `/privacy`+`/terms` and DB push (Alpha Hardening).
- **Risk:** legal exposure clock is running; this is the one item where "whenever" is not acceptable.

**3. Global search polish**
- **Why:** "Searchable" is the core competitive line vs WhatsApp; Postgres/trgm search exists (`/api/search`, anon-capable) — this is product polish, not infra.
- **Scope:** multi-entity tabs (people/listings/Labs/posts; events tab when item 8 ships); transparent sort only (labeled recency/text-rank); teaching empty states; keep Maxamed/Mohamed normalization; Lite-mode; EN/SO.
- **Non-goals:** Meilisearch (deferred); personalized/behavioral ranking; search-history suggestions.
- **Accept:** multi-entity results; private/hidden/suspended excluded (projection-tested per entity); anon search returns only public projections; normalization intact; teach-empty-state shown.
- **Deps:** none structural.
- **Risk/privacy:** search is the classic RLS leak path — add projection tests per entity type before shipping tabs.

**4. Interest-based follow suggestions**
- **Why:** Cold-start follow graph is the scroller funnel's second rung ("follow 3"); declared-fields-only keeps the no-algorithm promise literal.
- **Scope:** onboarding + directory suggestions from declared fields only (lanes/skills/city/open-to/Labs-seeking); every suggestion shows its reason ("Shares your fintech lane"); follow/skip; reuse the Phase-7 matcher base (`apps/web/src/lib/matching/looking-for.ts`).
- **Non-goals:** behavioral signals; engagement/follower-count ranking; collaborative filtering; "people also followed."
- **Accept:** 3–10 suggestions at onboarding with visible reasons; deterministic given the same declared data; graceful sparse-profile empty state; zero hidden ranking.
- **Deps:** matcher lib only.
- **Risk/fairness:** don't rank by popularity (feedback loops); use only fields the member chose to declare, respecting profile visibility.

**5. Business trust fields**
- **Why:** The business-owner funnel (claim → hours/photos/WhatsApp → contact clicks) is the directory's value prop; trust **without reviews** is the differentiator.
- **Scope:** mostly gap-fill — schema already has `opening_hours`, `price_range`, typed `contact_links` (WhatsApp), `verification_status` (unverified/pending/verified), primary-photo denorms, and a claims route (`/api/listings/[id]/claims`). Add: services list field (small additive migration); claimed/verified badges on cards + public page; directory filters (verified/price/open-now); prominent one-tap WhatsApp CTA; report/save/share coverage audit.
- **Non-goals:** ratings/reviews, anonymous complaints, booking, payments.
- **Accept:** owner edits all fields; filters work; public listing page shows them signed-out; WhatsApp CTA one tap; no review UI anywhere.
- **Deps:** one additive migration; `listing-view` projection update; i18n keys.
- **Risk:** "verified" must map to the Phase-6 verifier flow — never self-declared; keep hours honest but simple (no staleness engine in v1.0).

**6. Digest bulk email channel**
- **Why:** The weekly comeback loop. Phase-8 generator + pinned Plaza post exist; email is the retention channel for members not in-app daily.
- **Scope:** send loop over **consenting** members; `lib/digest/render.ts` already renders an email body — adapt the salvaged `WeeklyUpdateEmail` React Email template (`xidig/src/emails/`) onto the existing `lib/email` Resend rail; per-edition send registry (idempotent, resumable); unsubscribe link; notification prefs respected.
- **Non-goals:** per-member content personalization; open/click tracking beyond provider defaults; Meilisearch anything.
- **Accept:** weekly; only consented members; content matches the pinned post; re-running an edition sends zero duplicates; unsubscribe honored immediately; private content never included.
- **Deps:** item 1 (consent); `EMAIL_*` env = Alpha Hardening (build now, sends go live after config); `digest_editions` registry.
- **Risk/privacy:** fail-closed on absent consent; the old-site Resend audience is **never** auto-enrolled — migrate to the "updates only" lane with notice (front-door-plan §7).

**7. Launch density plan**
- **Why:** Day-one emptiness kills the "room is occupied" feel; the Phase-8 seeder exists — the plan is what/how much to seed and how it retires.
- **Scope:** curated seed manifest (tags/listings/Lab templates/Plaza posts) sized for launch; every seeded item badge-labeled (`ContentSourceBadge`); **organic-proof invariant:** seeded/AI content (`source≠'member'`, `users.is_ai`) is excluded from every front-door count and proof surface, with tests; retirement plan — seeded posts age out as organic content arrives.
- **Non-goals:** fake members, seeded reactions/engagement, seeded content presented as front-door proof, unlabeled seeds anywhere.
- **Accept:** seed re-run → no duplicates (`/admin/seed`); every seeded item visibly labeled; front-door counters verifiably exclude seeded/AI (test, not assertion); seeded content earns no reputation (Phase 8 rule holds).
- **Deps:** Phase-8 seeder; Phase-B counter work enforces the invariant on the front door.
- **Risk:** this invariant *is* the honesty brand — a single laundered number undoes the positioning.

**8. Events + RSVP — DESIGN LOCKED (Warya approved 10 Jul; build-ready)**
- **Why:** The single most WhatsApp-group-displacing feature; public event pages are acquisition surfaces (community-member funnel starts here). Last before-alpha item so the homepage events block can turn on honestly.
- **Architecture (locked):** standalone spine, embedded surfaces. `events` table with own shareable page (`/events/[slug]`); **required accountable host (a member)** + **optional container link** (Lab/Club, business listing, or candidate). Discovery is merged, not siloed: host-profile section, Lab/Club page section, listing page section, digest slot, and a Plaza auto-post on publish (awards-auto-post pattern — no new feed machinery).
- **Creation rights (locked, alpha-conservative):** Lab/Club organizers (their space), verified businesses (their listing), mods/admins (community/official). Plain members later if volume is healthy. Role-based, **never Supporter-paywalled**. Member-created events pass the Phase 2 moderation pre-scan/HITL queue; `source` column carried (organic-proof invariant: seeded events never surface on the front door).
- **RSVP (locked):** `going`/`interested` only (absence = no). Optional soft capacity ("full" label; interested keeps working). Attendee **list host-only; per-RSVP opt-in "show me as attending"**; public sees aggregate count only above N≥5 floor. Venue granularity is a host toggle: address to everyone vs confirmed attendees only. T-24h reminder via existing notification/cron rails (email joins with item 6/14). ICS route + Google Calendar link (no deps); WhatsApp share via existing share actions.
- **Visibility/casual access (locked):** per-event `public`/`members`/`space_only` — host's choice; celebration-vs-serious is a **category filter** (community/meetup · talk/AMA · demo-day · workshop · business), never an access rule. Signed-out `/events` = public events via service-role narrow projection. Admin `featured` flag (pinned-posts pattern) feeds the homepage events block: ≥1 upcoming public event → one "next up" card; zero → block hidden (no empty rooms). Signed-out CTA: **"Request access to RSVP" → `/waitlist?from=event-<slug>`** (rides existing attribution; no separate reminder-capture system — the waitlist `updates_only` lane is that lane).
- **Non-goals:** ticketing/payments, recurrence, event chat, attendance-based reputation, check-in/QR, livestreaming.
- **Accept:** organizer/verified-biz/admin creates; member RSVPs both states; public page shareable + renders signed-out; count suppressed below N=5; attendee list host-only unless member opted in; address toggle honored; ICS downloads; Plaza auto-post on publish; homepage block behind the ≥1-upcoming floor; Lite works; EN/SO complete (`events.*` at launch floor).
- **Deps:** new migration (events, event_rsvps, RLS, moderation columns); MediaSlot; in-app notification types (email later via item 14).
- **Risk/privacy:** physical addresses + attendance are safety/sensitivity surfaces — the locked defaults above (host-only lists, opt-in display, count floor, address toggle) are load-bearing, not polish.

### During alpha

**9. Lab tasks/kanban** *(simple execution surface — explicitly NOT a payment ledger or proof-of-work automation)*
- **Why:** Turns Labs from chat rooms into execution surfaces; "task done" is the builder funnel's proof rung; public help-wanted converts visitors.
- **Scope:** `lab_tasks` (Backlog/Doing/Review/Done); create/assign/move; completion writes Space History; public Labs may show help-wanted + recently-done (visibility-gated, RLS); simple list+board UI, Lite-friendly.
- **Non-goals:** payment/attestation/work-ledger, time tracking, dependencies/Gantt, cross-Lab boards, task-based reputation automation.
- **Accept:** member creates/assigns/moves; completion → Space History entry; public help-wanted respects lab visibility; RLS default-deny covered in migration tests.
- **Deps:** migration; Phase-4 Labs RLS patterns; Space History.
- **Risk/fairness:** task completion must **not** auto-earn reputation in v1.0 (gaming risk — reputation events stay curated); private-lab task data must never leak via the public surface.

**10. Per-type profile/Space templates**
- **Why:** Blank-box paralysis kills contribution; templates encode community norms (Intro/Ask/Win) cheaply.
- **Scope:** template definitions per composer type — Intro/Ask/Win/charter/update/decision/Candidate pitch/listing description; picker + prefill, fully editable before publish; EN/SO template copy (config-driven, no migration expected).
- **Non-goals:** AI generation, rich block editor, user-authored templates.
- **Accept:** selectable; prefills; editable; publishes as a normal post; i18n complete.
- **Deps:** composer UI + i18n only.
- **Risk:** none material; template SO copy joins the native-review list.

**11. Lab focus split**
- **Why:** Browsing/matching legibility as Lab count grows; feeds focus filters + focus-adapted templates.
- **Scope:** optional `focus` (tech/creative/business/community/research/import-export) as a **slug-PK lookup table** (house rule, not enum); filters on in-app + public Labs indexes; adapted templates per focus.
- **Non-goals:** focus-based ranking; mandatory backfill; sub-taxonomies.
- **Accept:** settable at create/edit; filter works; null-focus Labs render fine everywhere.
- **Deps:** additive migration; item 10 for adapted templates.
- **Risk:** taxonomy churn — lookup table keeps it extensible without migration pain.

**12. Community Awards tally → Plaza auto-post** *(Phase-7 deferred item)*
- **Why:** Recurring community ritual + shareable moment; the award-cycle admin route already exists (`apps/web/src/app/api/admin/award-cycles/route.ts`) — this closes the loop.
- **Scope:** cycle close → tally → auto Plaza result post → winner badge grant → notification → share card; optional digest slot.
- **Non-goals:** money prizes, sponsor placements, mid-cycle vote leaderboards.
- **Accept:** cycle close produces result post + badge + notification **exactly once** (idempotent, like the digest); duplicate votes impossible; ties resolved deterministically; tally method stated on the result post.
- **Deps:** Phase-7 awards schema + Phase-8 admin route.
- **Risk/fairness:** small electorates read clique-y — add a minimum-votes floor before a cycle publishes (threshold = Warya decision).

**13. Related-skill 0.5 matcher** *(Phase-7 deferred item)*
- **Why:** Matching-quality jump for the builder funnel; the 0.5 weight is already part of the locked design, blocked only on a curated related-skill map (`looking-for.ts` header note).
- **Scope:** human-authored, versioned related-skill map (data file); 0.5 weight in `lib/matching/looking-for.ts`; reason strings show the relation ("related skill: React → frontend"). During alpha so real member skill data informs the map.
- **Non-goals:** embeddings/AI similarity, behavioral signals, learned weights.
- **Accept:** related-skill hits scored at 0.5 with visible reasons; deterministic; map human-reviewed and inspectable in-repo.
- **Deps:** real alpha skills data.
- **Risk/fairness:** map bias — keep it public/inspectable; keep EN/SO skill vocabulary consistent so Somali-language profiles match equally.

**14. Notification email templating**
- **Why:** Alpha members not in-app daily still need DM/mention/RSVP signals; `lib/email/templates.ts` already ships 7 transactional templates — extend, don't invent.
- **Scope:** email templates for notification types currently in-app-only (mentions, DM requests beyond the existing one, RSVP updates, award results, Lab invites); per-type notification prefs respected; per-category unsubscribe; plain-text-first.
- **Non-goals:** marketing email, heavy HTML design systems, send-time optimization, digests (item 6 owns that).
- **Accept:** each type honors prefs; one email per event (idempotent); EN/SO; unsubscribe per category works.
- **Deps:** `EMAIL_*` env = Alpha Hardening; item 1 for anything non-transactional.
- **Risk/legal:** keep the transactional (member-chosen prefs) vs marketing (consent-gated) boundary explicit — legal input on classification wording.

### Before public beta

**15. Front Door Phase B proof rails** *(per front-door-plan §4/§8)*
- **Why:** Phase A sells the promise; Phase B proves it with real data — the "come see it's real" spine, still never dashboard-first.
- **Scope:** cached `lib/stats` module + data-floor ladder on the landing; public `/labs` + `/capital` list branches + decided-items governance log; Plaza highlights projection + spotlight-consent toggle in `/settings/privacy` (≤15-min takedown SLA); real UI panels from consented content; `/business` thin-but-real page; **organic-proof invariant retrofitted across all public projections/counters** (incl. `venture_candidates` via `is_ai`/`seed_entities` or a new `source` column); `front_door_counters`.
- **Non-goals:** counters below the data floor; public vote tallies (default members-only); bounce/session tracking.
- **Accept:** data-floor thresholds evaluated against real numbers; every live surface demonstrably degrades down the ladder (stale cache → named rail → designed terminal content); spotlight toggle honored within the cache window.
- **Deps:** spotlight-consent default decision (Warya); small read-layer migration; item 7's invariant tests.
- **Risk/privacy:** public-in-app ≠ marketing consent — the toggle scopes to **all** public/marketing surfaces.

**16. "State of Somali Business" launch stat**
- **Why:** Directory-intelligence authority asset; first live-data piece of the reports pillar; PR/SEO magnet for the business funnel.
- **Scope:** aggregate directory stats (categories × cities, claimed/verified counts, export-readiness) with **N≥5 suppression**; published as a report page + optional front-door module behind the data floor; "community-compiled + cited" sourcing.
- **Non-goals:** individual business exposure; trend claims the data can't support; paid data products.
- **Accept:** no published cell under N=5; every figure traceable to a query; seeded listings excluded from headline counts (or explicitly labeled); EN/SO.
- **Deps:** enough organic claimed listings to clear the floor; Phase-C directory-intelligence groundwork.
- **Risk/privacy:** re-identification in small cities — test suppression; honesty about the seeded share of the directory.

### Post-v1.0 / deferred

**17. Page-block editor** — schema shipped Phase 4.5; renderer is v1.0.x, **editor is v1.1** (standing decision). Pull-forward trigger only: alpha shows per-type templates + fixed layouts failing real member demand. Non-goals now: any build. No other action.

**Locked deferrals (unchanged):** algorithmic ranking · analytics personalization · AI recommendations · TikTok-style short video · business reviews/ratings · native video · auto-translate UGC · Meilisearch · WhatsApp OTP/bots · billing beyond schema stubs · outbound webhooks · Live-Lab/Capital writes via API.

### Decision-only before build (category 5)

**18. Co-op / work-ledger / governance-engine ideas** — explicitly **not v1.0** unless Warya approves in writing. Any proof-of-work automation, payment ledger, contribution attestation, or co-op governance entity is a future-backlog *decision*, not a build item. Tasks/kanban (item 9) is the deliberately modest v1.0 stand-in and must not scope-creep toward these.

### Polish items folded into the above
Bookmarks/saves, mutes, share sheet, drafts/edit-history, mention autocomplete, profile identity upgrades (open-to, pinned content, OG cards): mostly Phase-4.5-built — audit for coverage/consistency during alpha against Warya's 9 Jul acceptance notes. Mentor-in-residence surface (featured card + Ask-this-mentor CTA + digest slot) ships during alpha **only with real mentors** — never a placeholder.

## 6. Recommended next build order

1. **Consent-capture UI** — land + review the in-flight parallel-session build (Part A).
2. **Tourniquet decision + execution** — bounded legal-exposure window; half a day or a committed cutover date.
3. **Global search polish** — small, high-leverage, no migration.
4. **Interest-based follow suggestions** — small, reuses matcher, no migration.
5. **Business trust fields** — gap-fill audit + one small migration.
6. **Digest email channel** — build now; sends stay dark until consent + `EMAIL_*` config.
7. **Launch density plan** — seed manifest + organic-proof invariant tests.
8. **Events + RSVP** — biggest before-alpha build, last so the front door can advertise it truthfully.
9. — *alpha cohort invited (Alpha Hardening blockers cleared in parallel)* —
10. **Lab tasks/kanban.**
11. **Per-type templates + Lab focus split** (paired — focus feeds templates).
12. **Awards tally → Plaza auto-post.**
13. **Notification email templating.**
14. **Related-skill map + 0.5 weight** (informed by real alpha skills data).
15. **Front Door Phase B proof rails** (after real numbers exist to evaluate the data floor).
16. **"State of Somali Business" stat** → then Phase C (constellation graph, gabay pass, weight counter).

## 7. Alpha Hardening vs product build split

| Workstream | Alpha Hardening (provisioning/review — `docs/alpha-hardening.md`) | Product build (this plan) |
|---|---|---|
| Database | Push the 16 existing migrations; regen types against live | New migrations: events, tasks, focus lookup, services field, Phase-B read layer |
| Email | `EMAIL_API_KEY`/`EMAIL_FROM`/webhook secret (Resend + Svix) | Digest send loop (6); notification templates (14) |
| Analytics | `POSTHOG_*` keys; post-deploy event smoke | Consent-capture UI (1, in build); never fake the three dead events |
| Cron | Vercel cron registration; external hourly plaza job; `CRON_SECRET` | Award-cycle close job (12); digest email step (6) |
| Search | — (no Meili; leave `MEILISEARCH_*` unset) | Multi-entity tabs + empty states (3) |
| Front door | Domain cutover steps; live smoke of waitlist/gate; legal sign-off | Phase B proof rails (15); launch stat (16) |
| Seeding | Live seed run + label verification (phase-8-smoke) | Seed manifest + invariant tests (7) |
| Legal/compliance | Biometric DPIA sign-off; privacy/ToS publication; export/deletion e2e | Transactional-vs-marketing email classification (14) |
| Somali copy | Native review of existing draft namespaces | New namespaces: events, tasks, awards-result, templates, focus |

## 8. Requires Warya / legal / native-review input

**Warya (decisions) — RESOLVED 10 Jul ("go with your suggestion, do all"):**
1. Tourniquet form: **patch the old-site source** (prepared in the `xidig/` dump + deploy instructions; Warya pushes since the dump has no git remote here).
2. Spotlight-consent default: **opt-in** (the stronger trust story; gates Phase B highlights).
3. Awards: **≥5 total votes cast for a category to award; plurality wins; tie = shared award** (default pending veto).
4. Events: full locked design in item 8 — conservative creators at alpha; attendee list host-only + opt-in public display; address visibility host toggle (default: attendees-only for physical venues).
5. Standing front-door items confirmed as implemented: "Request Access" CTA, "around $1/month", community-compiled reports byline, `/careers` folded into `/about`.

**Legal:**
1. `/privacy` + `/terms` sign-off — **gates domain cutover**.
2. Biometric DPIA — launch gate for verification recording (`docs/dpia-verification.md`).
3. Fund/Maalgeli section of `/about` + Capital sections of `/terms`.
4. Transactional vs marketing email classification for items 6/14.

**Native Somali review:**
1. Existing draft namespaces (alpha-hardening list) + `marketing.*`.
2. New copy from this plan: events, tasks, awards results, templates, focus labels, digest/notification email bodies.
3. Gabay editorial voice — Phase C only, hard-gated on the reviewer.
