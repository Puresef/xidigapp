# Test-community demo tour (screenshot walkthrough)

An ordered walkthrough of the seeded test community for demos and screenshots.
Every account logs in at **`/signin`** with the shared test password (the
`TEST_COMMUNITY_PASSWORD` env value you seeded with — see the generated,
gitignored `TEST-COMMUNITY-LOGINS.md`); the email is always
`<handle>@example.com`. Full account list:
[`TEST-COMMUNITY-LOGINS.md`](../TEST-COMMUNITY-LOGINS.md). Design +
what-gets-seeded: [`docs/test-community.md`](./test-community.md).

Run against a dev/staging deploy (never production — the seeder is blocked
there). Reseed / refresh with
`pnpm --filter @xidig/web seed:test-community`.

> Tip: take each shot at desktop width first, then repeat steps 3, 6 and 14 at
> mobile width — the responsive + low-bandwidth behaviour is part of the story.

---

## 1. Front door (signed out)

- **Login:** none — open in a private window.
- **URL:** `/`
- **Shot:** the marketing front door.
- **Shows:** positioning + "Request access" before any seeded data is visible.

## 2. Public build-in-public (signed out)

- **Login:** none.
- **URL:** `/labs/xawilaad-sandbox`
- **Shot:** the public Lab page as an anonymous visitor.
- **Shows:** the signed-out projection of a public Lab (build-log visible, no
  member-only controls) — the "occupied, honest" first impression.

## 3. Plaza feed — the app feels alive

- **Login:** `ayaan_dev` (power user, follows many).
- **URL:** `/plaza`
- **Shot:** the feed. Scroll for: the pinned **Xidig AI weekly digest**, the
  pinned **Community Awards winners** post, posts with generated images,
  bilingual Somali/English content, wins, asks, polls.
- **Shows:** density, media, tags, the AI-assistant "AI" label, chronological mix.

## 4. A rich thread (comments · reactions · credited answer)

- **Login:** `ayaan_dev`.
- **URL:** `/plaza` → open **"Xawilaad Sandbox v0.1 is live"** (Ayaan's win).
- **Shot:** the thread with its long comment chain, reactions, and mentions.
- **Shows:** replies/co-signs (garab), an elder's story-comment, a sceptic's
  civil challenge — real social texture. (Also try the Somali Ask **"Sidee ku
  bartaa React?"** for a credited-answer + AI-helper reply.)

## 5. Polls

- **Login:** `hafsa_dugsi`.
- **URL:** `/plaza` → **"Which screen should we redesign first?"** (open) and
  **"What's the biggest barrier for Somali startups?"** (closed).
- **Shows:** live voting vs. a closed poll with results.

## 6. Somali-first + low bandwidth

- **Login:** `khalid_codes` (Somali UI, low-bandwidth flag on).
- **URL:** `/plaza`, then `/settings/appearance`.
- **Shot:** the Somali interface; toggle Lite mode to show the low-bandwidth
  variant (images collapse to blurhash placeholders).
- **Shows:** §22 bilingual UX + the low-bandwidth path real members will use.

## 7. Labs — the public / private / supporter split

- **Login:** `ayaan_dev`.
- **URL:** `/labs`
- **Shot:** the Labs directory.
- **Shows:** lifecycle + visibility variety in one screen —
  - **Xawilaad Sandbox** (public Lab, active),
  - **Dixon Cup** (public Lab, _launched/completed_),
  - **Iskaashato Hooyo** (public Lab, promoted from a club),
  - **Beeraha iyo Biyaha** / **Caafimaadka Hooyada** (members-only clubs),
  - **Suuq Nadiifin** (_dormant/abandoned_ — 28-day sweep state),
  - **Golaha Maalgashiga** (Supporter-only — locked unless you're a Supporter),
  - **Barasho Online** (private — not listed; invite-only).

## 8. A Lab build-log (evidence / proof-of-work)

- **Login:** `ayaan_dev`.
- **URL:** `/labs/xawilaad-sandbox`
- **Shot:** the Lab detail — updates timeline, artifacts (link library),
  decisions log, members with roles, "looking for" skill needs, the
  `warshad_ai` **AI summary** update (labelled).
- **Shows:** building-in-public artifacts + AI-helper contribution.

## 9. Needs-funding / needs-volunteers Labs

- **Login:** `faarax_gaadiid` for funding; `maryan_kalkaal` for volunteers.
- **URL:** `/labs/bajaaj-coop` (funding ask), `/labs/caafimaadka-hooyada`
  (volunteer callout + open skill needs).
- **Shows:** the two "asking the community" states, plus join-request members.

## 10. Capital — a venture with live governance

- **Login:** `ifrah_invest` (Supporter).
- **URL:** `/capital`, then open **Xawilaad Sandbox** (submitted candidate).
- **Shot:** the candidate page — pitch, rubric scores, the **Supporter vote
  panel** (live 7-day window), interest bar (help / co-sign only).
- **Shows:** §17 governance, and that the candidate pipeline carries **no invest
  surface for any member in any region** — investing is not offered on Xidig
  (A2 containment). Draft candidate **Hooyo Made** is visible only to Iskaashato
  Hooyo members.

## 11. Community Awards

- **Login:** `ayaan_dev`.
- **URL:** `/awards`, and the pinned **"Community Awards — winners"** post in
  `/plaza`.
- **Shot:** the open voting page (4 categories: Best Lab, Best Win, Most
  Helpful, Rising Builder) + the published last-quarter winners post.
- **Shows:** the quarterly awards loop — one closed+published cycle and one open
  cycle to vote in.

## 12. Leaderboard / reputation

- **Login:** `ayaan_dev`.
- **URL:** `/leaderboard`
- **Shows:** differentiated trust — `maryan_kalkaal` (Top Helper), Lab leads,
  Rising Builders — earned from the seeded activity, with AI accounts absent.

## 13. Direct messages

- **Login:** `khalid_codes`.
- **URL:** `/messages`
- **Shot:** the inbox with unread threads; open the mentorship thread with
  `ayaan_dev` (two unread from Khalid).
- **Shows:** 1:1 DMs, request/accepted states, read receipts, an AI-helper
  thread (`caawiye_ai`). Log in as `warsame_admin` to see the admin-support DM.

## 14. Notifications

- **Login:** `ayaan_dev`.
- **URL:** `/notifications`
- **Shows:** the full case mix — replies, mentions, ask-credited, DM previews,
  lab updates, join requests, RSVP, moderation notices, candidate status,
  verification — mixed read/unread. (`khalid_codes` also has a good inbox.)

## 15. Search & discovery

- **Login:** `ayaan_dev`.
- **URL:** `/search`
- **Try:** `xawilaad` (also spelled `xawaalad`), `Hargeisa` vs `Hargeysa`,
  `beeraha`, `nurse`, `remittance`, a skill like `bookkeeping`, a member name.
- **Shows:** Somali/English + misspelling-tolerant search over members, posts,
  labs, listings (Postgres `search_norm` — no external index).

## 16. Suuq (marketplace)

- **Login:** `muna_macaan`.
- **URL:** `/suuq`, then `/suuq/map`.
- **Shows:** member-owned listings incl. a **verified business** (Guuleed
  Trading), a claimable `(demo)` garage with a pending claim, map spread.

## 17. Profiles — completeness range

- **Login:** any.
- **URL:** `/u/ayaan_dev` (full: avatar, banner, skills, endorsements, badges,
  verified) vs `/u/arday_hargeisa` (bare — onboarding prompts) vs
  `/u/geedi_xoolo` (minimal, gradient avatar fallback).
- **Shows:** the directory rendering across completeness tiers.

## 18. Events + RSVP

- **Login:** `hodan_mod`.
- **URL:** `/events` → **Dixon Cup Finals + Community Day** and **Xawilaad
  Sandbox Demo Day**.
- **Shows:** upcoming events, RSVP counts, capacity, online vs in-person.

## 19. Moderator queue

- **Login:** `hodan_mod` (moderator).
- **URL:** `/admin/moderation`, `/admin/reports`, `/admin/appeals`.
- **Shot:** the report queue with live items.
- **Shows:** the moderation pipeline — a report **in review** (herb-tea
  misinformation), open reports (repeat spam, off-topic, duplicate Lab), a
  **resolved** spam removal, a **resolved harassment → suspension** with an
  **upheld appeal**, and the Somali HITL review lane. Every fixture report is
  tagged `[test-fixture]` in its details.

## 20. Verifier flow

- **Login:** `leyla_verifier` (verifier grant — not a mod).
- **URL:** `/admin/verifications`
- **Shows:** the verification queue — a **scheduled** call (Maryan), approved
  identity/business verifications, access-logged recordings. Note the verifier
  capability is separate from mod/admin (Leyla can't see `/admin/reports`).

## 21. Admin overview

- **Login:** `warsame_admin` (admin).
- **URL:** `/admin/seed`, `/admin/settings`, `/admin/taxonomy`.
- **Shows:** the admin surfaces — seed dashboard, platform settings, taxonomy
  (lanes / skills / suggestions), and (via any admin route) the audit trail
  behind mod actions.

---

### Suspended / lifecycle states (optional)

- `burhaan_qaylo` is **suspended** — signing in shows the suspended-account
  path; his content is hidden from members but visible to mods.
- `daahir_maqan` is **deactivated** — his old comment is hidden from members,
  his DM history is preserved for the other party.

### Quick "wow" set (5 screenshots)

`/plaza` (ayaan_dev) → `/labs/xawilaad-sandbox` → `/c/…` Xawilaad candidate
(ifrah_invest) → `/awards` → `/admin/moderation` (hodan_mod).
