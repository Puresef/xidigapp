# Munaasabado (Events) + Community Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Munaasabado P1 screens (9a list, 9b detail, 9c community modules) and their E2 family (e1–e7) on top of the existing Events+RSVP backend, plus the three missing mechanics: named-RSVP honest capacity with atomic release, check-in-backed past records, and the 9c modules (award auto-post with system provenance, follow-suggestion mounting on Madal, mentor-in-residence bookable slots).

**Architecture:** The 10 Jul Events backend (tables, RLS, API-only writes, ICS, reminders, cancel notifications) stays; this pass upgrades semantics (exact counts, named RSVPs, DB-level capacity guard, post-end immutability, T-3d reminders), adds one migration (`20260812000000_munaasabado.sql`), rebuilds the two event pages to the frames, and threads the 9c modules through Plaza with a codsi-style rail grid.

**Tech Stack:** Next 16 App Router (server components + small client islands), Supabase (service-role API writes, RLS reads), Zod 4, `@xidig/i18n` MessageKeys, vitest (embedded Postgres 17 for db suites, jsdom SSR-render for components).

**Design source (read these, they carry the exact copy):**
- `/tmp/claude-1000/-home-warya-xidigapp/efd7fbf5-4d16-4158-96d3-119fb9608ed2/scratchpad/design/Munaasabado-Events.dc.html` (9a/9b/9c)
- `/tmp/claude-1000/-home-warya-xidigapp/efd7fbf5-4d16-4158-96d3-119fb9608ed2/scratchpad/design/Munaasabado-States.dc.html` (e1–e7)

## Global Constraints

- **Shared worktree:** another session's Aniga work sits UNCOMMITTED in this tree. The following files carry its hunks and are edited by this plan too — **Read the current file immediately before every edit, make strictly additive edits, never revert or reformat surrounding code**: `packages/i18n/src/dictionaries/en.ts`, `packages/i18n/src/dictionaries/so.ts`, `apps/web/src/lib/analytics/events.ts`, `apps/web/src/lib/errors.ts`, `apps/web/src/app/globals.css` (path: `apps/web/src/app/globals.css`), `packages/db/src/database.types.ts`, `packages/db/src/experience-expansion.test.ts`, `packages/db/src/migrations.test.ts`.
- **NO git commits in any task.** Warya sequences commits (uncommitted Aniga work would be swept in). Tasks end at green tests.
- **Every user-facing string is a MessageKey** in BOTH dictionaries (lint rule `xidig-i18n/no-hardcoded-copy`; `coverage.test.ts` enforces SO parity + placeholder parity). SO copy from frames is verbatim; strings marked *(extrapolated)* join the standing native-review batch (ruling 16 pattern).
- **Never `Intl.RelativeTimeFormat`**, and month/weekday NAMES are dictionary-owned (`time.*`) — numeric time formatting via `Intl` is fine.
- **Orange law:** `--x-trust` only on the award celebration surfaces (chip, ring). Zero orange anywhere else in this plan.
- **Lite defers bytes never features:** covers via `MediaSlot` with `prefs`; no `if (lite) return null`; writes never gated.
- **Motion double-gated:** any animation behind `@media (prefers-reduced-motion: no-preference)` AND `html:not([data-motion='off'])`. Skeleton primitives already comply — use them.
- **Ruling 6:** NO rail/dock/Madal nav changes. `rail-nav.tsx` / `app-nav.tsx` and their locking tests are untouchable.
- **API conventions:** envelope via `apiOk`/`ApiError`/`handleApiError`; new error code = `ERROR_DEFS` entry + `error.*` key in both dicts; service-role writes only (client insert on these tables is revoked).
- **No `.upsert()`** on column-scoped-grant tables.
- **Buttons/tags `white-space: nowrap`;** layouts survive ~130% Somali strings.
- **Dispatch return contract:** unresolved design/product tensions are FLAGGED in the final report, never silently resolved (see "Flags" at bottom; add to it, don't fix).

---

## File Structure (created / modified)

**Migration & db**
- Create: `packages/db/supabase/migrations/20260812000000_munaasabado.sql`
- Create: `packages/db/src/munaasabado.test.ts`
- Modify: `packages/db/src/database.types.ts` (additive: new columns/tables/enum value)
- Modify: `packages/db/src/experience-expansion.test.ts` (media_kinds seed set += `event_cover`)

**i18n**
- Modify: `packages/i18n/src/dictionaries/en.ts`, `so.ts` (all keys in the Copy Table below)
- Create: `apps/web/src/lib/events/datetime.ts` + `datetime.test.ts` (dictionary-owned date-block/weekday helper)

**Events lib/api**
- Modify: `apps/web/src/lib/events/views.ts` (exact counts, card list loader, attendee samples, host stats)
- Modify: `apps/web/src/lib/events/schemas.ts` (agenda, coverMediaId)
- Modify: `apps/web/src/lib/events/reminders.ts` (T-72h + payload)
- Modify: `apps/web/src/lib/media/transcode.ts` (+`event_cover`)
- Modify: `apps/web/src/lib/media/transcode.test.ts`
- Modify: `apps/web/src/app/api/events/route.ts` (cover at create)
- Modify: `apps/web/src/app/api/events/[slug]/route.ts` (immutability, cover attach)
- Modify: `apps/web/src/app/api/events/[slug]/rsvp/route.ts` (showPublicly default true, trigger error map)
- Create: `apps/web/src/app/api/events/[slug]/checkin/route.ts` (+ colocated `route.test.ts`)
- Create: `apps/web/src/lib/events/rsvp-queue.ts` + `rsvp-queue.test.ts` (offline queue)
- Modify: `apps/web/src/lib/events/events.test.ts`, `views.test.ts`

**Events UI**
- Create: `apps/web/src/components/events/event-card.tsx` + `event-card.test.tsx` (9a card, all states)
- Create: `apps/web/src/components/events/events-offline-notice.tsx`
- Create: `apps/web/src/components/events/checkin-list.tsx`
- Create: `apps/web/src/components/events/event-cover-picker.tsx`
- Rewrite: `apps/web/src/app/events/page.tsx` (9a), `apps/web/src/app/events/loading.tsx` (e1)
- Rewrite: `apps/web/src/app/events/[slug]/page.tsx` (9b)
- Modify: `apps/web/src/components/events/rsvp-buttons.tsx` (verbs, queue, confirmed state)
- Modify: `apps/web/src/components/events/cancel-event-button.tsx` (house Dialog confirm)
- Modify: `apps/web/src/components/events/event-form.tsx` (agenda editor + cover upload)
- Modify: `apps/web/src/app/globals.css` (`.xidig-event*`, `.xidig-plaza-layout` blocks — append only)

**Digniino (e7)**
- Modify: `apps/web/src/lib/notifications/present.ts` (+meta/actions for event_reminder), `present.test.ts`
- Modify: `apps/web/src/components/notifications/notifications-inbox.tsx` (render meta + actions)
- Modify: `apps/web/src/lib/notifications/types.ts` (+`mentor_slot_booked`)
- Modify: `apps/web/src/components/settings/notification-settings.tsx` (TYPE_LABELS entry)

**9c modules**
- Create: `apps/web/src/lib/awards/publish.ts` + `publish.test.ts`
- Create: `apps/web/src/app/api/admin/award-cycles/[quarter]/publish/route.ts` (+ `route.test.ts`)
- Modify: `apps/web/src/lib/plaza/views.ts` (PostView.award hydration)
- Modify: `apps/web/src/components/plaza/post-card.tsx` (award presentation)
- Modify: `apps/web/src/components/content-source-badge.tsx` (+'system')
- Create: `apps/web/src/components/plaza/community-rail.tsx` (follow-suggestion module + mentor card container)
- Create: `apps/web/src/components/mentor/mentor-residence-card.tsx` + `.test.tsx` (bookable card)
- Create: `apps/web/src/app/api/mentor/slots/[id]/book/route.ts` (+ `route.test.ts`)
- Modify: `apps/web/src/app/api/admin/mentor/route.ts` (lab/hours/slots)
- Modify: `apps/web/src/app/plaza/page.tsx` (rail grid + inline mobile module)
- Modify: `apps/web/src/components/plaza/plaza-feed.tsx` (inline module slot)
- Modify: `apps/web/src/lib/analytics/events.ts` (+3 events)

---

## Copy Table (single source for Tasks 2+; SO verbatim from frames unless *(extrapolated)*)

New keys unless marked **(exists — update SO value to frame verbatim if it differs; never change the key name)**.

| Key | EN | SO |
|---|---|---|
| `events.tabUpcoming` | `Upcoming` | `Soo socda` |
| `events.tabPast` | `Past` | `La qabtay` |
| `events.tabMine` | `Mine` | `Kuwayga` |
| `events.createAria` | `New event` | `Munaasabad cusub` |
| `events.hostLineLab` | `Host: {name} · Warshad` | `Martigeliye: {name} · Warshad` |
| `events.hostLineMember` | `Host: {name}` | `Martigeliye: {name}` |
| `events.capacityConfirmed` | `{going} / {capacity} seats confirmed` | `{going} / {capacity} boos la xaqiijiyay` |
| `events.confirmedNoLimit` | `{count} confirmed · no seat limit` | `{count} la xaqiijiyay · boos aan xadidnayn` |
| `events.rsvpGoing` **(exists)** | `I'm coming` | `Waan imanayaa` |
| `events.rsvpConfirmed` | `You're confirmed` | `Waad xaqiijisay` |
| `events.pastAttended` | plural `{ one: 'Held · {count} person came', other: 'Held · {count} people came' }` | plural `{ one: 'La qabtay · {count} qof ayaa yimid', other: 'La qabtay · {count} qof ayaa yimid' }` |
| `events.pastPhotosReport` | `Photos and report` | `Sawirrada iyo warbixinta` |
| `events.honestyNote` | `Numbers are confirmed RSVPs — no more, no less. A finished event says what actually happened.` | `Tirooyinku waa RSVP la xaqiijiyay — kama badna, kama yara. Munaasabad dhammaatay waxay sheegtaa waxa dhabtii dhacay.` |
| `events.backToAll` | `All events` | `Dhammaan munaasabadaha` |
| `events.statusOpen` | `Open` | `Furan` |
| `events.attendeesTitle` **(exists)** | `Who's coming` | `Cidda imanaysa` |
| `events.capacitySeats` | `{going} / {capacity} seats` | `{going} / {capacity} boos` |
| `events.moreAttendees` | `+{count} more` | `+{count} kale` |
| `events.namesVisibleNote` | `Names are visible — an RSVP is a social commitment, not a hidden number.` | `Magacyadu way muuqdaan — RSVP waa ballan bulsheed, ma aha tiro qarsoon.` |
| `events.agendaTitle` | `Programme` | `Barnaamijka` |
| `events.factWhen` | `When` | `Goorta` |
| `events.factWhere` | `Where` | `Goobta` |
| `events.factSeats` | `Seats` | `Boosas` |
| `events.capacityConfirmedShort` | `{going} / {capacity} confirmed` | `{going} / {capacity} la xaqiijiyay` |
| `events.cancelReleaseNote` | `Backing out is one tap — your seat frees up for someone else.` | `Ka noqoshadu waa hal taabasho — booskaaga qof kale ayaa heli kara.` |
| `events.hostCardTitle` | `Host` | `Martigeliyaha` |
| `events.hostPastEventsLab` | plural `{ one: 'Warshad · {count} past event', other: 'Warshad · {count} past events' }` | plural `{ one: 'Warshad · {count} munaasabad horay', other: 'Warshad · {count} munaasabadood horay' }` |
| `events.hostPastEventsMember` | plural `{ one: '{count} past event', other: '{count} past events' }` | plural `{ one: '{count} munaasabad horay', other: '{count} munaasabadood horay' }` |
| `events.reportEvent` | `Report this event` | `Ka warbixi munaasabaddan` |
| `events.emptyTitle` | `No upcoming events` | `Munaasabad soo socota ma jirto` |
| `events.emptyBody` | `Events are born in Warshads, the Suuq, and community posts — that's where they'll appear for you.` | `Munaasabaduhu waxay ka dhashaan Warshadaha, Suuqa, iyo qoraallada bulshada — halkaas ayay kaaga soo muuqdaan.` |
| `events.emptyCtaLabs` | `Browse Warshads` | `Fiiri Warshadaha` |
| `events.emptyCtaCreate` | `Create an event` | `Abuur munaasabad` |
| `events.offlineStale` | `No internet. This list is from {age}.` | `Internet ma jiro. Liiskani waa kii {age}.` |
| `events.queuedRsvp` | `RSVP — waiting` | `RSVP — sugaya` |
| `events.queuedNote` | `It will go out when the internet returns` | `Wuxuu baxayaa marka internetku soo noqdo` |
| `events.errorTitle` | `Events didn't load` | `Munaasabaduhu ma soo bixin` |
| `events.errorBody` | `Something went wrong. Try again.` | `Wax baa qaldamay. Isku day mar kale.` |
| `events.retry` | `Try again` | `Isku day` |
| `events.capacityFullLine` | `{capacity} / {capacity} — no seats free` | `{capacity} / {capacity} — boos ma banna` |
| `events.fullReleaseNote` | `If someone backs out, the seat opens immediately. There is no waitlist — priority can't be bought.` | `Haddii qof ka noqdo, booska isla markiiba wuu furmayaa. Liis sugitaan ma jiro — mudnaan lama iibsado.` |
| `events.cancelledNotice` | `The host cancelled this event on {date}. All {count} RSVPs were notified.` | `Martigeliyaha ayaa baajiyay munaasabaddan {date}. Dhammaan {count}-kii RSVP waa la ogeysiiyay.` |
| `events.statusCancelled` **(exists)** | `Cancelled` | `La baajiyay` |
| `events.checkinTitle` *(extrapolated)* | `Record attendance` | `Diiwaangeli imaatinka` |
| `events.checkinHint` *(extrapolated)* | `Mark who came — the count becomes the official record.` | `Calaamadee cidda timid — tiradu waxay noqotaa diiwaanka rasmiga ah.` |
| `events.checkedInLabel` *(extrapolated)* | `Came` | `Yimid` |
| `events.formAgenda` | `Programme` | `Barnaamijka` |
| `events.formAgendaTime` *(extrapolated)* | `Time` | `Waqtiga` |
| `events.formAgendaItem` *(extrapolated)* | `Item` | `Qodobka` |
| `events.formAgendaAdd` *(extrapolated)* | `Add item` | `Ku dar qodob` |
| `events.formCover` | `Event cover` | `Sawirka munaasabadda` |
| `events.coverAlt` | `Event cover: {title}` | `Sawirka munaasabadda: {title}` |
| `events.reminderCancelRsvp` | `Cancel RSVP` | `Ka noqo RSVP` |
| `notif.eventReminder` **(exists — value replaced)** | `3 days away: {title}` | `3 maalmood ka hor: {title}` |
| `notif.eventReminderMetaGoing` | `{when} · you're confirmed · {going}/{capacity}` | `{when} · waad xaqiijisay · {going}/{capacity}` |
| `notif.eventReminderMetaGoingNoCap` | `{when} · you're confirmed · {going} confirmed` | `{when} · waad xaqiijisay · {going} la xaqiijiyay` |
| `notif.eventReminderMetaInterested` *(extrapolated)* | `{when} · you marked interested · {going}/{capacity}` | `{when} · xiise ayaad calaamadisay · {going}/{capacity}` |
| `notif.eventReminderMetaInterestedNoCap` *(extrapolated)* | `{when} · you marked interested · {going} confirmed` | `{when} · xiise ayaad calaamadisay · {going} la xaqiijiyay` |
| `notif.mentorSlotBooked` *(extrapolated)* | `{name} booked a mentor slot — {when}` | `{name} ayaa ballan qabsaday — {when}` |
| `settings.notifTypeMentorSlotBooked` *(extrapolated)* | `Mentor bookings` | `Ballamada la-taliyaha` |
| `awards.resultTitle` | `{category} — {period}: {name}` | `{category} — {period}: {name}` |
| `awards.evidenceMostHelpful` | plural `{ one: '{count} Ask resolved · confirmed by the asker', other: '{count} Asks resolved · each confirmed by the asker' }` | plural `{ one: '{count} Codsi oo la xaliyay · qoraaga codsiga ayaa xaqiijiyay', other: '{count} Codsi oo la xaliyay · qoraaga codsiga ayaa mid kasta xaqiijiyay' }` |
| `awards.evidenceVotes` *(extrapolated)* | plural `{ one: '{count} member vote', other: '{count} member votes' }` | plural `{ one: '{count} cod xubneed', other: '{count} cod xubneed' }` |
| `awards.systemProvenance` | `Published by the Xidig system — member vote, one member one vote` | `Waxaa daabacay nidaamka Xidig — codbixin xubneed, xubin kasta hal cod` |
| `content.systemLabel` | `Xidig system` | `Nidaamka Xidig` |
| `content.systemTooltip` *(extrapolated)* | `Posted automatically by the system — not by a member.` | `Waxaa si toos ah u daabacay nidaamka — kama iman xubin.` |
| `matching.suggestModuleTitle` | `Suggested for you` | `Kula talin` |
| `matching.reasonsPrefix` | `Why:` | `Sababta:` |
| `matching.privacyNote` | `Only your profile data was used — every reason is shown.` | `Kaliya xogtaada bogga ayaa la isticmaalay — sabab kasta waa la muujiyaa.` |
| `mentor.residenceTitle` | `Mentor in residence — {period}` | `La-taliye joogto ah — {period}` |
| `mentor.hoursLabel` | `Hours` | `Saacadaha` |
| `mentor.hostLabel` | `Host` | `Martigeliye` |
| `mentor.bookCta` | `Book a slot` | `Ballan qabso` |
| `mentor.freeNote` | `Free — the Warshad hosts. {minutes} minutes each.` | `Bilaash — Warshadda ayaa martigelisa. {minutes} daqiiqo qofkii.` |
| `mentor.slotsTitle` *(extrapolated)* | `Pick a time` | `Dooro waqti` |
| `mentor.noSlots` *(extrapolated)* | `No open slots right now.` | `Waqtiyo banaan ma jiraan hadda.` |
| `mentor.yourBooking` *(extrapolated)* | `Your booking: {when}` | `Ballankaaga: {when}` |
| `mentor.unbook` *(extrapolated)* | `Cancel booking` | `Ka noqo ballanta` |
| `error.eventEnded` | `This event has ended — its record is fixed.` | `Munaasabaddan waa dhammaatay — diiwaankeedu waa mid taagan.` *(extrapolated)* |
| `error.eventCheckinNotOpen` *(extrapolated)* | `Attendance can be recorded once the event starts.` | `Imaatinka waxaa la diiwaangelin karaa marka munaasabaddu bilaabato.` |
| `error.mentorSlotTaken` *(extrapolated)* | `That slot was just taken — pick another.` | `Waqtigaas waa la qabsaday — dooro mid kale.` |
| `error.mentorAlreadyBooked` *(extrapolated)* | `You can book one slot per residency.` | `Hal ballan ayaad qabsan kartaa xilligan.` |
| `error.awardCycleNotClosed` *(extrapolated)* | `Voting is still open for that cycle.` | `Codayntu weli way furan tahay xilligaas.` |
| `time.month1..12` | `January`…`December` | `Janaayo, Febraayo, Maarso, Abriil, Maajo, Juun, Luuliyo, Agoosto, Sebtembar, Oktoobar, Nofembar, Desembar` |
| `time.monthShort1..12` | `Jan…Dec` | `Jan, Feb, Mar, Abr, Maj, Jun, Lul, Ago, Seb, Okt, Nof, Des` |
| `time.weekday1..7` (ISO Mon=1) | `Monday`…`Sunday` | `Isniin, Talaado, Arbaco, Khamiis, Jimce, Sabti, Axad` |

Also reuse (verify exists, do NOT duplicate): `action.view` (`Fiiri`), `action.follow`/FollowButton copy (`Raac`), `awards.title` (`Abaalmarinta Bulshada`) as the award chip, `awards.category*` as `{category}` param values, `state.queuedChip`/`state.queuedNote`, `events.fullLabel`, `events.addToCalendar` (`Ku dar jadwalka` — update SO to this exact form if it differs), `events.rsvpInterested`, `events.shareText`, `error.eventFull`.

---

### Task 1: Migration `20260812000000_munaasabado.sql` + db suite

**Files:**
- Create: `packages/db/supabase/migrations/20260812000000_munaasabado.sql`
- Create: `packages/db/src/munaasabado.test.ts`
- Modify: `packages/db/src/database.types.ts` (additive — READ FIRST, Aniga hunks present)
- Modify: `packages/db/src/experience-expansion.test.ts` (media_kinds seed list — READ FIRST)

**Interfaces:**
- Produces (later tasks rely on): `events.cover_path text`, `events.cover_blurhash text`, `events.agenda jsonb`, `event_rsvps.checked_in_at timestamptz`, `event_rsvps.show_publicly` default `true`, capacity trigger raising SQLSTATE `23P01` with message `event_full`, `content_source` value `'system'`, table `award_results(quarter, category, target_type, target_id, votes, evidence, post_id)`, `mentor_residencies.{lab_id, hours_note, slot_minutes}`, table `mentor_slots(id, residency_id, starts_at, ends_at, booked_by_user_id, booked_at)`.

- [ ] **Step 1: Write the failing db test** — `packages/db/src/munaasabado.test.ts`, one shared `createTestDatabase()` per the `migrations.test.ts` pattern (beforeAll 240s, afterAll stop). Test groups (write them all first):

```ts
// packages/db/src/munaasabado.test.ts
// Munaasabado dispatch invariants (design frames 9a-9c, e1-e7; rulings 1/6).
// Each block states the product rule it locks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './testing/harness';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); }, 240_000);
afterAll(async () => { await db.stop(); });

describe('events cover + agenda columns', () => {
  it('event_cover media kind is seeded', async () => {
    const { rows } = await db.admin.query("select id from media_kinds where id = 'event_cover'");
    expect(rows).toHaveLength(1);
  });
  it('events carries cover_path, cover_blurhash, agenda (default [])', async () => {
    const { rows } = await db.admin.query(
      `select column_name, column_default from information_schema.columns
       where table_name = 'events' and column_name in ('cover_path','cover_blurhash','agenda')`,
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual(['agenda', 'cover_blurhash', 'cover_path']);
  });
});

describe('honest capacity — DB-level atomic guard', () => {
  it('rejects a going RSVP beyond capacity even via service role', async () => {
    // create host + event capacity 1 + two members; insert going for A (ok), going for B must raise 'event_full'
  });
  it('interested is never capacity-blocked', async () => {});
  it('cancel frees the seat: delete A then B inserts fine', async () => {});
  it('status flip going->interested then a third member takes the seat', async () => {});
});

describe('named RSVP default', () => {
  it('show_publicly defaults true on new rows', async () => {});
});

describe('check-in', () => {
  it('checked_in_at column exists and RLS keeps rows API-only for writes', async () => {});
});

describe("content_source 'system'", () => {
  it('enum carries system', async () => {
    const { rows } = await db.admin.query(
      `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'content_source'`,
    );
    expect(rows.map((r) => r.enumlabel)).toContain('system');
  });
});

describe('award_results', () => {
  it('member can read results, cannot write', async () => {});
  it('one row per (quarter, category)', async () => {}); // unique constraint
});

describe('mentor slots', () => {
  it('member reads open slots but never the booker identity (column grant)', async () => {});
  it('writes revoked from authenticated', async () => {});
  it('unique active booking per member per residency', async () => {}); // partial unique index
  it('slot window sane: ends_at > starts_at CHECK', async () => {});
});
```
Fill in each stub with real inserts via `db.admin` / `db.withRole('authenticated', {sub: userId}, ...)` and `db.createAuthUser()` + factories, mirroring assertions in `packages/db/src/events.test.ts` (RLS style) and `aniga-v3.test.ts` (column-grant style).

- [ ] **Step 2: Run it, confirm failure mode** — `pnpm vitest run packages/db/src/munaasabado.test.ts`. Expect: FAIL (missing columns/tables). If the whole file reports SKIPPED, the migration chain is broken — fix before proceeding (memory trap).

- [ ] **Step 3: Write the migration** — `packages/db/supabase/migrations/20260812000000_munaasabado.sql`:

```sql
-- Munaasabado P1 (frames 9a-9c, e1-e7; rulings 1/6, HANDOFF mechanics rows).
--
-- 1) Event covers ride the standard media pipeline (denormalized path+blurhash,
--    docs/lite-mode.md contract). 2) Capacity becomes a DB guarantee: the API
--    pre-check stays for friendly errors, but the BEFORE trigger serializes on
--    the event row so two simultaneous RSVPs can never oversell a seat — and a
--    cancel (row delete) releases it atomically. 3) RSVPs are named social
--    commitments (show_publicly defaults true; the UI states it). 4) Check-in
--    turns past events into records: "X qof ayaa yimid" comes from check-in,
--    else the going count. 5) content_source gains 'system' for vote-earned
--    award auto-posts (provenance is mandatory, never 'ai' which would claim
--    AI assistance). 6) Mentor-in-residence becomes bookable (Warshad-hosted,
--    free, N-minute slots); booker identity is column-scoped away from members.

-- 1. Event cover media kind + columns ---------------------------------------
insert into media_kinds (id, description)
values ('event_cover', 'Event cover (1600x600 inside, 480 thumb, still)')
on conflict (id) do nothing;

alter table events
  add column cover_path     text,
  add column cover_blurhash text,
  add column agenda         jsonb not null default '[]'::jsonb
    constraint events_agenda_is_array check (jsonb_typeof(agenda) = 'array');

-- The cover and agenda are public content (unlike venue_address/online_url):
-- extend the events column-scoped grant so member (RLS) reads can see them.
grant select (cover_path, cover_blurhash, agenda) on public.events to authenticated;

-- 2. Named RSVP default ------------------------------------------------------
alter table event_rsvps alter column show_publicly set default true;

-- 3. Check-in ----------------------------------------------------------------
alter table event_rsvps add column checked_in_at timestamptz;

-- 4. Atomic capacity guard ---------------------------------------------------
create function public.event_rsvps_capacity_guard()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_capacity integer;
  v_going    integer;
begin
  if new.status <> 'going' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'going' then
    return new; -- already holds a seat
  end if;
  select capacity into v_capacity
    from public.events
    where id = new.event_id
    for update; -- serialize concurrent RSVPs on the same event
  if v_capacity is null then
    return new;
  end if;
  select count(*) into v_going
    from public.event_rsvps
    where event_id = new.event_id
      and status = 'going'
      and (tg_op = 'INSERT' or user_id <> new.user_id);
  if v_going >= v_capacity then
    raise exception 'event_full' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger event_rsvps_capacity
  before insert or update on event_rsvps
  for each row execute function public.event_rsvps_capacity_guard();

-- 5. System provenance value -------------------------------------------------
alter type content_source add value if not exists 'system';
-- (Never referenced elsewhere in THIS file: new enum values are unusable in the
--  same transaction that adds them.)

-- 6. Award results -----------------------------------------------------------
create table award_results (
  quarter      text not null references award_cycles (quarter) on delete cascade,
  category     award_category not null,
  target_type  entity_type not null,
  target_id    uuid not null,
  votes        integer not null check (votes > 0),
  evidence     jsonb not null default '{}'::jsonb,
  post_id      uuid references posts (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (quarter, category)
);
alter table award_results enable row level security;
create policy award_results_select_all on award_results
  for select to authenticated using (true);
revoke insert, update, delete on public.award_results from anon, authenticated;

-- 7. Mentor residencies: Warshad host + hours + slot length ------------------
alter table mentor_residencies
  add column lab_id       uuid references labs (id) on delete set null,
  add column hours_note   text,
  add column slot_minutes integer not null default 20
    constraint mentor_residencies_slot_minutes check (slot_minutes between 5 and 120);

-- 8. Mentor bookable slots ---------------------------------------------------
create table mentor_slots (
  id                 uuid primary key default gen_random_uuid(),
  residency_id       uuid not null references mentor_residencies (id) on delete cascade,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  booked_by_user_id  uuid references users (id) on delete set null,
  booked_at          timestamptz,
  created_at         timestamptz not null default now(),
  constraint mentor_slots_window check (ends_at > starts_at),
  constraint mentor_slots_booking_pair
    check ((booked_by_user_id is null) = (booked_at is null))
);
create index mentor_slots_residency_idx on mentor_slots (residency_id, starts_at);
create unique index mentor_slots_one_booking_per_member
  on mentor_slots (residency_id, booked_by_user_id)
  where booked_by_user_id is not null;

alter table mentor_slots enable row level security;
create policy mentor_slots_select_all on mentor_slots
  for select to authenticated using (true);
revoke all on public.mentor_slots from anon, authenticated;
-- Members see open/taken and their own booking through the API; the booker's
-- identity never reaches other members' clients:
grant select (id, residency_id, starts_at, ends_at, booked_at, created_at)
  on public.mentor_slots to authenticated;
```

- [ ] **Step 4: Run the suite to green** — `pnpm vitest run packages/db/src/munaasabado.test.ts` → PASS. Then `pnpm vitest run packages/db/src/events.test.ts packages/db/src/experience-expansion.test.ts packages/db/src/migrations.test.ts` — fix `experience-expansion.test.ts`'s media_kinds seed assertion by ADDING `'event_cover'` to its expected list (read the file first; Aniga may have touched adjacent lines).

- [ ] **Step 5: database.types.ts** — READ the current file, then additively add: `events` Row/Insert/Update fields `cover_path: string | null; cover_blurhash: string | null; agenda: Json`, `event_rsvps` `checked_in_at: string | null`, new tables `award_results`, `mentor_slots`, `mentor_residencies` extra columns, and `'system'` in the `content_source` enum union. Mirror existing style exactly. Run `pnpm typecheck`.

---

### Task 2: Dictionary keys + dictionary-owned event datetime helper

**Files:**
- Modify: `packages/i18n/src/dictionaries/en.ts`, `so.ts` (READ each immediately before editing; append inside existing namespace blocks)
- Create: `apps/web/src/lib/events/datetime.ts`, `apps/web/src/lib/events/datetime.test.ts`

**Interfaces:**
- Produces: every key in the Copy Table; and
```ts
// apps/web/src/lib/events/datetime.ts
export interface EventDateParts { day: string; monthShort: string; month: string; weekday: string; time: string; timeRange: string | null; }
export function eventDateParts(t: Translator, startsAtIso: string, endsAtIso: string | null, timeZone: string): EventDateParts;
```
`day` = day-of-month in the event tz; `monthShort`/`month`/`weekday` resolved via `t('time.monthShort{n}')` etc. — derive the INDEX with `Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)` (en-US is always present in ICU; map `Mon..Sun` → ISO index). `time` = `HH:MM`; `timeRange` = `HH:MM–HH:MM` when endsAt present (en dash).

- [ ] **Step 1: Failing test** `datetime.test.ts` (node env): `createTranslator('so')` from `@xidig/i18n`; assert `eventDateParts(t, '2026-08-15T13:00:00Z', '2026-08-15T16:00:00Z', 'Europe/London')` → `{ day: '15', monthShort: 'Ago', month: 'Agoosto', weekday: 'Sabti', time: '14:00', timeRange: '14:00–17:00' }`. Add an `en` case and a null-endsAt case. Run — FAIL (module missing; keys missing).
- [ ] **Step 2: Add ALL Copy Table keys to `en.ts` then `so.ts`** — READ each file first; place `events.*` additions beside the existing events block (en.ts ~L1982+), `time.month*/weekday*` in the time block, etc. For **(exists)** keys, update the SO value in place; do not rename. Keep `as const satisfies` intact.
- [ ] **Step 3: Implement `datetime.ts`** per the interface above.
- [ ] **Step 4: Run to green** — `pnpm vitest run apps/web/src/lib/events/datetime.test.ts packages/i18n/src/coverage.test.ts packages/i18n/src/vocabulary.test.ts` → all PASS (coverage will catch any SO/placeholder mismatch).

---

### Task 3: `event_cover` media kind + attach + form upload

**Files:**
- Modify: `apps/web/src/lib/media/transcode.ts` (MEDIA_KINDS += `'event_cover'`; KIND_SPECS `event_cover: WIDE_COVER`; NOT in ANIMATED_KINDS), `transcode.test.ts` (expected kind list)
- Modify: `apps/web/src/lib/events/schemas.ts` — `eventCreateSchema` and `eventUpdateSchema` gain `coverMediaId: z.string().uuid().nullable().optional()` and `agenda: z.array(z.object({ time: z.string().trim().min(1).max(16), label: z.string().trim().min(1).max(160) }).strict()).max(12).optional()`
- Modify: `apps/web/src/app/api/events/route.ts` (POST: after insert-eligibility checks, if `coverMediaId` → `loadAttachableMedia(admin, ctx.appUser.id, coverMediaId, ['event_cover'])` and include `cover_path/cover_blurhash` in the insert; include `agenda` when provided)
- Modify: `apps/web/src/app/api/events/[slug]/route.ts` (PATCH: same attach mirror of `attachLabMedia` in `apps/web/src/app/api/labs/[id]/route.ts:40-88`; `coverMediaId: null` clears both; `agenda` updatable)
- Create: `apps/web/src/components/events/event-cover-picker.tsx` — client; mirrors `ProfileMediaEditor` two-step (`POST /api/media` FormData `kind='event_cover'` → returns media id to the parent via `onUploaded(media)`); uses `FilePickerButton`, `accept="image/jpeg,image/png,image/gif,image/webp"`, shows the uploaded thumb + remove
- Modify: `apps/web/src/components/events/event-form.tsx` — mount the picker (state `coverMediaId`), add the agenda rows editor (state `agenda: Array<{time,label}>`, add/remove row buttons, keys `events.formAgenda*`), include both in the POST body; keep `event-form-hydration.test.tsx` green
- Modify: `docs/lite-mode.md` size table (+`event_cover` row, 1600×600/480, alt from title)

**Interfaces:**
- Consumes: Task 1 columns; Task 2 keys.
- Produces: events API accepts `coverMediaId`/`agenda`; rows carry `cover_path/cover_blurhash/agenda`.

- [ ] **Step 1: Failing tests** — extend `apps/web/src/lib/media/transcode.test.ts` kind-list expectation (READ first) and add zod cases to `apps/web/src/lib/events/events.test.ts`: `eventCreateSchema.parse({...base, agenda: [{time:'14:00', label:'Is-barasho iyo shaah'}]})` passes; 13 rows fails; `coverMediaId: 'not-a-uuid'` fails. Run → FAIL.
- [ ] **Step 2: Implement** transcode + schemas + routes + picker + form per above.
- [ ] **Step 3: Green** — `pnpm vitest run apps/web/src/lib/media/transcode.test.ts apps/web/src/lib/events/events.test.ts apps/web/src/components/events/event-form-hydration.test.tsx` → PASS. `pnpm typecheck`.

---

### Task 4: View/API mechanics — exact counts, named wall, card loader, immutability, check-in, T-3d reminders

**Files:**
- Modify: `apps/web/src/lib/events/views.ts`
- Modify: `apps/web/src/lib/events/constants.ts` (retire the floor for member surfaces: keep `RSVP_COUNT_FLOOR` export but ONLY the public/anon path uses it — see below)
- Modify: `apps/web/src/app/api/events/[slug]/rsvp/route.ts`, `apps/web/src/app/api/events/[slug]/route.ts`
- Create: `apps/web/src/app/api/events/[slug]/checkin/route.ts` + `route.test.ts`
- Modify: `apps/web/src/lib/events/reminders.ts`
- Modify: `apps/web/src/lib/errors.ts` (READ first — add `event_ended`, `event_checkin_not_open`)
- Modify: `apps/web/src/lib/analytics/events.ts` (READ first — add `event_checked_in: Record<string, never>` under the events §23 block)
- Modify: `apps/web/src/lib/events/events.test.ts`, `views.test.ts`

**Interfaces (produced for Tasks 5/6):**
```ts
// views.ts additions
export interface EventCardAttendee { displayName: string; handle: string; }
export interface EventCardItem {
  slug: string; title: string; startsAt: string; endsAt: string | null; timezone: string;
  mode: string; venueName: string | null; status: string; capacity: number | null;
  coverUrl: string | null; coverThumbUrl: string | null; coverBlurhash: string | null;
  host: { kind: 'lab' | 'member'; name: string; href: string } | null;
  goingCount: number; attendedCount: number | null; // attendedCount: past events only — checked-in count, else goingCount
  attendeeSample: EventCardAttendee[]; // first 3 public names
  viewerRsvp: { status: 'going' | 'interested' } | null;
  isPast: boolean; isFull: boolean;
}
export type EventsTab = 'upcoming' | 'past' | 'mine';
export function listEventCards(ctx: AuthContext, tab: EventsTab): Promise<{ items: EventCardItem[]; upcomingCount: number }>;
// EventView additions:
//   counts.going becomes EXACT for members (fold drops the floor on the member path);
//   attendees gains avatar-less named wall data + goingTotal;
//   view.hostStats: { pastEventsCount: number } (count of ended published events for the same lab container, else same host_user_id);
//   view.checkin: { enabled: boolean; rows: Array<{ userId; displayName; handle; status; checkedInAt: string | null }> } | null (host only, starts_at <= now);
//   view.attendedCount: number | null (past events: checked-in count else going count).
```

Semantics to implement precisely:
1. **Exact member counts:** `foldRsvpCounts` keeps its signature but the member path passes exact values through (no floor). The floor logic remains ONLY in `getPublicEventView`/`listPublicEvents` (signed-out projection, unchanged posture — flagged for Warya, see Flags).
2. **Named wall:** member attendee list = `show_publicly=true` going rows (names), plus `goingTotal` so the UI renders `+{goingTotal - shown} kale`. `loadAttendees` gains a `sampleLimit` variant used by the card loader (3 names).
3. **`listEventCards`:** one events query per tab (`upcoming` = published, `starts_at/ends_at >= now` ascending, PLUS the 3 most recent past events appended for the divider section per frame 9a; `past` = ended, descending; `mine` = `host_user_id = viewer` OR viewer has an RSVP — two queries merged, ascending future then descending past), then BATCHED hydration: going counts (one grouped query over ids via service role), attendee samples (one query over ids, sliced per event client-side), viewer RSVPs (one `.in()` query), hosts (labs one query, member profiles one query), covers via `publicMediaUrl`/`derivedThumbPath`. No per-event queries.
4. **Immutability:** in `[slug]/route.ts` PATCH and DELETE: if `(ends_at ?? starts_at) < now` → `throw new ApiError('event_ended', 409)`. RSVP PUT already blocks past events; keep.
5. **RSVP semantics:** `rsvpSchema` `showPublicly` default flips to `true`. Map the trigger's exclusion-violation (pg error code `23P01`, message `event_full`) to `ApiError('event_full', 409)` so the race path and the pre-check path return identical envelopes.
6. **Check-in route** `POST /api/events/[slug]/checkin`, body `{ userId: z.string().uuid(), checkedIn: z.boolean() }`: host or mod/admin only (`requireManageableEvent` pattern from `[slug]/route.ts:31-37`); event must have started (`starts_at <= now`) else `event_checkin_not_open` 409; target row must be an existing RSVP; sets/clears `checked_in_at` via admin client; emits `event_checked_in`; `apiOk({ checkedIn })`.
7. **Reminders:** window 24h → **72h** (`REMINDER_WINDOW_MS`), same atomic claim; payload becomes `{ eventSlug, title, startsAt, timezone, going, capacity, status }` (status = that member's RSVP status; counts snapshot at send). Keep skipping hosts.

- [ ] **Step 1: Failing tests.** In `events.test.ts`: fold returns exact member counts (e.g. going 2 → 2, not null); in `views.test.ts` style add `listEventCards` shape tests with a `FakeClient` if feasible — otherwise cover the pure helpers (`splitTabs`, sample slicing) extracted as exported pure functions. New `checkin/route.test.ts` colocated, using the endorsements `FakeQuery/FakeClient` harness: non-host 403, pre-start 409 `event_checkin_not_open`, happy path sets `checked_in_at`. Run → FAIL.
- [ ] **Step 2: Implement** all seven semantics.
- [ ] **Step 3: Green:** `pnpm vitest run apps/web/src/lib/events apps/web/src/app/api/events` → PASS. `pnpm typecheck`.

---

### Task 5: 9a list page + EventCard + e1/e2/e3/e4/e5/e6 states + offline RSVP queue

**Files:**
- Create: `apps/web/src/components/events/event-card.tsx` + `event-card.test.tsx`
- Create: `apps/web/src/lib/events/rsvp-queue.ts` + `rsvp-queue.test.ts`
- Create: `apps/web/src/components/events/events-offline-notice.tsx`
- Rewrite: `apps/web/src/app/events/page.tsx`, `apps/web/src/app/events/loading.tsx`
- Modify: `apps/web/src/components/events/rsvp-buttons.tsx`
- Modify: `apps/web/src/app/globals.css` (append `.xidig-event-card` block — READ the tail of the file first)

**Interfaces:**
- Consumes: `listEventCards`, `EventCardItem`, `eventDateParts`, Copy Table keys.
- Produces: `EventCard({ item, prefs, locale, variant }: { item: EventCardItem; prefs: LitePrefs; locale: Locale; variant?: 'default' | 'past' | 'cancelled' })` (server component; RSVP button island inside).

**EventCard anatomy (frame 9a, exact):** `<article className="xidig-event-card">` → optional cover `MediaSlot` (kind image, `estBytes={140_000}`, `className="xidig-event-card__cover"`, height ~110px via CSS) → body grid: date block (`.xidig-event-card__date` — `<span class="num">{day}</span><span>{monthShort}</span>`, surface-2, radius-s, min-width 3.2rem, monthShort uppercased via CSS `text-transform: uppercase; letter-spacing: 0.05em`) + title (`--x-display` 700) + meta line `{weekday} · {timeRange} · {venueName|Khadka (online)}` + host line (`events.hostLineLab`/`events.hostLineMember`, lab glyph or 16px `Avatar`) → footer row: avatar stack (≤3 `Avatar` size 24 overlapping via `.xidig-event-card__stack` negative margin + surface ring) + capacity line (`events.capacityConfirmed` when capacity, `events.confirmedNoLimit` when not, `events.capacityFullLine` when full) + RSVP island. Variants: `past` — no RSVP island, `opacity: 0.8`, meta `events.pastAttended {count: attendedCount}` + `events.pastPhotosReport` link to detail; `cancelled` (e6) — `opacity: 0.62`, title `text-decoration: line-through`, tag `events.statusCancelled`, no RSVP. Full (e5): disabled primary button + `events.fullReleaseNote` paragraph. Confirmed: secondary button with check SVG + `events.rsvpConfirmed`, `aria-pressed=true`, accent-soft styling + adjacent `events.addToCalendar` link to `/events/{slug}/calendar.ics`.

**RSVP island rework (`rsvp-buttons.tsx`):** new prop `presentation?: 'card' | 'detail'` (default `'detail'`). Card: single verb button (`events.rsvpGoing` primary when no RSVP; confirmed secondary when going; disabled when full-and-not-going). Detail keeps Going + quieter Interested + Remove (capability preserved — see Flags) and drops the show-publicly checkbox from the primary flow to beneath the attendee wall (default true; unchecking is the opt-out). **Offline queue:** wrap the PUT/DELETE calls — on network failure with `!navigator.onLine`, push `{ slug, action: 'rsvp'|'unrsvp', status, queuedAt: Date.now() }` via `rsvp-queue.ts` and render the queued chip (`events.queuedRsvp` + `events.queuedNote` + Tirtir button per frame e3, clock SVG, `.xidig-event-card__queued` surface-2 row); `rsvp-queue.ts` exports `enqueue/remove/list/subscribe/flush` over `localStorage['xidig_event_rsvp_queue']`, flush on `window 'online'` re-sending each action then `router.refresh()`. True timestamps preserved (queuedAt displayed via `formatRelativeTime`).

**Page rewrite (`events/page.tsx`):** keep dual-mode + `canHost`. Member tree: header row (h1 `events.indexTitle` + icon-button `+` `aria-label={t('events.createAria')}` linking `/events/new` when `canHost`) → tab row of three `<Link>` pills (`xidig-tag` styling, `aria-current="page"` on active; `?tab=` param; upcoming label = `{t('events.tabUpcoming')} · {upcomingCount}` rendered as label + `<span class="num">`) → card list `<div className="xidig-event-list">` with the frame's `La qabtay` divider (`.xidig-event-list__divider`) before appended past cards on the upcoming tab → honesty footer `<p>` `events.honestyNote` → e2 empty state when zero upcoming: `<EmptyState titleKey="events.emptyTitle" messageKey="events.emptyBody" action={<div className="xidig-event-empty__actions"><Link className="xidig-button xidig-button--primary" href="/labs">{t('events.emptyCtaLabs')}</Link><Link className="xidig-button xidig-button--secondary" href="/events/new">{t('events.emptyCtaCreate')}</Link></div>} />` (events list is a warm surface — EmptyState's mark is sanctioned, frame shows it) → `<EventsOfflineNotice renderedAt={Date.now()} />` client island: on `offline` event shows `SystemNotice tone="info"` with `events.offlineStale {age}` (age via `formatRelativeTime(renderedAt)`), plus the e3 error-card pattern is the page-level `error.tsx`? — NO: errors here follow the existing degrade pattern; add a small `events.errorTitle/Body/retry` card only in the client fetch paths (queue flush failures). Category filter links: KEEP below the tabs (existing capability — ruling 1), restyled as a quiet second row.
**Anon (signed-out) branch: unchanged** except cards render via EventCard with no RSVP island.

**`loading.tsx` (e1):** replace LoadingShell with the mirrored skeleton: header line, two `.xidig-skeleton--chip` tab pills, two `.xidig-skeleton-card`s each = date-block square (`.xidig-skeleton--avatar` sized 52px radius-s) + three `--text` lines (75/55/45%) + footer row (`--text` 40% + `--chip` pill 112px). One `role="status"` + `state.loading`; decorative nodes `aria-hidden` (copy `app/p/[id]/loading.tsx` conventions).

- [ ] **Step 1: Failing component tests** — `event-card.test.tsx` (jsdom pragma, SSR-render with `LocaleProvider initialLocale='so'`, mock `@/lib/locale` per `aniga-facts.test.tsx`): (a) default card renders `Waan imanayaa` + `14 / 30 boos la xaqiijiyay` from a fixture with capacity 30/going 14; (b) full card: button disabled + `boos ma banna` + release note text; (c) past card: `21 qof ayaa yimid` and NO RSVP button in DOM; (d) cancelled card: line-through class + `La baajiyay` tag + no RSVP; (e) unlimited: `boos aan xadidnayn`; (f) honesty: attendee stack renders ≤3 discs. `rsvp-queue.test.ts` (node): enqueue/list/remove roundtrip with a stubbed localStorage. Run → FAIL.
- [ ] **Step 2: Implement** card, queue, notice, page, loading, CSS block (`.xidig-event-card`, `__date`, `__stack`, `__queued`, `.xidig-event-list`, `__divider`, `.xidig-event-empty__actions` — tokens only, no raw hexes; nowrap on buttons/tags; focus-visible states come free from `xidig-button`).
- [ ] **Step 3: Green** — `pnpm vitest run apps/web/src/components/events apps/web/src/lib/events` → PASS. `pnpm lint` on touched files (i18n rule). `pnpm vitest run apps/web/src/app/globals-tokens.test.ts` (new classes: if you add any bespoke interactive class, register it in the FOCUS_VISIBLE/ACTIVE lists — prefer reusing `xidig-button`/`xidig-tag` so no registration is needed).

---

### Task 6: 9b detail page rebuild + check-in UI + Dialog cancel

**Files:**
- Rewrite: `apps/web/src/app/events/[slug]/page.tsx`
- Create: `apps/web/src/components/events/checkin-list.tsx` (+ test)
- Modify: `apps/web/src/components/events/cancel-event-button.tsx`
- Modify: `apps/web/src/app/globals.css` (append `.xidig-event-detail` block)

**Interfaces:** Consumes EventView additions (Task 4), `eventDateParts`, ReportControl (`apps/web/src/components/report-control.tsx` — verify exact path/props by reading it; it is the standard report entry), Dialog (`@/components/dialog`).

**Detail tree (frame 9b, responsive — desktop two-column via `.xidig-event-detail` grid `minmax(0,1fr) 306px` at ≥64rem, single column stacked below; ruling 1 both-surfaces):**
1. Cover `MediaSlot` hero (`estBytes={250_000}`, height 190px desktop / 140 mobile via CSS) when `cover_path`.
2. `BackLink` → `events.backToAll`.
3. Title row: h1 + status tag (`events.statusOpen` when published+upcoming; `events.statusCancelled`; past → no tag) + meta line `{weekday} {day} {month} · {timeRange} · {venue}`.
4. Cancelled events (e6): `SystemNotice tone="info"` with `events.cancelledNotice {date: formatDate(cancelled updated_at), count: goingTotal}` ABOVE a dimmed content wrapper (`.xidig-event-detail--cancelled { opacity: 0.62 }` on the record, notice outside it — system voice in chrome, never inside content).
5. Description paragraph (max 62ch).
6. **Attendee wall card**: uppercase label `events.attendeesTitle` + right-aligned `events.capacitySeats`; wrap of named entries (Avatar 24 + name, `show_publicly` rows) + `events.moreAttendees {count: goingTotal - shown}` when >0; footer `events.namesVisibleNote`. Below it (viewer with RSVP): the show-publicly checkbox (existing key `events.showPubliclyLabel`).
7. **Agenda card** when `agenda.length`: label `events.agendaTitle`, grid `auto 1fr` of `{time}` (num, muted) / `{label}`.
8. **Aside** (sticky ≥64rem): facts card (Goorta/Goobta/Boosas rows; venue reveal rules unchanged) + primary RSVP island (`presentation='detail'`) + `events.addToCalendar` & ShareActions secondary row + `events.cancelReleaseNote`; **host card** (`events.hostCardTitle`; lab container → lab glyph tile + name + `events.hostPastEventsLab {count: hostStats.pastEventsCount}`, else Avatar + name + `events.hostPastEventsMember`) linking to the lab/profile; report link via ReportControl for entity event, label `events.reportEvent`; host-only `CancelEventButton`.
9. **Check-in (host, started events):** `<CheckinList slug rows />` client component — `events.checkinTitle` + `events.checkinHint` + per-RSVP row (name + checkbox `events.checkedInLabel`) POSTing `/api/events/[slug]/checkin` then `router.refresh()`. Renders only when `view.checkin` non-null.
10. Preserve: draft/awaiting-review banners, venue/online reveal sections, anon CTA branch, `generateMetadata`.

**Cancel via house Dialog (ruling 18):** `cancel-event-button.tsx` replaces `window.confirm` with `Dialog` (`presentation='modal'`): title `events.cancelEvent`, body `events.cancelConfirm`, confirm = danger-styled `xidig-button--primary`, cancel secondary. Keep the DELETE + refresh flow.

- [ ] **Step 1: Failing tests** — extend/create jsdom test for the page-level pieces that are pure components: `checkin-list.test.tsx` (rows render, checkbox posts — mock `@/lib/api-client`), and a `cancel-event-button` test asserting the Dialog opens (no `window.confirm` spy anymore). Detail-page assembly is covered by the existing route-level conventions (no page test exists today; do not invent a brittle one — the card/state tests carry the copy locks).
- [ ] **Step 2: Implement** page + components + CSS.
- [ ] **Step 3: Green** — `pnpm vitest run apps/web/src/components/events` → PASS; `pnpm typecheck && pnpm lint`.

---

### Task 7: e7 Digniino reminder row

**Files:**
- Modify: `apps/web/src/lib/notifications/present.ts` + `present.test.ts`
- Modify: `apps/web/src/components/notifications/notifications-inbox.tsx`

**Interfaces:**
```ts
// present.ts additions
export interface BundleExtras { meta: string | null; actions: Array<{ labelKey: MessageKey; href?: string; kind?: 'unrsvp'; eventSlug?: string }>; }
export function bundleExtras(b: NotificationBundle, t: Translator): BundleExtras; // returns {meta:null,actions:[]} for every type except event_reminder
```
For `event_reminder` with the Task-4 payload: summary = `notif.eventReminder {title}` (fallback to the previous generic copy when `payload.title` missing — old rows must not crash); meta = `notif.eventReminderMeta{Going|Interested}{'' | NoCap}` with `{when: `${weekday} ${time}` via eventDateParts, going, capacity}`; actions = `[{labelKey:'action.view', href:'/events/{slug}'}, {labelKey:'events.reminderCancelRsvp', kind:'unrsvp', eventSlug}]` (second action only when `payload.status` present). Inbox renders meta as a muted line and actions as an inline link row; `kind:'unrsvp'` renders a button that `apiDelete('/api/events/{slug}/rsvp')` then refetches (calm styling — accent link, no red, no pulse).

- [ ] **Step 1: Failing tests** in `present.test.ts` (READ existing structure): event_reminder with full payload → SO title `3 maalmood ka hor: Shir-madasha Xidig London`, meta contains `waad xaqiijisay · 14/30`, two actions; legacy payload (`{eventSlug}` only) → generic-safe, zero actions. Run → FAIL.
- [ ] **Step 2: Implement** presenter + inbox rendering (keep the unknown-type→`notif.generic` contract test green).
- [ ] **Step 3: Green** — `pnpm vitest run apps/web/src/lib/notifications apps/web/src/components/notifications` → PASS.

---

### Task 8: Award auto-post (publish results → Plaza, system provenance)

**Files:**
- Create: `apps/web/src/lib/awards/publish.ts` + `publish.test.ts`
- Create: `apps/web/src/app/api/admin/award-cycles/[quarter]/publish/route.ts` + `route.test.ts`
- Modify: `apps/web/src/lib/plaza/views.ts` (PostView += `award: AwardPostView | null`; hydrate in `hydratePosts` via one batched `award_results.in('post_id', ids)` query + winner profile hydration)
- Modify: `apps/web/src/components/plaza/post-card.tsx` (award presentation)
- Modify: `apps/web/src/components/content-source-badge.tsx` (`'system'` → `content.systemLabel`/`content.systemTooltip`, class `xidig-tag` — neutral, NOT seeded-violet)
- Modify: `apps/web/src/lib/analytics/events.ts` (+`award_results_published: { quarter: string }` — taxonomy string, PII-safe)

**Interfaces:**
```ts
// lib/awards/publish.ts
export interface AwardWinner { category: Enums<'award_category'>; targetType: Enums<'entity_type'>; targetId: string; votes: number; }
export function pickWinners(tally: AwardWinner[]): AwardWinner[]; // pure: top votes per category; tie → lower target_id (deterministic, documented)
export async function publishAwardResults(admin: Admin, quarter: string, t: Translator): Promise<{ postIds: string[] } | { already: true }>;
// PostView addition
export interface AwardPostView {
  category: Enums<'award_category'>; quarter: string; votes: number;
  winner: { displayName: string; handle: string | null; href: string; avatarThumbUrl: string | null; avatarBlurhash: string | null } | null;
  evidence: { asksResolved?: number };
}
```
`publishAwardResults` flow: cycle row must exist, `closes_at <= now` else `ApiError('award_cycle_not_closed', 409)`; `published_at` set → return `{already:true}` (idempotent 200). `admin.rpc('award_vote_tally', { p_quarter })` → `pickWinners` → per winner: resolve display target (user→profiles, lab→labs, post→posts title+author), most_helpful evidence = count of posts `type='ask' and ask_status='fulfilled' and ask_helper_user_id = winner and ask_fulfilled_at between opens_at and closes_at`; create ONE post per category winner via a new `createSystemPost` helper modeled on `createSeededPost` (`lib/seed/content.ts:168-208`) but with `source: 'system'`, author `getSeedActorUserId(admin)`, `type: 'update'`, `dedupKey: \`award:${quarter}:${category}\``, body = `t('awards.resultTitle', {category: t(categoryKey), period: quarter, name})` + provenance sentence (post body is a fallback for non-award-aware surfaces; the card renders structured); insert `award_results` row with `post_id`; finally update `award_cycles` `{ published_at: now, results_post_id: mostHelpfulPostId ?? firstPostId }` and emit `award_results_published`. Winners are NOT auto-badged (no design mandate — flagged).

**PostCard award presentation** (when `view.award`): replace the byline block with: chip row `<span className="xidig-tag xidig-tag--trust">★ {t('awards.title')}</span>` + date; identity row — Avatar 52 wrapped in `.xidig-award-ring` (`box-shadow: 0 0 0 3px var(--x-surface), 0 0 0 5px var(--x-trust)` — sanctioned vote-earned orange) + title `awards.resultTitle` (category via `awards.category*`) + evidence line (`awards.evidenceMostHelpful {count}` when `evidence.asksResolved`, else `awards.evidenceVotes {count: votes}`); footer (above ReactionBar, `border-top`): `<span data-award-provenance className="xidig-card__meta">{t('awards.systemProvenance')}</span>` — **the provenance node is mandatory and carries `data-award-provenance` (structural test target)**. ReactionBar renders normally (counts already hidden pre-interaction — 🤲 chip shows without numbers).

- [ ] **Step 1: Failing tests** — `publish.test.ts` (node): `pickWinners` dedupes categories, deterministic tie-break; `publish/route.test.ts` (FakeClient harness): non-admin 403, open cycle 409 `award_cycle_not_closed`, second publish → `{already:true}` 200. jsdom test in a new `post-card-award.test.tsx` or extend existing post-card test file if present: award view renders `[data-award-provenance]` with SO provenance copy, the trust chip, and NO author byline link. Run → FAIL.
- [ ] **Step 2: Implement** publish lib + route + hydration + card + badge case.
- [ ] **Step 3: Green** — `pnpm vitest run apps/web/src/lib/awards apps/web/src/app/api/admin/award-cycles apps/web/src/components/plaza` → PASS.

---

### Task 9: Mentor-in-residence bookable card

**Files:**
- Modify: `apps/web/src/app/api/admin/mentor/route.ts` — bodySchema gains `labId: z.string().uuid().nullable().optional()`, `hoursNote: z.string().trim().min(1).max(80).optional()`, `slotMinutes: z.number().int().min(5).max(120).default(20)`, `slots: z.array(z.object({ startsAt: z.string().datetime({ offset: true }) })).max(50).default([])`; insert residency with new columns; bulk-insert `mentor_slots` rows (`ends_at = startsAt + slotMinutes`)
- Create: `apps/web/src/app/api/mentor/slots/[id]/book/route.ts` + `route.test.ts` — POST: `requireUser` → atomic claim `update mentor_slots set booked_by_user_id, booked_at where id = ? and booked_by_user_id is null` (0 rows → `mentor_slot_taken` 409; unique-index 23505 → `mentor_already_booked` 409); future slots only; `notify(admin, { userId: advisor, actorUserId: member, type: 'mentor_slot_booked', payload: { when } })`; emits `mentor_slot_booked` analytics. DELETE: unbook own (`booked_by_user_id = viewer`).
- Modify: `apps/web/src/lib/mentor/current.ts` — `CurrentMentor` gains `labName: string | null; hoursNote: string | null; slotMinutes: number;` and a `getMentorSlots(client, residencyId, viewerId)` returning `Array<{ id; startsAt; endsAt; state: 'open' | 'taken' | 'yours' }>` (taken = `booked_at` non-null; `yours` resolved via a service-role own-booking check in the API/page layer, since the identity column is grant-hidden)
- Create: `apps/web/src/components/mentor/mentor-residence-card.tsx` + `.test.tsx` — server component shell + client booking island: frame 9c anatomy — uppercase title `mentor.residenceTitle {period}` (period rendered via `time.month*` when the period parses as `YYYY-MM`, else raw), Avatar 38 + name + focus meta, facts grid `mentor.hoursLabel → hoursNote` / `mentor.hostLabel → labName`, primary `mentor.bookCta` opening a `Dialog` (`presentation='sheet'` on mobile) listing open slots (`eventDateParts` weekday+time labels) → pick → POST; booked state shows `mentor.yourBooking {when}` + `mentor.unbook`; footer `mentor.freeNote {minutes: slotMinutes}`; renders null with no active residency (existing quiet contract)
- Modify: `apps/web/src/lib/notifications/types.ts` (+`mentor_slot_booked`, channels `{inApp: true, email: false, push: false}`), `notification-settings.tsx` TYPE_LABELS, `present.ts` summary case (`notif.mentorSlotBooked {name, when}`), `apps/web/src/lib/analytics/events.ts` (+`mentor_slot_booked: Record<string, never>`)

- [ ] **Step 1: Failing tests** — `book/route.test.ts`: open slot books (update returns row), taken slot → 409 `mentor_slot_taken`, double-book same member → 409 `mentor_already_booked`, unauth 401; `mentor-residence-card.test.tsx` (jsdom SO): renders `Ballan qabso`, `Bilaash — Warshadda ayaa martigelisa. 20 daqiiqo qofkii.`, host lab name; null render without residency. Run → FAIL.
- [ ] **Step 2: Implement** routes + lib + card + notification type.
- [ ] **Step 3: Green** — `pnpm vitest run apps/web/src/app/api/mentor apps/web/src/components/mentor apps/web/src/lib/notifications` → PASS.

---

### Task 10: 9c assembly on Madal — rail + mobile-inline modules

**Files:**
- Create: `apps/web/src/components/plaza/community-rail.tsx`
- Modify: `apps/web/src/app/plaza/page.tsx`, `apps/web/src/components/plaza/plaza-feed.tsx`
- Modify: `apps/web/src/components/profile/suggested-follows.tsx` (compact module variant)
- Modify: `apps/web/src/app/globals.css` (append `.xidig-plaza-layout` block)

**Structure:** `plaza/page.tsx` wraps its existing children in
```tsx
<div className="xidig-plaza-layout">
  <div className="xidig-plaza-layout__main">{composer}{tabs}<PlazaFeed ... inlineModule={<CommunityRail placement="inline" />} /></div>
  <aside className="xidig-plaza-rail"><CommunityRail placement="rail" /></aside>
</div>
```
CSS (codsi-layout precedent, globals.css:5336-5365): mobile = single column, `.xidig-plaza-rail { display: none }`; `@media (min-width: 64rem)` → `grid-template-columns: minmax(0, 1fr) 306px; gap: 22px`, rail `position: sticky; top: var(--x-space)`, and `.xidig-plaza-inline` (the inline module wrapper `<li>`) hidden. `PlazaFeed` gains optional `inlineModule?: ReactNode`; renders it once as `<li className="xidig-plaza-inline" key="community-modules">` after the 2nd item (or last when fewer) inside the existing `items.map` list — never on the pinned strip.

`CommunityRail({ placement })` (server component): `<FollowSuggestionModule />` + `<MentorResidenceCard />`. `FollowSuggestionModule` = `SuggestedFollows` gains `variant?: 'grid' | 'module'` (default grid, zero visual change for existing surfaces): module variant renders the 9c card — uppercase `matching.suggestModuleTitle`, ONE suggestion (first), Avatar 34 + name + headline meta + `Raac` FollowButton (existing), reason paragraph = `matching.reasonsPrefix` + the person's `matching.reason*` chip strings joined by the existing chip row (reasons stay mandatory — component returns null for a suggestion with zero reasons, and the API already drops them) + `matching.privacyNote` footer line, Skip stays.

- [ ] **Step 1: Failing test** — extend `suggested-follows` coverage (create `suggested-follows-module.test.tsx`, jsdom SO): module variant renders `Kula talin`, the privacy note, and a reason chip; asserts a suggestion WITHOUT reasons is not rendered (mandatory-reason lock, HANDOFF acceptance). Run → FAIL.
- [ ] **Step 2: Implement** rail + inline slot + variant + CSS.
- [ ] **Step 3: Green** — `pnpm vitest run apps/web/src/components/profile/suggested-follows-module.test.tsx apps/web/src/components/plaza` → PASS.

---

### Task 11: Full gates + fidelity pass

- [ ] **Step 1:** `pnpm test` (full suite incl. embedded-postgres db suites, i18n coverage, vocabulary lock, globals-tokens, mascot-forbidden-surfaces) → ALL PASS.
- [ ] **Step 2:** `pnpm lint && pnpm typecheck && pnpm format:check` → PASS (run `pnpm format` on newly created files if needed).
- [ ] **Step 3:** Static fidelity check against the two frame files (scratchpad paths at top): every SO string in frames 9a/9b/9c/e1–e7 appears in `so.ts` (grep each); every mechanic row ticked: named RSVPs, exact capacity, atomic release trigger, one-tap cancel, past immutability (PATCH/DELETE 409 `event_ended`), ICS links, award provenance node, suggestion reason mandatory, mentor free-labelled, ruling-6 zero nav edits (`git diff --stat apps/web/src/components/nav/` must be empty).
- [ ] **Step 4:** Weight check: `pnpm --filter web weight` if the budget script exists in `apps/web/package.json` (it does — `weight`); confirm no budget regression (new routes are member-gated, front-door untouched).
- [ ] **Step 5:** Update the Flags section of this plan with anything discovered during implementation; the session's final report to Warya carries them.

---

## Flags — for the final report (do NOT silently resolve)

1. **Count-floor retirement (member surfaces).** Frames mandate exact counts ("kama badna, kama yara"); `RSVP_COUNT_FLOOR=5` was a locked 10-Jul design. Retired on member surfaces per HANDOFF "capacity honest (confirmed count)"; **kept on the signed-out public projection** (not covered by frames). Confirm or extend.
2. **`show_publicly` default flip → named-by-default RSVPs.** Frames teach names-visible ("RSVP waa ballan bulsheed"); the opt-out checkbox is preserved on the detail page (capability kept), and the `+N kale` remainder covers opted-out members. Confirm posture.
3. **"Caawiyaha Bisha" (monthly) vs quarterly award cycles.** `award_cycles` is locked to `YYYY-Q[1-4]`. Shipped `awards.resultTitle` = "{category} — {period}: {name}" (period = quarter label) instead of frame-verbatim "Caawiyaha **Bisha** — Luulyo". Needs a cadence ruling (monthly cycles migration vs copy stays quarterly).
4. **One post per category winner.** `award_cycles.results_post_id` is singular but the frame card is single-award anatomy; shipped one post per category winner (≤4/cycle), `results_post_id` = the most_helpful post. Confirm.
5. **Interested capability vs "one RSVP verb".** 9a shows one verb; `interested` exists (10 Jul). Kept: cards show the single verb, detail keeps a quiet Interested (ruling 1 never-cut). Confirm or drop `interested` product-wide.
6. **Award winners are not auto-badged** and winner gets no notification — no design mandate in 9c; publish creates posts only. Confirm follow-up.
7. **Reminder cadence now T-3d only** (was T-24h). e7 shows only the 3-day form. If both wanted, a second claim column is needed.
8. **Migration 20260812000000 unapplied on Dev** until Warya applies it (house rule, ruling 19): after this lands, `/events` list/detail 500 on Dev until applied (same class as Aniga's 20260811000000, which must be applied FIRST — file order). Loud failure chosen over silent fallback, per precedent.
9. **Suggestion reason presentation**: frame shows a composed prose sentence ("waxaad wadaagtaan Warshadda X iyo xirfadda 'Y'"); shipped `Sababta:` + existing reason-chip strings (word-order-safe i18n; facts identical). Design-side blessing wanted.
10. **`/api/cron/events` still externally scheduled** (Hobby plan, ce37538) — the 3-day window widens tolerance to scheduler jitter, no action needed, but the external job must keep running.

## Flags discovered during implementation (consolidated 12 Aug — additions to the list above)

11. **Interested count renders nowhere on the rebuilt detail** (frames drop it; the Interested action itself is preserved). Host loses pre-start sight of interested names. Task 6 adjudication: display decision, not cut capability — confirm.
12. **Mod check-in asymmetry** (from the plan's own brief): mods can POST check-ins but `view.checkin` is host-only, so mod check-in is unusable without out-of-band ids. Pick an audience.
13. **Cancelled-notice date rides `updated_at`** — frozen within the events API, but a later moderation write to the row would drift it. Consider a dedicated `cancelled_at` column later.
14. **Reminder row goes stale after inline "Ka noqo RSVP"** — the payload is a send-time snapshot; the row keeps saying "waad xaqiijisay" with no success feedback. Needs a product call (toast key or payload refresh).
15. **`mentor_slots` has no timezone column** — all slot display/notification text is fixed UTC (internally consistent; admin intent may shift). Schema follow-up + `MENTOR_SLOT_TIMEZONE` constant dedup.
16. **`admin/mentor` multi-step write is non-atomic** (residency→slots→grant→badge→audit; pre-existing pattern, one step added). Wrap in an RPC/transaction or add a distinguishable error, as a fast-follow.
17. **Award cards have no overflow menu** (frame-faithful) → unreportable/unbookmarkable/unmutable from the card. Every member-authored string on it is reportable at its source; still a policy call.
18. **9c module costs**: rail+inline both render (CSS-gated per the mockup's platform split), so the mentor/suggestion server queries run twice per /plaza load and the suggestions API is fetched twice. Acceptable at alpha; cache()/dedupe is the lever if it shows up in traces.
19. **Raac button tone**: FollowButton renders primary; frame shows secondary. Size compacted via scoped CSS; tone follows the existing component. Design-side blessing wanted.
20. **Suggestion meta line lacks the frame's headline** ("Naqshadeeye product · Nairobi") — the API carries no headline field; `profiles.headline` is ruling 23 and ships with the Aniga schema work. Wire it then.
21. **Plaza rail `<aside>` unlabeled** — needs one `plaza.railLabel`-style key (dictionaries were closed for Task 10). One-liner with the next dictionary touch.
22. **`result-rows.test.tsx` (other session's uncommitted search work) fails on a stale date fixture** — the ONLY red test in the full suite. Not touched per the shared-worktree convention; Warya or the owning session should refresh the fixture.
23. **Repo-wide `pnpm format:check` fails on ~1249 files** — pre-existing (other sessions' untracked files and artifacts). Every file this dispatch created or edited is prettier-clean.

## Self-review checklist (ran at plan time)
- Spec coverage: 9a (T5), 9b (T6), 9c (T8/T9/T10), e1 (T5 loading), e2 (T5 empty), e3 (T5 queue+notice), e4 (MediaSlot everywhere — T3/T5/T6), e5 (T4 trigger + T5 card), e6 (T5 variant + T6 notice), e7 (T4 payload + T7 row); mechanics: first-class object (exists), host member-or-Warshad (host line + host card), named RSVPs (T4/T5/T6), honest capacity + disabled + release rule (T1 trigger, T4, T5), no waitlist (copy only, no mechanism built), one-tap cancel atomic release (row delete + trigger serialization), past immutable (T4 guards), ICS (exists + card link), award auto-post + provenance + vote-earned orange (T8), follow suggestions + mandatory reasons (T10), mentor-in-residence Warshad-hosted bookable free (T9), ruling-6 navigation (zero nav edits, e2 teaches, e7 reminds).
- No placeholders: every task carries code or an exact repo-pattern line-reference.
- Type consistency: `EventCardItem`/`EventsTab` (T4→T5), `AwardPostView` (T8 internal), `BundleExtras` (T7), `CurrentMentor` extensions (T9) — names checked once here.
