# Consent capture (§12)

The UI + API that finally lets `hasAnalyticsConsent()` return true for
someone. Everything below ships fail-closed: no choice (or any error) means
nothing optional runs.

## Categories

| Category | Covers | Basis |
|---|---|---|
| **Essential** | Session/auth cookies, security, preference cookies (locale, theme, Lite), **basic Sentry error capture** | Strictly necessary — always on, never a `consent_records` row |
| **`analytics`** | PostHog product analytics (§23 taxonomy) | Opt-in consent, Art. 6(1)(a) |
| **`error_monitoring`** *(new, `20260709210000_consent_capture.sql`)* | Sentry session replay + performance-trace extras | Opt-in consent — replay records screen interactions, so it is not essential |

Client note: today the browser gates **replay** on `error_monitoring`
(`instrumentation-client.ts`); baseline `tracesSampleRate` (0.1) remains part
of essential operation. If a stricter reading is wanted later, gate the
browser trace rate on the same cookie flag — one-line change, flagged as debt
below.

## Storage model

Two stores, DB authoritative:

1. **`consent_records`** (the legal record). Grant = active row
   (`withdrawn_at IS NULL`), decline = **absence** of a row, withdrawal =
   `withdrawn_at` set, re-grant / new version = new row. Partial unique index
   keeps at most one active row per (user, type). Server-side capture
   (`lib/analytics/consent.ts`) reads ONLY this — fail-closed, unversioned.
2. **`xidig_consent` cookie** — `v=<CONSENT_VERSION>&a=<0|1>&e=<0|1>`,
   1-year max-age, `SameSite=Lax`, deliberately **not** `httpOnly`: it is the
   render fast path (no DB read per layout render once a choice exists) and
   the only signal the browser bundle may read (Sentry replay gate). It is
   set exclusively by `POST /api/me/consent`, which writes the rows first —
   a hand-edited cookie can only mislead its own browser about its own
   choice; server capture stays row-gated regardless.

Code map: `apps/web/src/lib/consent/model.ts` (version, codec, pure
decision), `server.ts` (`getConsentChoice` — cookie fast path → records
fallback → fail-closed on error: no banner, nothing granted),
`app/api/me/consent/route.ts` (write + cookie),
`components/consent/consent-banner.tsx` (Accept / Reject / Manage — equally
prominent) and `consent-preferences.tsx` (Settings › Data, withdraw any
time), mounted in `app/layout.tsx` (signed-in branch only).

Known trade-off: a decline leaves no rows (schema design), so a member who
rejected everything is re-prompted on a cookie-less device. Grants are not —
their rows answer.

## Version bump flow

`CONSENT_VERSION` (model.ts) stamps every cookie and row. Bumping it:

- Banner **re-appears** for everyone (no cookie and no active row at the new
  version ⇒ `needsPrompt`).
- Existing grants **stay honored** until re-answered — `hasAnalyticsConsent`
  and the replay cookie gate are deliberately unversioned, so a copy-tweak
  bump doesn't silence analytics for consented members.
- A bump that **must** invalidate old consent (material scope change) ships a
  migration that withdraws the old-version rows, e.g.
  `update consent_records set withdrawn_at = now() where consent_type in
  ('analytics','error_monitoring') and version < '<new>' and withdrawn_at is
  null;` — capture then stops immediately (rows gone) and the banner
  re-collects.

## Why signed-out visitors see no banner

The front door deliberately processes **nothing optional** for anonymous
visitors: no PostHog, no replay (session-cookie gate), no optional
identifiers; anonymous events are dropped server-side at `/api/analytics`.
A cookie banner exists to ask permission for optional processing — where
none happens, a banner would be noise (and a dark pattern magnet). Essential
cookies (locale/theme/Lite prefs, security) don't require consent; the
Privacy/Cookie pages disclose them. The banner therefore targets exactly the
population whose consent changes anything: signed-in members without a
current-version choice.

## Launch-metrics unblock list (§23)

`POSTHOG_KEY` absent ⇒ the whole pipeline stays dark regardless of consent.
With the key set, events fire **per-member after that member consents**:

- **Fires after consent** — everything in `AnalyticsEventMap`
  (`lib/analytics/events.ts`) except the three below: activation
  (`profile_completed`, `lane_selected`, `verification_*`,
  `low_bandwidth_*`), Plaza (`post_created`, `comment_created`,
  `ask_resolved`, `report_*`), social (`follow_created`, `dm_*`,
  `mention_sent`), Labs (`lab_created/joined/update_published/
  marked_dormant`, `lab_collaboration_created`), Capital
  (`candidate_*`, `interest_expressed`, `venture_timeline_viewed`),
  community (`skills_gap_alert_*`, `mentor_ask_answered`, `reaction_added`,
  `governance_log_viewed`), directory/map (`listing_*`, `map_view`,
  `contact_click`), platform (`badge_awarded`, `language_switched`,
  `invite_sent`, `settings_updated`, `search_performed`, `media_revealed`,
  bookmarks/mutes/drafts), and the Phase-8 external-API/seed/digest events.
- **Structurally can't fire** (Phase 7 finding — wiring, not consent; do NOT
  fake them): `signup_completed`, `invite_accepted`, `lab_revived`. Consent
  capture does not unblock these.

## Debt / open items

- 👤 **Legal**: the Privacy Policy the banner links to (`/privacy`) is a
  draft pending legal review; banner copy should get the same pass.
- 👤 Native Somali review of the `consent.*` keys (plain-register drafts).
- 🖥️ Browser `tracesSampleRate` is treated as essential, not gated on
  `error_monitoring` — revisit if legal review wants it opt-in.
- Replay starts only on a page load after consent (the cookie is read at
  init) — acceptable; no live toggle.
- The stale sentence in `lib/analytics/consent.ts` ("Until the
  consent-capture UI ships…") is now historical; harmless, owned by another
  surface.
