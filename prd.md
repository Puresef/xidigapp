# PRD — Xidig App v1.0 (Standalone)

<aside>
📌

This PRD is the single source of truth for building **Xidig v1.0** as a first‑party standalone app. It is written to be “promptable”: each section can be copied into Cursor/Claude builders as build instructions.

</aside>

## 1) Product summary

- **One-liner:** Xidig is a member-owned platform where Somali builders connect, form Labs, build ventures, and fund them—end‑to‑end.
- **Elevator pitch:** Xidig combines a high-signal social layer (Plaza), structured execution (Labs), and a visible venture pipeline (Capital).
- **Audience:** builders, founders, operators, supporters/investors, and any Somali business/person advertising themselves via profile + directory/map.

## 2) Goals (v1.0)

- Trusted identity layer (profiles + verification + roles)
- Discovery via directory + map (people + businesses)
- High-signal Plaza (posts, asks, wins, updates)
- Structured Labs (charters, members, updates, artifacts, decisions)
- Venture pipeline (Lab → Venture Candidate → Capital readiness)
- Moderation + governance primitives
- Controlled beta + waitlist/onboarding
- Social graph (follows) + DMs and full connectivity options
- AI + API/MCP layer for seeding, automation, and integrations
- Bilingual UI (Somali + English) + low-bandwidth mode

## 3) Non-goals (v1.0)

- Tokenization / on-chain ownership
- Automated investment payment rails (v1.0 can be intent capture + manual ops)
- Lab file uploads (v1.0 is link sharing only)
- Courses/mentorship platform
- Gig/marketplace mechanics

## 4) Success metrics (first 60–90 days)

- Activation: % of new users who complete profile + choose lanes
- Retention: WAU, WAU/MAU
- Contribution: # weekly Wins posts; # weekly Asks posts
- Discovery: # profiles with location + skills; # business listings
- Map quality: % listings with valid address + latitude/longitude
- Map usage: map views → listing views; listing views → contact clicks
- Labs: # Labs created; % Labs with weekly updates; time to first artifact
- Pipeline: # Candidates created; # reviewed; time to first review
- Safety: report rate; resolution time; % listings flagged/removed

## 5) Product principles

- Helpful everywhere (tips, onboarding, empty states that teach)
- Execution beats vibes
- Trust is a feature
- Pipeline clarity
- App-first (no external-host framing)

## 6) Core entities

- User
- Profile
- Verification (user)
- Post
- Comment
- Tag
- Lab
- Lab Update
- Lab Artifact
- Decision
- Venture Candidate
- Interest ("I can help" / "Garab")
- Business Listing
- Follow
- Conversation + Message (DMs)
- Badge + Reputation Score
- Vouch
- Notification
- Report + Mod Action + Audit Log
- Invite

## 7) Key user journeys

1. Join → complete profile → choose lanes → first post (Intro/Ask/Win)
2. Discover people: directory search + filters (skills, location, lanes, verification)
3. Discover businesses: map + listing filters (category, city, tags) → contact click
4. Create Lab: charter → members → weekly updates → artifacts → decisions
5. Graduate: convert Lab → Candidate → rubric + ask → reviews → status
6. Safety: report content/listing → mod action → visible outcome

## 8) Information architecture

- Home (personal dashboard)
- Plaza
- Labs
- Capital
- Directory
- Map
- Messages (DMs)
- Notifications
- Profile

## 9) Feature requirements

- Auth: sign in via email + password, email magic link, **or** phone SMS-OTP — three co-equal methods, one canonical account (at least one verified email or phone) + terms + invite-only toggle
- Profiles: required (name, location, skills, lanes) + optional links/bio + verification badge
- Directory: people + businesses search + filters
- Map: business listing map + filters
- Plaza: post types (Intro/Ask/Win/Update) + comments + tags + reporting
- Labs: charter + weekly updates + artifacts + decision log + membership
- Capital: Candidate pages + rubric fields + reviews + interest capture
- Notifications: replies, mentions, lab updates, candidate status changes
- Admin/mod: verification, reports queue, remove/suspend, listing moderation
- Social graph: follow people, Labs, Ventures, tags
- Messaging: 1:1 DMs with request-to-chat, block/report
- Badges + reputation scores (see section 14)
- AI seeding + API/MCP layer (see section 21)
- Low-bandwidth mode + Somali/English toggle (see section 22)

## 10) Builder-friendly data fields

- Profile: displayName, handle, bio, locationCity, locationCountry, skills[], lanes[], verificationStatus, links[]
- BusinessListing: businessName, ownerUserId, category, shortDescription, address, latitude, longitude, city, country, tags[], contactLinks[], verificationStatus
- Lab: name, shortDescription, problemStatement, hypothesis, sprintLengthWeeks, successDefinition, stage, tags[], leadUserId, members[]
- Candidate: name, labId, oneLiner, problem, solution, traction, team, ask, status, rubricTeamScore, rubricTractionScore, rubricFeasibilityScore, notes, visibility, regionGated
- Follow: followerUserId, targetType, targetId
- Conversation: participantIds[], status (pending/accepted/blocked)
- Message: conversationId, senderUserId, body, createdAt
- Badge: userId, type, tier, awardedAt
- Vouch: voucherUserId, voucheeUserId, createdAt
- Report: reporterUserId, targetType, targetId, reason, status, resolution
- AuditLog: actorUserId, action, targetType, targetId, metadata, createdAt

## 11) Prompt pack (copy/paste)

### How to use this prompt pack

- **Phase 0 runs first — always.** Output the entire DB schema before writing any UI. Changing a column in Phase 4 breaks Phase 1 code.
- Build **one phase per session**. Never combine phases in one prompt.
- Every session uses the same **fixed header** (copy verbatim every time) + the **phase-specific sections** listed below.
- End every session with the **fixed footer** (copy verbatim every time).
- Deploy and verify acceptance criteria before starting the next phase.
- **Never paste:** §11 (this section), §12 (decisions log), §25 (v1.1 roadmap), §24 infra notes (already set up). Pasting future-roadmap sections causes Claude to build features out of order.

---

### Fixed header — paste at the top of EVERY session

> You are building Xidig v1.0, a member-owned platform for Somali builders. This is Phase [X] of 9 (Phases 0–8). Build only what is listed for this phase — do not invent or add features from other phases. The PRD is the source of truth. Alongside this header, always paste: §1 Product summary + §5 Product principles + §26 Build inputs & constants.
> 

---

### Fixed footer — paste at the bottom of EVERY session

> Before finishing: (1) output the full Postgres schema as a migration file for all new tables in this phase. (2) Write all Supabase RLS policies per table in a separate rls.sql file. (3) Write RLS negative tests for every new table — prove user A cannot read user B's private or gated rows (free vs Supporter, region gating, per-Candidate visibility, roles). (4) Confirm each acceptance criterion below passes. Do not move on until all pass.
> 

> Then paste the phase-specific acceptance criteria listed under this phase.
> 

---

### Phase 0 — Schema (run this FIRST, before any UI)

**Purpose:** get the entire database schema reviewed and approved before Phase 1 builds anything. Changing a table schema after UI is built causes cascading rewrites.

**Paste these sections (after fixed header):**

§6 Core entities (full list)

§10 Builder-friendly data fields (full list, plus add: `membership_tiers`  on Profile; `subscriptionStatus` TEXT on Profile; `labVisibility` ENUM (private/members/public) on Lab; `sprintDeadline` TIMESTAMPTZ on Lab; `regionVerified` BOOLEAN on Profile; `spaceMode` ENUM (club/lab) on Lab — unified Spaces model, see §16; `email` TEXT + `phone` TEXT on User (both nullable, at least one required — supports email+password, magic-link, or phone-OTP sign-in; password hashes live in Supabase-managed `auth.users`, not app tables))

§17 Capital spec (region gating definition only)

**Instruction to Claude:**

> Output a single complete Postgres migration file (`schema.sql`) covering ALL tables for the entire v1.0 build (all 7 phases). Include all columns, types, foreign keys, indexes, and enums. Do not generate any UI, API routes, or RLS yet. After outputting the schema, list any ambiguities or missing fields you found.
> 

**Acceptance criteria (Phase 0):**

- All entities from §6 have a corresponding table
- membership tier (`membership_tier_id` → `membership_tiers` lookup, per Seq 3) and `subscriptionStatus` are on the `profiles` table (drives all RLS gating)
- `regionVerified` is on `profiles` (drives Capital gating)
- `labVisibility` enum exists on `labs` table
- No circular foreign key dependencies
- Review output manually before proceeding to Phase 1 — this is the only phase where you edit the output before continuing

---

### Phase 1 — Auth + Profiles + Follows + Directory + Map

**Paste these sections (after fixed header):**

§6 Core entities (User, Profile, Verification, Business Listing, Follow, Badge, Vouch, Invite only)

§10 Data fields (Profile, BusinessListing, Follow, Badge, Vouch rows only)

§13 Social graph (Follow + mentions + linkable + contact options)

§14 Verification, badges & reputation (full)

§18 Directory & Map spec (full)

§19 Account policy (rate limits + account lifecycle only)

§20 Onboarding (Founding Member moment + Looking for matching)

§22 Platform requirements (API-first architecture note + bilingual i18n scaffold + low-bandwidth mode)

§27 Plain language errors (Auth & access + Profile & verification + Directory & Map blocks only)

**Do not paste:** Plaza, Labs, Capital, DMs, mod queue, analytics events (later phases)

**Acceptance criteria (Phase 1):**

- User can sign up via invite code or waitlist; email + password, email magic link, **or** phone SMS-OTP all work
- Profile fields (name, handle, location, skills, lanes) save and display correctly
- Follow/unfollow works; Following feed tab appears on Home
- Business listing created via map pin-drop; appears on map and in directory
- Duplicate listing detection fires; Claim this listing flow works
- Directory fuzzy search returns results for transliteration variants (e.g. Maxamed / Mohamed)
- Founding Member counter shown on waitlist page; badge awarded to first 500
- Low-bandwidth mode toggle works; disables images and map tiles
- API-first: all data operations go through defined API routes (no direct DB calls from UI)
- RLS: free member cannot access Supporter-gated routes; admin can access everything

---

### Phase 2 — Plaza

**Paste these sections (after fixed header):**

§6 Core entities (Post, Comment, Tag only)

§10 Data fields (Post, Comment, Tag rows only)

§15 Plaza spec (full)

§20 Onboarding (reaction taxonomy + tips/empty states)

§27 Plain language errors (Plaza block only)

**Do not paste:** Labs, Capital, DMs, mod queue, badges beyond reactions, analytics

**Acceptance criteria (Phase 2):**

- All post types (Intro / Ask / Win / Update / Poll) create and display correctly
- Ask lifecycle: Open → Answered (with helper credit) → Closed; stale Ask nudge fires at 7 days
- Image upload 1–5MB compresses to WebP; EXIF stripped
- Pasted YouTube / TikTok / Vimeo / X / Instagram URL plays in-app
- Unwhitelisted link shows warning interstitial
- Reaction taxonomy (🔥💪🤲💡👀) works; no generic like button
- Rate limit fires correctly for free members (5 posts/day); error message matches §27
- Feed displays chronological + post-type filters + pinned highlights slot

---

### Phase 3 — DMs + Notifications

**Paste these sections (after fixed header):**

§6 Core entities (Conversation, Message, Notification only)

§10 Data fields (Conversation, Message rows only)

§13 Social graph (DMs section + mentions section)

§22 Platform requirements (smart notification bundling + push notifications)

§26 Notification matrix (in-app / email / push breakdown)

§27 Plain language errors (DMs block only)

**Realtime note (paste this too):**

> Use **Supabase Realtime** (Postgres changes → subscriptions) for DM message delivery. Do not use polling. Subscribe to the `messages` table filtered by `conversationId`. Presence is not required in v1.0.
> 

**Do not paste:** Labs, Capital, Plaza (already built), mod queue, analytics

**Acceptance criteria (Phase 3):**

- DM request sent → recipient notified → accept/decline works
- 1:1 chat sends and receives messages in real time
- Block and report work inside DMs
- Mention (@handle) in a post or DM notifies the mentioned user
- Notifications are bundled (grouped by type, not individual pings)
- Push notification delivered on Android PWA for new DM
- Email notification sent for DM requests and candidate status changes

---

### Phase 4 — Labs

**Paste these sections (after fixed header):**

§6 Core entities (Lab, Lab Update, Lab Artifact, Decision only)

§10 Data fields (Lab row only)

§16 Labs spec (full)

§20 Onboarding (Lab sprints countdown + pinned Labs on profiles + skill tree)

§27 Plain language errors (Labs block only)

**Do not paste:** Capital, analytics, mod queue

**Acceptance criteria (Phase 4):**

- Lab created with completed charter template (playbook starters available)
- Join modes work: open join / request to join / invite-only
- Weekly update published; link artifact shared
- Lab marked Dormant after 28 days no activity; revival works instantly
- Lab visibility toggle (Private / Members only / Public) works; Public Labs are readable without login
- Public Lab page is server-side rendered for SEO
- Inter-Lab collaboration link created; shared update cross-posts to both Labs
- Skills gap alert fires after 7 days with no match
- IP/ownership reminder banner shows in Lab UI
- Lab sprint countdown visible on Lab card

---

### Phase 5 — Capital

**Paste these sections (after fixed header):**

§6 Core entities (Venture Candidate, Interest only)

§10 Data fields (Candidate row only)

§17 Capital spec (full)

§27 Plain language errors (Capital block only)

**Do not paste:** analytics, mod queue

**Acceptance criteria (Phase 5):**

- Candidate workflow: Draft → Submitted → In Review → Approved / Parked / Declined
- Reviewer recusal: Lab members blocked from reviewing own Candidate
- Per-Candidate visibility setting (all members / reviewers only) enforced by RLS
- Somalia-region users see investment language + the Maalgeli (Invest) CTA
- Non-Somalia users see informational view only; no investment language or Maalgeli action anywhere in their session (Garab remains available to everyone)
- Fund-first funnel: the Maalgeli (Invest) CTA opens the Xidig Venture Fund modal first
- Venture timeline renders on Candidate page (when Lab has made it public)
- Supporter governance vote appears alongside rubric scores

---

### Phase 6 — Admin / Mod

**Paste these sections (after fixed header):**

§6 Core entities (Report, Mod Action, Audit Log only)

§10 Data fields (Report, AuditLog rows only)

§14 Verification process (video call flow + verifier role)

§19 Moderation, safety & account policy (full)

§27 Plain language errors (Moderation block only)

**Do not paste:** analytics, i18n, badges

**Acceptance criteria (Phase 6):**

- Report submitted → appears in mod queue with SLA timer
- Mod removes content → content hidden → user notified with plain language message
- Appeal submitted → routed to second mod/admin
- Every mod/admin action writes an immutable audit log entry
- Verification queue: admin schedules call, member notified, badge awarded on completion
- Suspended user's posts hidden; account shows suspension message
- Rate limits enforced at edge (Upstash) for new accounts
- Account delete: 30-day grace, data export available, content anonymised not deleted

---

### Phase 7 — Badges, Onboarding, i18n, Low-bandwidth, Analytics

**Paste these sections (after fixed header):**

§14 Reputation scores + milestone badges (full)

§20 Onboarding (full, everything not yet built)

§22 Platform requirements (bilingual + low-bandwidth full spec)

§23 Analytics spec (full event taxonomy)

§27 Plain language errors (Platform / technical block only)

**Do not paste:** anything already built in phases 1–6

**Acceptance criteria (Phase 7):**

- Contribution score and Helper score increment correctly
- Milestone badges (Founding Member, Lab Lead, Top Helper, Early Backer) award at correct triggers
- Anti-gaming rules: no self-interaction points, daily caps, time decay
- Community Awards (quarterly) feature exists and accepts member votes
- First-session onboarding checklist completes and dismisses
- Looking for matching surfaces relevant Labs on profile completion
- Mentor-in-residence badge and featured slot in digest works
- English / Somali language toggle switches UI strings (i18n keys present even if Somali strings are placeholder)
- Low-bandwidth auto-prompt appears when 3G/2G detected
- All PostHog events from §23 fire and appear in PostHog dashboard

---

### Phase 8 — AI seeding + API/MCP layer (pre-launch)

**Paste these sections (after fixed header):**

§21 AI & API layer (full)

**Instruction to Claude:**

> Build the AI seeding scripts and the REST API + MCP server. Seeding scripts must be idempotent (safe to re-run). All seeded content must carry a labeled `source: "seed"` flag so it is distinguishable from real member content. API keys must be scoped, rate-limited, and logged in the audit table.
> 

**Acceptance criteria (Phase 8):**

- Seeding script runs and populates Plaza posts, tags, listings, and Lab templates without duplicates on re-run
- All seeded content is flagged `source: seed` and visually labeled in the admin view
- REST API returns correct data for all major entities with auth scoping
- MCP server lists tools and executes read/write calls with valid API key
- Invalid or expired API keys return the plain language 403 error from §27
- Weekly digest job runs and produces correct output (email + pinned post)

---

### Prompt A — Master build instruction (use at start of Phase 1 only)

Build Xidig v1.0 exactly as described in this PRD. Include auth + RBAC (member / mod / admin). Use Next.js + Supabase + Vercel. Build API-first: all data operations through defined API routes. Write RLS policies as a separate migration file. Do not build beyond Phase 1 in this session.

## 12) Decisions log & open items

**Decided**

- DMs are in scope (old "no real-time chat" non-goal removed)
- Verification: live admin video call (face + ID), recorded with consent — see section 14
- Capital: investment language gated to Somalia region; informational view elsewhere — see section 17
- Cold start: AI-generated/seeded content + AI participation; app exposes API/MCP — see section 21
- Labs: link sharing only (no file uploads in v1.0); Dormant badge after 4 weeks of no updates
- Lab/venture IP & ownership: decided later by **member vote** — app shows recurring reminders during early usage
- Media: embed-first; image/meme uploads 5MB; video via embeds (see sections 15 and 24)
- Labs creation: **Supporter members** can create (per membership model), with a completed charter template (quality gate without approval bottleneck)
- Candidate reviews: role-based reviewers (with recusal) + open member comments below
- Signup gating: **invite-only + waitlist** for beta
- Video: **Option A — embeds only (free)** for v1.0; B/C are upgrade paths (see section 24)
- Plaza feed: default stands — chronological + filters + pinned weekly highlights (revisit post-launch with usage data)
- v1.1: Cloudflare Stream uploads + group video rooms / live sessions, gated to a **paid membership tier** to offset costs — see section 25
- Seed tags + listing categories: **approved** (see section 26)
- Membership lanes follow [xidig.net/membership](http://xidig.net/membership); **"Supporter+" is renamed "Supporter"** everywhere
- Capital: investment can flow to individual ventures, but UX **funnels all users to the Xidig Venture Fund** first — see section 17

**Open (need a decision)**

- None right now — all build-blocking decisions are locked. New open items get logged here and as decision rows in the Build Tracker.

**Decided (2 Jul)**

- **Capital launch gating** (Tracker Seq 6): geo-IP + profile country match **+ self-attestation checkbox** — all three required for investment language/Maalgeli at launch; enhanced attestation mechanism stays deferred (Seq 7) for pre-Capital-launch review
- **EN label for the backing button** (Tracker Seq 51): **Co-sign** (SO: Garab) — social proof shown as "142 garab / 142 co-signs"

**Decided (formerly schema-blocking — all locked in the Build Tracker)**

- ENUM vs lookup tables · unified Spaces model (one entity + `spaceMode`) · reputation score formulas (30pt/day caps, 90-day decay) + AI-account Helper-score rule · Supporter governance vote (advisory + soft gate; quorum 5 or 20%; 60% approval; 7-day window) · Poll mechanics · "Looking for" matching · profile location (no chapters; proximity-based) · Streaks (cosmetic-only v1.0) · Somali translation scope (full; trust surfaces = launch floor) · design tokens · empty/loading/error StateView pattern · Capital nav placement (entry inside Labs; no bottom tab)
- **Capital v1 scope:** listing/intro service + intent capture + manual ops — **no financial flows through the platform** (no pledge ledger, no payout states); revenue-share mechanics documented for v2+ reference only
- **Payments:** Paddle or Lemon Squeezy as merchant of record for diaspora card billing + EVC Plus/Zaad Somalia-side; no direct Stripe (Somalia unsupported)
- **Auth method:** **three co-equal sign-in methods — email + password, email magic link, or phone SMS-OTP** (any one sufficient), with one canonical account per person (at least one verified email or phone); additional methods link to the same account. Passwords are stored only in Supabase-managed `auth.users` (bcrypt), so no app-schema change is needed. WhatsApp OTP deferred to v1.1 behind a provider abstraction.
- **Suuq scope:** Suuq = Directory + Map (people + business listings), not a marketplace/commerce surface (commerce is a non-goal, §3).

**Reminders (recurring until done)**

- ✍️ Content policy document — to be written separately by Xidig; app links to it
- 🗳️ IP/ownership member vote — surfaced in Lab UI + onboarding until resolved
- ⚖️ ToS + Privacy Policy + cookie/analytics consent — human-authored + legal review, required **before Phase 1 data collection**
- 🪪 Biometric DPIA (verification video: face + ID, 24-month retention) — required **before the verification flow is built** (Phase 1 · Seq 31, not just Phase 6)

## 13) Social graph & connectivity

- **Follow** (one-way) people, Labs, Ventures, and tags; "Following" feed tab on Home
- **DMs:** 1:1 text messages; request-to-chat on first contact (recipient accepts/declines); block + report inside DMs; no group DMs as its the same as creating a space
- **Mentions:** @handle for users, #tag for topics; mentioning notifies
- **Everything is linkable:** every entity (post, comment, profile, Lab, Venture, Candidate, listing) has a permalink; pasting an internal link in any post, comment, or DM renders a rich preview chip
- **Contact options on profiles:** members choose what to show (DM, email, WhatsApp, socials)

## 14) Verification, badges & reputation

**Identity verification (Somalia-compatible — standard KYC providers don't cover Somalia reliably)**

- Live video call with a trained admin/verifier; member shows face + ID document
- Liveness prompts during the call (turn head, read a one-time code) to defeat photos/deepfakes
- Call recorded **with explicit consent**; encrypted storage, 24-month retention, access-logged
- Scale path: train trusted mods as verifiers to spread verified badges widely; 7-day queue SLA; admin spot-checks of verifier decisions

**Verification tiers & badges (distinct, never one conflated badge)**

- ✅ Identity Verified (video call)
- 🤝 Community Verified (3 verified members vouch — lighter tier, upgradeable to full verification)
- 🏪 Verified Business (premises video, documents, or admin call)
- Skill endorsements (peers endorse specific skills, shown on profile)

**Reputation scores**

- Contribution score: posts, comments, Lab updates
- Helper score: credited resolved Asks
- Streaks + milestone badges: Founding Member, Lab Lead, Top Helper, Early Backer
- Anti-gaming: time decay, no points from self-interactions, daily caps

## 15) Plaza spec

- Post types: Intro / Ask / Win / Update / Poll
- **Ask lifecycle:** Open → Answered (asker credits an answer; helper earns Helper score) → Closed; stale Asks auto-nudge after 7 days
- **Feed (default):** chronological + post-type filters + pinned weekly highlights — no engagement-bait algorithm
- **Images/memes:** direct upload, 1–5MB, auto-compressed to WebP, EXIF stripped, AI moderation pre-scan
- **Video:** embed-first — paste a YouTube/TikTok/Vimeo/X/Instagram link and it plays in-app; no native video uploads in v1.0 (see section 24 options)
- **Link embeds:** rich previews for whitelisted domains; warning interstitial for unknown domains

## 16) Labs spec (rooms model)

**Unified Spaces model (Club ⇄ Lab) — decided; supersedes the old "Labs only" framing (see Build Tracker Seq 2):**

- Labs and Clubs are **one entity with a mode flag** (`spaceMode`), not two systems. A Space is created as a **Club** (casual — same room mechanics, low commitment) or a **Lab** (serious — venture-track, charter-backed).
- **Promote-only ladder (no demotion):** Club → Lab → Venture Candidate. A Club promotes to a Lab by completing the Lab charter (the quality gate); promotion layers the charter over the existing Space and never deletes its history, members, or activity.
- **No auto-demotion, ever:** a stalled Lab is never downgraded — it receives dormancy *encouragement* prompts (see Dormant below). Direction is encouragement, not punishment.
- **Mode toggle + dynamic naming:** the top-nav label and Space chrome swap with the mode — **Lab (Warshad) ⇄ Club (Koox)** (SO label for Lab = **Warshad**; naming review resolved 27 Jun). Switching mode is a Space setting, not a rebuild.
- **Space settings UI (owner-editable):** mode/label, privacy (Private / Members only / Public), member view, and message history. *(Disappearing messages are deferred to v1.3/v1.4 — not v1.0.)*
- **Space History / activity log:** every Space keeps an auditable timeline — promotions, joins/exits, badge & reputation changes, charter completion, and dormancy events.
- Both modes share the same join modes, roles, updates, decision log, artifacts (links only), visibility toggle, playbooks, inter-Lab collaboration, and skills-gap alerts described below.
- Labs function like other spaces (rooms), purpose-built for **collaborating, sharing, and tracking progress**
- Join modes (lead picks per Lab): open join / request to join / invite-only
- Lab roles: Lead, Core, Member, Observer; contributor specialisations per the membership model: Operator, Researcher, Advisor
- Weekly updates, decision log, milestones; **artifacts are shared links only in v1.0** (no file uploads)
- **Dormant badge:** no update in 4 weeks → Lab marked Dormant + revival nudges to members; instantly revivable
- Labs (and Ventures) appear in the Directory with a summary card: one-liner, stage, member count, last update, "looking for"
- **IP/ownership banner:** until the member vote resolves ownership rules, Labs show a recurring reminder; leads see it again when publishing artifacts
- **Public build-in-public pages:** each Lab has a visibility toggle (Private / Members only / Public); Public Labs are SEO-indexed and readable without an account — free growth and acquisition loop
- **Lab playbooks:** pre-built charter templates per venture type (e-commerce, import/export, services, SaaS, agri-food); AI-generated starters that the lead edits; turns "structured execution" from a promise into a tool
- **Inter-Lab collaboration:** two Labs can formally link — shared updates cross-posted to both, co-membership visibility, ability to co-own a Candidate; turns isolated Labs into a network
- **Skills gap alerts:** if a Lab has been "looking for" a skill for 7+ days with no match, the app proactively notifies members whose profile matches that skill

## 17) Capital spec

- **Region gating:** the **Maalgeli** (Invest) action + investment language are available only to Somalia-region users (geo-IP + profile country + self-attestation checkbox — all three required at launch); everyone else sees an informational view with no offer/solicitation language. **Garab** (EN: Co-sign) is non-financial and available to **everyone, all regions** — it is never gated
- Standing disclaimer: nothing on the platform is an offer of securities; v1.0 is intent capture + manual ops
- Candidate workflow: Draft → Submitted → In Review → Approved / Parked / Declined (reasons visible)
- Reviewer recusal: Lab members cannot review their own Candidate
- Per-Candidate visibility setting: all members / reviewers only
- Rubric anchors: written 1–5 definitions for Team, Traction, Feasibility
- Interest types: "I can help" and **Garab** (EN: **Co-sign**) — both available to everyone, all regions; **Maalgeli** (Invest) is a separate, Somalia-region-gated action
- **Venture timeline / build log:** each Candidate has a public-facing timeline (with Lab's permission): Lab created → first update → Candidate submitted → reviewed → funded; proof-of-work that builds credibility with external press and future backers
- **Fund-first funnel:** direct investment into individual ventures is allowed (Investor Path), but every investment CTA routes users to the **Xidig Venture Fund** first — diversified, community-vetted, simpler ops
- **Supporter governance:** Supporter members vote on Venture Candidates (signal vote shown alongside reviewer rubric scores)
- **Investor Path** (per membership model): requires Supporter membership + enhanced verification (KYC/AML where feasible; video-call verification as the baseline)

## 18) Directory & Map spec

- **Manual pin-drop is the primary location input** (address text + landmark field optional) — geocoding APIs fail on Somali addressing
- Fuzzy search engine (Typesense/Meilisearch) tolerant of transliteration variants (Maxamed/Mohamed/Mohammed)
- Duplicate detection + "Claim this listing" flow for owners
- Categories + tags: admin-curated starter set, member-suggested additions
- Low-bandwidth fallback: list view replaces map tiles
- **Somali business intelligence layer:** surface aggregate insights from Directory data — "37 fintech builders in Mogadishu", "most active sector this month: import/export"; monthly intelligence report emailed to Supporters; a press-worthy data layer no one else produces for this market
- **Export readiness score:** for import/export business listings, an optional checklist score (documentation, certifications, capacity, contacts); unique data layer for the market
- **Location-based discovery:** members set where they live / are based on their profile (free-text city/region via locationCity/locationCountry — see §10, editable anytime); Directory, Map, and matching use **proximity / distance** (and optionally timezone), not a fixed grouping; there is no separate chapter or city-grouping taxonomy

## 19) Moderation, safety & account policy (standard app policy)

- **Content policy:** separate document (to be written — app links to it; reminder active)
- Impersonation prohibited; handle-squatting reclaimable by verified owners; notable figures protected
- Reports: queue with SLA, visible outcomes, one appeal routed to a second mod/admin
- **Immutable audit log** of every mod/admin action
- Anti-spam: new-account rate limits (posts/day, links, DM requests), listing caps, edge rate limiting
- Account lifecycle: deactivate / delete (30-day grace) / data export (UK GDPR); deleted users' content anonymised, not silently removed
- **Transparent governance log:** every platform-level decision (rule change, policy update, feature vote result) is published to a public Governance Log visible to all members; operationalises the "member-owned" claim — no other platform in this space does this

## 20) Onboarding & guidance

- First-session checklist: complete profile → pick lanes → follow 3 → first post
- **Set-a-password reminder:** if a member signed up via magic link or phone OTP (no password), the onboarding checklist + a Settings banner nudge them to set a password as a delivery-independent backup sign-in — dismissible, and it stops showing once a password is set
- Tips everywhere: contextual tooltips, teaching empty states, progress nudges — the app always suggests the next helpful step
- Invite system: codes + tracked referrals
- Early-usage recurring reminders for supporters: IP/ownership vote pending; content policy
- **Founding Member moment:** first 500 members get a permanent Founding Member badge; waitlist page shows a live counter of spots remaining; special onboarding screen on entry; Founding Member directory section; creates urgency, pride, and press hooks
- **"Looking for" matching:** on profile completion, the app surfaces Labs actively seeking someone with your skills; when posting an Ask, it suggests relevant people or Labs; active matching vs passive discovery
- **Mentor-in-residence:** rotating verified Advisor (from the community) who commits to answering 5 Asks/week in their domain; badged prominently, featured in the digest; recognition for experts, access for builders — costs nothing to operate
- **Reaction taxonomy:** instead of a generic like, culturally resonant reactions: 🔥 Fire · 💪 Strong · 🤲 Mashallah · 💡 Idea · 👀 Watching; small detail, huge community feel
- **Lab sprints with public countdowns:** visible sprint timer on Lab cards ("8 days left in Sprint 2"); creates urgency and spectator interest from the broader community
- **Skill tree on profiles:** visual web of skills + endorsements, not a flat list; shows depth at a glance and is far more shareable than a standard skills section
- **Pinned Labs on profiles:** members choose 1–3 Labs to feature prominently on their profile card; surfaces Labs passively across the whole app everywhere profiles appear
- **Community Awards (quarterly):** member-voted — Best Lab, Best Win, Most Helpful, Rising Builder; results posted to Plaza as a featured post; costs nothing to operate, drives strong engagement and gives members a reason to return

## 21) AI & API layer (cold start + automation)

- **Seeding:** generate + populate Plaza posts, tags, starter listings, and Lab templates before launch; labeled appropriately
- **AI participation:** clearly badged AI assistant accounts can answer Asks, summarise Lab updates, and compile the weekly digest
- **API scope:** REST API + webhooks + **MCP server** so external agents/tools can read and write (posts, listings, Lab updates) using scoped, rate-limited, audited API keys
- Weekly digest (email + pinned post): top Wins, open Asks, new Labs, new listings

## 22) Platform requirements

- **Bilingual:** Somali + English UI from day one (i18n architecture), per-user toggle
- **Mobile:** responsive PWA, installable, push notifications (Android full; iOS 16.4+ limited), lightweight
- **API-first architecture:** clean separation between frontend and backend from day one so a React Native app can consume the same API in v1.2 without a rewrite
- **Low-bandwidth mode:** toggle that switches off images, embeds, and map tiles (text-only); **auto pop-up offering the mode when 3G/2G is detected or the user is in a low-bandwidth region**; WebP + lazy-loading everywhere
- Compatibility: embed/link-first philosophy; works on low-end Android browsers; accessibility AA basics
- **Smart notification bundling:** group related notifications instead of individual pings ("3 people reacted to your post · 2 new Lab updates · 1 Ask answered"); less noise, more signal
- **Embed widget:** a JS snippet / iframe any Somali business or diaspora org can drop on their website to show their Xidig profile card or Lab card; drives backlinks and passive brand spread

## 23) Analytics spec (event taxonomy)

- Activation: signup_completed, profile_completed, lane_selected, verification_started, verification_completed
- Plaza: post_created (by type), comment_created, ask_resolved, report_submitted, report_resolved
- Social: follow_created, dm_request_sent, dm_sent, mention_sent
- Directory/Map: listing_created, listing_claimed, map_view, listing_view, contact_click
- Labs: lab_created, lab_joined, lab_update_published, lab_marked_dormant, lab_revived
- Capital: candidate_submitted, candidate_reviewed, interest_expressed (by type), venture_timeline_viewed
- Community: lab_collaboration_created, skills_gap_alert_sent, skills_gap_alert_clicked, mentor_ask_answered, reaction_added (by type), governance_log_viewed
- Platform: badge_awarded, low_bandwidth_enabled, language_switched, invite_sent, invite_accepted
- Tooling: PostHog (EU cloud or self-hosted); dashboards map 1:1 to section 4 metrics; no PII in event payloads

## 24) Infrastructure & media stack (recommended)

- Core: Supabase (Postgres + RLS as the permission model, auth, storage) + Vercel
- Search: Typesense or Meilisearch · Maps: MapLibre + Protomaps/MapTiler · Background jobs: Inngest or [Trigger.dev](http://Trigger.dev) · Email: Resend or Postmark · Rate limiting: Upstash · Errors: Sentry · AI moderation pre-filter on posts and images
- Images: Supabase Storage + transcode pipeline (MB cap enforced client + server side)
- **Video — decided: Option A for v1.0 (B/C are later upgrade paths):**
    - **A — Embed-only (free, recommended for v1.0):** users paste YouTube/TikTok/etc links; plays in-app
    - **B — A + short native clips:** one-click upload of clips up to 60s via Cloudinary free tier (quota-limited)
    - **C — A + full uploads:** Cloudflare Stream (≈5 USD per 1,000 minutes stored; cheapest reliable in-app video upload)
- Ops: dev/staging/prod environments, nightly backups + point-in-time recovery, incident-response basics

## 25) v1.1+ roadmap (paid membership tier)

- **Paid membership = Supporter tier** (renamed from "Supporter+"; about 1 USD/month per [xidig.net/membership](http://xidig.net/membership)) — offsets infrastructure costs; pricing reviewed with members (member-owned ethos)
- **Native video uploads** via Cloudflare Stream (Option C) — Supporter members
- **Group face chats:** video rooms attached to Labs (LiveKit or Daily) — Supporter members can host; any member can join
- **Live service:** scheduled live sessions/AMAs with RSVP; recordings auto-posted to Plaza
- **"This week in Xidig" shareable card:** auto-generated designed image card (top Win, hottest Ask, newest Lab, biggest listing); members share to WhatsApp/Twitter/X; brand spreads virally through community networks
- 🌙 **Ramadan mode:** Plaza gains Dua/Reflection post types for the month; Lab sprint clocks pause; special seasonal badge; minimal effort, major community resonance
- 📊 **"State of Somali Business" annual report:** auto-generated from Directory + Capital data; published as a public PDF each year; press-ready, repeatable, unique
- Payments: Stripe where supported + manual/local rails (e.g. EVC Plus) via manual ops initially
- **v1.2 — React Native (Expo):** cross-platform native app (iOS + Android) consuming the existing API; App Store + Play Store listing; full push notifications on both platforms; share most logic with the web codebase via Expo
- No Swift/Kotlin native planned — React Native via Expo covers all requirements without two separate codebases
- Principle: free keeps the community core (Plaza, chat, social, browsing); Supporter unlocks governance, Lab creation, Builder/Investor paths, and heavy-bandwidth features

## 26) Build inputs & constants (for one-shot builds)

- **Design:** follow the [Xidig Brand Guide](https://app.notion.com/p/Xidig-Brand-Guide-4b6bc4ea07404a96aa81aad60d30e9b8?pvs=21) for colors, typography, and tone
- **Auth method:** **three co-equal methods — email + password, email magic link, or phone SMS-OTP** (any one sufficient; one canonical account per person with at least one verified email or phone; additional methods link to it). Password hashes are managed by Supabase `auth.users` (no app-schema column); enforce a minimum password policy (length + breach check where feasible) and a "forgot password" email reset. WhatsApp OTP deferred to v1.1 behind a provider abstraction (build the OTP send channel-agnostic).
- **Membership & lanes (per [xidig.net/membership](http://xidig.net/membership)):** Free Member (Plaza access, chat, social features, read-only select Labs, view some venture profiles) → **Supporter** (renamed from "Supporter+", about 1 USD/month: Candidate votes, governance rights, create/join more Labs, monthly intelligence updates, unlocks paths) → **Builder Path** (join Labs as Contributor, build Candidates, earn equity) / **Investor Path** (deploy capital, priority deal flow; enhanced verification). Lab contributor roles: Operator · Researcher · Advisor
- **"Somalia region" definition (Capital gating):** profile country is Somalia AND geo-IP agrees AND the member has ticked the self-attestation checkbox ("I confirm I am based in Somalia"); any mismatch or missing attestation → informational view
- **RBAC summary:** member (create/edit own content, report, vouch if verified) · mod (reports queue, remove content, suspend users, verify members) · admin (all mod powers + role management, listing moderation, badge management, settings, audit log access)
- **Constants:** images 5MB · Ask nudge after 7 days · Lab dormant after 28 days · new accounts: 5 posts/day, 10 comments/day, 5 DM requests/day, 2 listings/week · vouches required: 3 · account delete grace: 30 days
- **Notification matrix:** in-app = everything · email = DM requests, candidate status changes, weekly digest · push (PWA) = DMs, mentions, replies
- **Seed tags (approved):** fintech, logistics, import/export, agri-food, e-commerce, real-estate, construction, education, health, media, fashion, travel, energy, halal-finance, diaspora
- **Listing categories (approved):** Restaurant & Food, Retail, Professional Services, Tech & Digital, Import/Export, Transport & Logistics, Beauty & Fashion, Construction, Agriculture, Education, Health, Media & Creative, Finance, Real Estate, Travel
- **Required accounts/env vars before build:** Supabase, Resend or Postmark, MapTiler, Typesense/Meilisearch, PostHog, Upstash, Sentry, AI provider key (moderation pre-scan + AI accounts)
- **Plain language errors:** every error state must use human language, not technical codes; errors should explain what happened, why, and what to do next; see section 27
- **Human inputs a builder cannot generate:** Somali translation strings (ship English + i18n keys first), final brand assets, content policy document, verifier call scheduling (use an external booking link in v1), legal review of the Capital disclaimer, seed-content review before launch

## 27) Plain language error messages

Every error must answer three questions: **what happened · why · what to do next.** No raw HTTP codes shown to users. Errors are also conversion moments — where relevant, link directly to the resolution.

**Auth & access**

- Gate: free → Supporter action → *"You need a Supporter membership to do this. Upgrade for $1/month →"*
- Gate: Supporter → Builder/Investor path → *"This is available on the Builder Path. Apply to a Lab to get started →"*
- Gate: non-Somalia region → Capital investment language → *"Investment features are available to Somalia-region members. You're seeing the informational view."*
- Session expired → *"You've been signed out. Sign back in to continue →"*
- Magic link expired → *"That sign-in link has expired — they're only valid for 10 minutes. Request a new one →"*
- OTP code expired or incorrect → *"That code didn't work — codes expire after 10 minutes. Request a new one, or use the magic link instead →"*
- Wrong email or password → *"That email or password doesn't match. Try again, reset your password, or sign in with a magic link instead →"*
- Password reset sent → *"Check your email for a link to reset your password — it's valid for 60 minutes."*
- Account suspended → *"Your account has been suspended. If you think this is a mistake, appeal here →"*

**Profile & verification**

- Verification queue full → *"We're fully booked for verification calls this week. You've been added to next week's queue — we'll email you when your slot opens."*
- Handle already taken → *"That handle is taken. Try @[suggestion] or choose your own."*
- Incomplete profile blocking action → *"Finish setting up your profile first — it only takes 2 minutes →"*

**Plaza**

- Post rate limit hit → *"You've posted a lot today — free members can post 5 times per day. Come back tomorrow or upgrade for higher limits →"*
- Image too large → *"That image is over 5MB. Compress it or choose a smaller one — we accept JPG, PNG, GIF, and WebP."*
- Link not embeddable → *"We can't preview that link. It'll still post as a plain URL — or paste a YouTube/TikTok/Vimeo link for an in-app player."*
- Ask already answered → *"This Ask has been marked as answered. You can still comment if you have something to add."*

**Labs**

- Not a Supporter → *"Creating a Lab requires a Supporter membership. Upgrade for $1/month →"*
- Lab join request pending → *"Your request to join has been sent. The Lab lead will review it — you'll get a notification when they respond."*
- Charter incomplete → *"Your Lab charter needs a few more fields before it can go live. Complete them here →"*
- Lab dormant → *"This Lab has been quiet for 4 weeks and is marked Dormant. Are you still working on this? Revive it with a quick update →"*
- Inter-Lab collaboration invite declined → *"[Lab name] declined the collaboration request. You can reach out to their lead directly to discuss →"*

**Capital**

- Reviewer conflict → *"You're a member of this Lab, so you can't review its Candidate. That's to keep reviews fair."*
- Candidate not visible → *"This Candidate is set to reviewers-only. Ask the Lab lead for access."*
- Investment intent (non-Somalia) → *"Direct investment is available to Somalia-region members. You can still explore the Xidig Venture Fund →"*

**Directory & Map**

- Duplicate listing detected → *"A listing for [name] already exists. Is this your business? Claim it here →"*
- Pin not placed → *"Drop a pin on the map to set your location — we use the pin as the primary address for Somalia locations."*
- Export readiness score incomplete → *"Complete your export checklist to get your score. Listings with scores get 3× more contact clicks."*

**DMs**

- DM request blocked → *"You can't message this member — they've restricted their messages."*
- DM request pending → *"Your message request has been sent. They'll see it when they next open Xidig."*

**Moderation**

- Content removed → *"This post was removed for violating our content policy. Read our guidelines →"*
- Report submitted → *"Thanks for the report. We review all reports within 48 hours and will update you on the outcome."*
- Appeal submitted → *"Your appeal has been sent to a senior moderator. We'll respond within 72 hours."*

**Platform / technical**

- Offline / no connection → *"You're offline. Xidig needs a connection to load — check your signal and try again."*
- Low-bandwidth auto-detected → *"Looks like you're on a slow connection. Switch to lightweight mode for a faster experience →"*
- Generic server error → *"Something went wrong on our end. We've been notified automatically — try again in a moment."*
- Not found (404) → *"We can't find that page. It may have been deleted or moved. Go to Home →"*
- Forbidden (403) → *"You don't have access to this. If you think that's wrong, contact support."*

## 28) Overlooked wins to leverage (v1.0)

High-leverage, low-cost moves identified during reassessment. Each maps to the section it strengthens.

- **WhatsApp-first sharing (strengthens §15, §20, §22):** auto-generate OG link-preview images for every Lab, Candidate, profile, and listing; add prominent 'Share to WhatsApp' actions everywhere. The diaspora lives on WhatsApp — this is the primary organic growth loop. Pulls a lightweight version of the v1.1 'This week in Xidig' card forward.
- **Public, login-free pages as the acquisition engine (strengthens §16, §18, §20):** make profiles and business listings shareable and indexable without login (like Public Labs). Every shared link becomes a top-of-funnel entry point.
- **Directory data as a launch PR asset (strengthens §18, §4):** ship a lightweight 'State of Somali Business' stat at launch ('37 fintech builders in Mogadishu') rather than waiting for the v1.1 intelligence report — press-worthy and unique to this market.
- **Position explicitly against WhatsApp groups (strengthens §3, §5):** structured, searchable, persistent execution is the core differentiator over chaotic WhatsApp group threads — make this framing explicit in onboarding and marketing.
- **Email digest as a primary surface (strengthens §21, §22):** for low-bandwidth users who rarely open the PWA, the weekly digest can BE the product — treat it as a first-class retention channel, not an afterthought.
- **'Xidig Verified' as a portable trust brand (strengthens §14):** position verification tiers as a credential members can display off-platform — a moat, not just a badge.

[Xidig v1.0 — UI Spec & Canonical Screens](https://app.notion.com/p/Xidig-v1-0-UI-Spec-Canonical-Screens-885fa5570d19450e8d46306a39aa14a4?pvs=21)
