# Aniga modules (v3)

The member profile below the bio is a **registry of named modules** the owner orders and
toggles. This doc records the shapes, the two rules that are enforced rather than trusted,
and why this is not `page_blocks`.

Design source: Claude Design project `c4df5944…`, `Aniga Profile.dc.html` frames 10a–10e
(v3 module system), 8a–8b (content modules), 5a–5d (baseline), `Aniga States.dc.html`
(a1–a5 page states, v1–v7 module states). Rulings 7, 10, 23 of `DECISIONS-2026-08-06.md`.
Schema: `packages/db/supabase/migrations/20260811000000_aniga_v3.sql`.

## The shape

`profile_module_kinds` is the vocabulary (a lookup, not an enum — modules are an
extensible taxonomy, same reasoning as lanes and membership tiers). It carries each
module's default slot, default visibility, and an optional `requires_flag`.

`profile_modules` holds per-member overrides. **A member with no rows renders the
defaults**, which is exactly what the profile rendered before this migration — so nothing
had to be backfilled and nothing broke.

The eight modules, in default order:

| id            | Somali label           | Source of truth                          |
| ------------- | ---------------------- | ---------------------------------------- |
| `showcase`    | Bandhig                | `profile_showcase` (new, cap 5)          |
| `skills`      | Xirfadaha              | `profiles.skills` + `skill_endorsements` |
| `links`       | Bogagga dibadda        | `profiles.links` + `profile_link_meta`   |
| `looking_for` | Waxaan raadinayaa      | `profile_open_to` + the matcher          |
| `spaces`      | Warshadaha aan doortay | `profile_pins` (existing, cap 3)         |
| `helper`      | Caawimo                | asker-credited resolved Codsiyo          |
| `suuq`        | Suuq                   | `business_listings`                      |
| `metrics`     | Tirakoobka             | flag-gated, see below                    |

## Two rules that are enforced, not trusted

**A hidden module is absent, not dimmed.** The visitor projection
(`publishedModules()` in `apps/web/src/lib/aniga/modules.ts`) drops non-visible modules
from the array before render, and the renderer maps over that array. There is no node to
inspect, no class to un-hide, no payload to sniff. It is a structural test, not a style —
which is the whole reason the design asked for absence rather than a `hidden` attribute.

**A flag-gated module cannot be talked into visibility.** `metrics` is built and globally
OFF (ruling 7: capability exists, strategy decides — the Maal-capital pattern). The flag is
a _platform_ decision, so the owner toggle is **rejected**, not merely hidden:

- `feature_flags` is RLS-on with **zero policies**; nobody reads the table. Reads go
  through `is_feature_enabled(key)`, a SECURITY DEFINER function that returns a boolean and
  never the roster.
- The `profile_modules_flag_guard` trigger raises `module_flag_disabled` on any insert or
  update that sets `visible = true` on a module whose flag is off. That makes the rule
  survive every API path, present and future — including one written by someone who never
  read this doc.
- The API checks the flag first so the member gets a clean 409 rather than a raw trigger
  error; the trigger is the backstop, not the primary path.

The owner still _sees_ the metrics row in the module manager — visible but locked, with a
`Damsan` chip. That is deliberate (endorsed 9 Aug): a locked row unlocking later reads as
system truth, where a feature silently appearing reads as a mystery. **The copy must stay
plain system state — "off, platform decision". Never "coming soon", never promotional.**

## Why this is not `page_blocks`

`page_blocks` / `block_types` (shipped in `20260706300000_experience_expansion.sql`,
contract in [page-blocks.md](page-blocks.md)) is a _generic block-layout_ system: arbitrary
member-authored content blocks (`text`, `image`, `gallery`, `embed`, …) with position,
span, and a `config` jsonb, on its own v1.0.x renderer / v1.1 editor rollout.

Aniga modules are a _fixed vocabulary of named product surfaces_. Each one has bespoke
data, bespoke states, and rules of its own (`metrics` has a platform flag; `showcase` has a
media cap; `helper` may only show asker-credited resolutions). Expressing them as
`page_blocks` rows would mean either inventing a `block_type` per module — at which point
the "generic" system is carrying eight special cases — or hiding module identity inside
`config`, where no constraint or trigger can reach it. The flag guard above is the concrete
example: it is a trigger on a typed `module_id` column, and it has nowhere to attach in a
jsonb blob.

The two are expected to coexist: modules order the product surfaces; `page_blocks` will
eventually let a member add free-form content _between_ them.

## Related caps, deliberately different

`profile_pins` stays at **3** (PRD §20 pinned content — Labs, posts, or Wins, list
presentation). `profile_showcase` allows **5** (Bandhig — a media grid, tiles carrying a
source-kind chip, 3-up on mobile and 4-up on desktop). Sharing one table would force one
cap on two features the design draws differently.

The 5 is a ruling (11 Aug), and the reasoning is worth keeping because the frames invite
the wrong answer: frames 10a/10c show a six-cell grid, but the sixth cell is the owner's
`+ Ku dar` tile — **UI chrome, not stored content**. Counting it would have capped the
member at six saved items and let a full grid swallow its own add affordance.

## The Xogta card — designed 11 Aug, ships owner-only

Frame 10d draws a visitor rail card titled **Xogta** holding Goobta / Luqadaha / Xubin tan
iyo. Designed as three competing approaches and judged on fairness, information
architecture and Somali register. All three lenses independently reached the same answer:

**There is no visitor Xogta card.** Every fact 10d draws is already rendered, unrenderable,
or both:

| Frame row     | Verdict               | Why                                                                                                                                                                                                                 |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xubin tan iyo | **cut**               | already renders for every viewer in `.xidig-profile__counts`; a second copy is padding, and `visitor-no-counts.test.tsx` locks that row to one child                                                                |
| Goobta        | **cut from the card** | already renders for every viewer as the header subtitle (`place` → `profile.headlineCity`). A second render site is a second place the privacy fold can be got wrong — one site is a privacy property, not tidiness |
| Luqadaha      | **dropped**           | no languages column exists anywhere. See below                                                                                                                                                                      |
| Lanes         | **owner-only**        | unchanged from the standing ruling                                                                                                                                                                                  |

What survives is an **owner** card: the two facts that decide how a member gets found and
that the owner structurally cannot see any other way.

### Content model (owner rail only)

1. **Waddooyinka** — the member's lanes, resolved through `lanes.name_so` / `name_en`.
   Today the read path renders raw slugs, so an owner is shown `halal-finance` rather than
   _Maaliyad xalaal_; the label columns have existed since `20260718100000` and nothing has
   ever used them.
2. **The location mirror — a sentence, and only when the fold bites.**
   `getMemberProfileView` deliberately skips `applyLocationGranularity` for owners (a
   setting must never hide a member's data from themselves), so a member who chose `hidden`
   at onboarding reads their real city on their own page forever and never learns nobody
   local can find them. This card closes that.

   There is deliberately **no location label-value row**. It would be redundant in every
   state the fold can be in: unfolded it repeats the header subtitle verbatim, `region`
   repeats the note directly below it (_"Goobta: UK"_ over _"Visitors see UK only"_), and
   `hidden` leaves nothing to print. The mirror is worth saying only where it **diverges**
   from what the member typed — and there it is a sentence, not a label and a value.

3. One note line naming lanes as a discovery filter, not an achievement.

The card renders only if there is something to say (`lanes.length > 0 || fold ≠ exact`).
Zero rows → no `<section>`, matching `publishedModules()` and `AnigaPrivateStats`.

### Self-declared facts render as `<dl>`, never as chips

This is the load-bearing detail, and it corrects something already shipped. In this product
a `.xidig-tag` pill _is_ the typography of attested evidence — endorsement counts, badges,
verification, Garab tiers. Rendering a ticked-checkbox lane in the same pill as a `×23`
endorsement chip quietly tells the reader a stranger vouched for it. Worse, the two sit as
adjacent siblings in identical markup on the owner's page today (reputation chips, then the
lane chip row).

So self-declared facts get `<dl>` / `<dt>` / `<dd>` with the label above the value. The
demotion _is_ the epistemic signal, it costs no new token or hue, and it fixes a real
accessibility defect on the way: the shipped lane chips carry no label association at all.

### Visitor vs owner

|                     | Owner                         | Visitor (member)        | Visitor (anon) |
| ------------------- | ----------------------------- | ----------------------- | -------------- |
| Xogta card          | yes                           | **absent from the DOM** | absent         |
| Lanes               | yes, labelled                 | no                      | no             |
| Location fold state | disclosed                     | **never**               | never          |
| Rail contents       | manager, Xogta, private stats | report link only        | empty          |

`hidden` and _never entered_ must be **byte-identical in a visitor's DOM**. The fold state
is itself an unpublished fact: a visitor who can tell the difference has learned that this
member deliberately hid something, which is exactly what hiding was for.

Data shape: `AnigaView.ownerFacts` is `null` for every non-owner, so the visitor payload
cannot carry it and there is no node to un-hide — the same discipline as `privateStats`.

### Copy

| Key                                        | English                                                                               | Somali                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `profile.factsTitle` _(exists)_            | Details                                                                               | Xogta                                                                             |
| `profile.lanesLabel` _(exists)_            | Lanes                                                                                 | Waddooyinka                                                                       |
| `profile.factsFoldRegion` _(new)_          | Visitors see {place} only.                                                            | Booqdayaashu waxay arkaan {place} oo keliya.                                      |
| `profile.factsFoldHidden` _(new)_          | Your location is hidden from visitors.                                                | Goobtaada booqdayaasha lagama muujiyo.                                            |
| `profile.factsLanesNote` _(new)_           | Lanes are how members find you in the directory — they are not shown on your profile. | Waddooyinku waa sida xubnuhu kuugu helaan tusmada — profile-kaaga lagama muujiyo. |
| `profile.reportProfile` _(exists, unused)_ | Report this profile                                                                   | Ka warbixi profile-kan                                                            |

`oo keliya` matches `settings.locationCity` / `settings.locationRegion` verbatim — the very
screen that owns `location_granularity`, so the card and the setting speak in one voice.
`Booqdayaashu` matches `profile.managerNote`. Nothing here is calqued or invented.

**Delete `profile.factLanguages` and `profile.factMemberSince`** (both currently unused).
A dictionary key is an invitation: `factLanguages` invites someone to wire
`users.preferred_language` into a public claim, and `factMemberSince` invites the duplicate
tenure row. Deleting a key is a cheaper and more durable guard than a comment asking people
not to.

> Open, minor: `profile.lanesLabel` SO is **Waddooyinka** — a literal calque of English
> "lanes" (roads), while `profile.lanesHint` reads _"Qaybaha aad wax ka dhisto"_ (the
> sectors you build in). `Qaybaha` is probably the truer label. Not changed here: it is
> shipped copy and a vocabulary decision, not a card decision.

### The report link stays outside the card

It is a safety affordance and outranks visual completeness, so it does not become a row in
a facts table. But it must carry `profile.reportProfile`, not the generic `action.report`:
under this design a signed-in stranger's rail contains exactly one element, and an
unlabelled flag icon alone in a column is worse than the status quo it replaces.

### Languages: dropped, with the ruling that matters preserved

There is no languages column. `users.preferred_language` is a `language_code` enum of
exactly `'en' | 'so'` — it cannot even represent _Carabi_, the literal example the frames
draw. It answers "which language should the app render in for me", not "which languages can
I help you in". Publishing it under a **Luqadaha** label would fabricate an attestation the
member never made, on a page read by people deciding whether this member can serve them.

If it is ever built, the shape is: a seeded `languages` lookup mirroring
`20260718100000`, a `profile_languages(user_id, language_code, position)` join rather than
another unconstrained `text[]`, cap 5, no backfill ever, **Af-Maay as its own seeded row**,
and copy _"Luqadaha aad ku caawin karto"_ with the hint _"Ma aha luqadda barnaamijka — waa
luqadaha aad dadka kula hadli karto."_

**And the constraint that must survive regardless of which card ships:** in the Somali
context language maps onto region and clan — Af-Maay / Af-Maxaa most sharply. Displaying a
language is context; letting Suuq **filter** on it is a clan filter with a friendly label.
Display may ship without filtering. Filtering needs its own explicit ruling, and should
never reach the anon projection where it could be scraped into a list.

## Known incomplete: the Suuq verified-customer testimonial

The Suuq module ships **partial**. Frame 8b draws a `Markhaati xubneed` block — a customer
quote attributed to a named member, with the acceptance rule that _the testimonial requires
a resolvable customer link_. **There is no testimonial table in this schema**, and no column
anywhere that ties a quote to a customer identity.

The projection therefore sets `testimonial: null` and the block does not render. That
satisfies the acceptance rule honestly — no resolvable customer link, no testimonial — but
it satisfies it by having nothing rather than by checking something. Ruled 11 Aug: do not
invent a table, do not fake the content.

**Follow-up data-model requirement** (not scheduled here):

- a testimonial record joining `business_listings` → the customer's `users.id`, with the
  quote text and a timestamp;
- a resolvability rule — the customer must be a real, readable member, so a deleted or
  blocked account collapses the testimonial rather than orphaning a quote;
- provenance strong enough to carry the `macmiil la xaqiijiyay` claim: the badge asserts
  _verified customer_, which needs evidence of the transaction, not merely a member who
  agreed to say something nice. Without that, the block is a review — and reviews are a
  locked non-goal (PRD §12: Suuq is Directory + Map, not a marketplace).

That last point is why this is worth pausing on rather than rushing: the shortest path to
shipping the block is also the path that quietly turns Suuq into a review site.

## Where the orange decision lives

`badge_definitions.badge_class` (`identity` | `earned` | `tenure` | `role`) moves the
orange/neutral call out of the view layer. The chip asks the badge what class it is; it
never pattern-matches a slug. `role` is the class that must never render orange (ruling
10a) — encoding it in data means a _new_ role badge is neutral by default rather than
neutral by someone remembering.

`user_badges.reputation_event_id` records the moment that earned the badge, and
`award_badge()` refuses to grant an `earned`-class badge without one. No event, no badge.
