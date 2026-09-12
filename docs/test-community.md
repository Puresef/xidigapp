# Test community (pre-launch test phase)

A believable miniature society seeded into a **non-production** database so we
can exercise UX, onboarding, Plaza, Labs, DMs, notifications, moderation,
search, discovery, membership states and low-bandwidth behaviour before real
users arrive.

**This is a different tool from the launch-density seed** (`docs/seeding.md`).
That seed is governed by the locked "no fake people" rule and ships to
production. The test community is fake people BY DESIGN and is therefore:

- blocked outright in production (`POST`/`DELETE /api/admin/seed/test-community`
  both 403 when `NODE_ENV=production`);
- kept OUT of the `seed_entities` registry (member-authored content never
  registers there — `seed_runs` only carries a marker row labelled
  `test-community-v1` so re-runs skip the content phase);
- documented account-by-account in the generated `TEST-COMMUNITY-LOGINS.md`.

## Running it

```bash
# Dev server running against the DEV Supabase project, then:
CRON_SECRET=... APP_URL=http://localhost:3000 pnpm --filter @xidig/web seed:test-community

# Tear down (best-effort — see "Reset semantics"):
CRON_SECRET=... APP_URL=http://localhost:3000 pnpm --filter @xidig/web seed:test-community -- --reset
```

The run provisions accounts via the verified GoTrue path (`issueSignupGrant` →
`admin.auth.admin.createUser`) — never the `xidig_gate_bypass` shortcut, which
500s on real GoTrue. Re-running is safe: accounts are skip-if-exists and the
content phase is marker-guarded. If a run dies midway, reset and re-run.

**Password:** every account shares one password, supplied via env — set
`TEST_COMMUNITY_PASSWORD` (or `XIDIG_TEST_COMMUNITY_PASSWORD`) in
`apps/web/.env.local` to any GoTrue-valid value (6+ chars). There is no
default: the seeder fails fast if neither is set, so no plaintext credential
lives in the repo. Re-running the seeder resets every existing test account to
the configured value. Login email is always `<handle>@example.com`; the
generated `TEST-COMMUNITY-LOGINS.md` (gitignored) is the canonical login list.

## What gets seeded

Content ships in two layered waves, each under its own marker (`test-community-v1`,
`test-community-v2`). Wave 1 is the interlocking core society; wave 2 is
living-app density: the long-tail feed (introductions, diaspora support, skill
swaps, jokes, local knowledge, debates), post images, seven more spaces
covering every lifecycle state, the notification case matrix, and the marked
moderation fixtures.

| Surface          | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts         | 60 personas (`apps/web/src/lib/seed/test-community/personas.ts`) + 2 labelled AI helpers (`caawiye_ai`, `warshad_ai`) + the standard `xidig_ai` actor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Profiles         | 4 completeness tiers (full/partial/minimal/bare), Somali/English bios, 12+ countries, lanes/skills/open-to                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Images           | Deterministic persona-matched art via the app's own media path (SVG → sharp → WebP in the `post-media` bucket + `media_uploads` rows): square avatars = gradient + symbolic motif (code brackets, sorghum, waves, chalkboard, football, ...; never faces) + initials; wide banners = story scene (farm rows, harbour, market awning, classroom board, pitch, port, ...); every image ships the pipeline's `_thumb.webp` low-bandwidth pair. A small deliberate cohort keeps NO avatar/banner to test the gradient-disc and empty-banner fallbacks                                                                                                                                                                                                                                                        |
| Membership       | 15 Xidig Plus members (tier id `supporter`), free members, 1 admin, 2 mods, 1 verifier grant, 1 suspended, 1 deactivated, `is_ai` helpers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Plaza            | 93 threads across both waves (asks with credited answers, wins, updates/announcements, introductions, offers/requests, skill swaps, debates, jokes, local knowledge, 6 polls incl. closed ones), ~220 comments, ~500 reactions, bilingual throughout, a pinned `xidig_ai` weekly digest + `caawiye_ai` helper guide (both `source: ai`), ~40 posts with generated images                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Spaces           | 12 across the full visibility split — public listed Labs (Xawilaad Sandbox, Dixon Cup, Iskaashato Hooyo), public clubs (Af-Soomaali Online, Warbaahinta Bulshada, Xawilaad Tools duplicate-fixture), members-only clubs (agri, Bajaaj Co-op, Caafimaadka Hooyada, Suuq Nadiifin), one private club (Barasho Online), one Supporter-only circle (Golaha Maalgashiga); lifecycle states: launched/successful (Dixon Cup), abandoned/dormant (Suuq Nadiifin), disputed duplicate (Xawilaad Tools, reported), needs-funding (Bajaaj Co-op), needs-volunteers (Caafimaadka Hooyada), multilingual (Af-Soomaali Online), region-specific (Suuq Nadiifin, Mogadishu); membership states incl. `invited` + `requested`; accepted collaboration with cross-posted update; AI `warshad_ai` summaries in two spaces |
| Capital          | 1 submitted candidate (live 7-day candidate vote, 2 recusal-safe mod reviews, help/cosign interests) + 1 draft candidate. **No invest intents and no gate evaluations are seeded** — investing is not offered, so seed data must not fabricate a funnel the product does not have (A2 containment)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| DMs              | 10 threads: mentorship, trade negotiation, caregiver support, fan mail, spam pitch, harassment evidence, a pending AI welcome request; unread counts + read-state set realistically                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Notifications    | The full case matrix: replies, mentions, ask-credited + ask-stale nudge, DM request/new-DM previews, lab updates, lab join requests, lab dormancy notice, skill-gap alerts, candidate status, RSVPs, moderation notices, verification updates, community-verified — mixed read/unread. (Reactions/garab deliberately do not notify — locked §26 matrix.)                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Moderation       | Full pipeline: resolved spam report (post removed + warning), resolved harassment report (DM snapshot → suspension → UPHELD appeal by a second mod), dismissed report (civil critique), report in review (assigned), open DM spam report, HITL queue (Somali `ai_uncertain` pending + approved, `ai_flagged` hidden post), immutable `mod_actions`/`audit_logs` — plus wave-2 fixtures marked `[test-fixture]` in report details: repeated spam post, safe misinformation folk-claim (in review), off-topic post, duplicate Lab report, and a heated-but-civil debate pair that must NOT be sanctioned                                                                                                                                                                                                   |
| Suuq             | 3 member-owned listings (one **verified business** with an approved business verification) + 1 unclaimed `(demo)` listing with a pending claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Events           | Lab demo day (online) + community football finals (in-person, capacity), RSVPs incl. `show_publicly` variety                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Graph            | ~260 follow edges (cluster affinity + hubs + one super-follower), tag/lab/candidate follows, endorsements, vouches (→ community-verified + badges), identity verifications, one scheduled verification call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Reputation       | Backdated ledger entries + `recompute_reputation_scores()`, differentiated trust levels, lab-lead/top-helper/mentor badges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Community Awards | The dormant Phase-7 tables activated (marker `test-community-awards`): last quarter **closed + published** (a bilingual `xidig_ai` winners post, pinned, linked via `results_post_id`/`published_at`) and this quarter **open for voting** — ballots cast across all four categories (Best Lab / Best Win / Most Helpful / Rising Builder) with clean pluralities                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Society design (clusters)

tech/fintech (Hargeisa–Stockholm–Toronto), agriculture/climate (Baidoa,
Beledweyne, Borama, Kismayo, Jigjiga), women's co-op (Hargeisa–Cardiff–Nairobi),
diaspora business/investment (Minneapolis–Dubai–London–Istanbul–Mogadishu),
health, education (incl. a private club), trades/logistics (Djibouti corridor),
culture/media (poet, elder oral historian, journalist), civic (mosque
volunteer, organiser, youth football), and four deliberate moderation-test
personas (spammer, suspended harasser, heated debater, Somali-only member whose
posts land in the HITL uncertain lane). Full per-persona detail — age band,
languages, availability, avatar/banner prompts, posting/DM styles, moderation
risk, test purpose — lives in `personas.ts`; the roster table is generated into
`TEST-COMMUNITY-LOGINS.md`.

## Reset semantics (§19 constraints)

`--reset` deletes everything it can, but the schema deliberately forbids
erasing moderation history: `reports` revoke DELETE even from the service role,
and `mod_actions` / `audit_logs` / `report_snapshots` /
`capital_gate_evaluations` are immutability-triggered. Users referenced by
those rows cannot be hard-deleted (NO ACTION FKs), so the reset **anonymises
them in place** (status `deleted`, contact scrubbed, profile blanked) —
exactly the app's own anonymise-not-erase lifecycle. Expect a handful of
anonymised tombstones to remain after a reset; that is correct behaviour, not
a bug. Everything else (accounts, content, DMs, follows, media) is removed.

## Search & discovery

No Meilisearch involved — it is a locked deferral; search runs on the
`search_norm` generated columns (automatic on insert, nothing to reindex).
The dataset deliberately exercises it: Somali/English/bilingual text, place and
name variants in real prose (Xamar/Muqdisho/Mogadishu, Hargeysa/Hargeisa,
xawilaad/xawaalad), tags across both vocabularies, skills/lanes filters,
member names in both spelling traditions, and Lab names in Somali and English.

## Data guards

`apps/web/src/lib/seed/test-community/data.test.ts` makes the design rules
mechanical: 60+2 unique handles/emails on `@example.com`, valid handle/tag
formats, diversity floors (age bands, countries, completeness tiers, Somali
UI share, low-bandwidth share), single credited answer per Ask, well-formed
polls, reviewer recusal, Xidig Plus–gated candidate votes (gate under review), DM pair uniqueness,
participant-only DM reports, event host rights, endorsement/vouch integrity,
and AI content always labelled `ai`. Expanding the dataset without honoring
the rules fails CI.
