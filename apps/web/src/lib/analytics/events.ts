import type { Enums } from '@xidig/db';

/**
 * Analytics event taxonomy (PRD §23).
 *
 * One typed registry for every tracked event. Two hard rules the PRD sets:
 *
 *   1. **Names are the contract** — dashboards map 1:1 to §4 metrics, so an
 *      event name never drifts once shipped. They live here as the single
 *      source of truth; server and client both emit through these types.
 *   2. **No PII in payloads** (§23). Property types below only ever carry
 *      enums, counts, booleans, taxonomy slugs, and entity UUIDs — never a
 *      name, handle, email, phone, coordinate, or free text. The server
 *      capture path additionally enforces this at runtime (defense in depth,
 *      and the real guard for the client-ingest route).
 *
 * This file is the Phase 1 subset (Auth/Profiles/Directory/Map + the
 * platform events those flows fire). Later phases extend `AnalyticsEventMap`;
 * because it is a closed map, an un-typed event name is a compile error.
 */

/** The only value shapes a property may hold — keeps payloads PII-free by construction. */
export type AnalyticsScalar = string | number | boolean | null;

/** Sign-in method a signup completed with (§26 three co-equal methods). */
export type SignupMethod = 'password' | 'magic_link' | 'sms_otp';

/**
 * event name → property shape. Every Phase 1 event; `Record<string, never>`
 * means "no properties" (the event itself is the signal).
 */
export interface AnalyticsEventMap {
  // --- Activation (§23) ---------------------------------------------------
  signup_completed: { method: SignupMethod; invited: boolean; founding_member: boolean };
  low_bandwidth_prompt_shown: { reason: 'connection' | 'region' };
  low_bandwidth_prompt_dismissed: Record<string, never>;
  profile_completed: { has_location: boolean; skills_count: number; lanes_count: number };
  lane_selected: { lane: string };
  verification_started: { type: Enums<'verification_type'> };
  verification_completed: { type: Enums<'verification_type'>; outcome: 'approved' | 'rejected' };

  // --- Plaza (§23) --------------------------------------------------------
  post_created: { type: Enums<'post_type'> };
  comment_created: { on: 'post' | 'candidate' };
  // Ask closed by its asker: credited = an answer was credited (helper paid),
  // false = closed without crediting.
  ask_resolved: { credited: boolean };
  report_submitted: { target_type: Enums<'entity_type'>; reason: Enums<'report_reason'> };
  report_resolved: { action: string };

  // --- Social (§23) -------------------------------------------------------
  follow_created: { target_type: Enums<'follow_target_type'> };
  dm_request_sent: Record<string, never>;
  dm_sent: Record<string, never>;
  // Where the @mention was authored (a taxonomy slug, never the handle).
  mention_sent: { source: 'post' | 'comment' | 'message' };

  // --- Labs (§23) ---------------------------------------------------------
  lab_created: { mode: Enums<'space_mode'> };
  lab_joined: Record<string, never>;
  lab_update_published: Record<string, never>;
  lab_marked_dormant: Record<string, never>;
  lab_revived: Record<string, never>;

  // --- Capital (§23) ------------------------------------------------------
  candidate_submitted: Record<string, never>;
  candidate_reviewed: Record<string, never>;
  // interest_expressed by type (help / cosign / invest) + where it was placed.
  interest_expressed: { type: Enums<'interest_type'>; scope: 'candidate' | 'fund' };
  venture_timeline_viewed: Record<string, never>;

  // --- Community (§23) ----------------------------------------------------
  lab_collaboration_created: Record<string, never>;
  skills_gap_alert_sent: { skill: string };
  skills_gap_alert_clicked: { skill: string };
  mentor_ask_answered: Record<string, never>;
  reaction_added: { type: Enums<'reaction_type'> };
  governance_log_viewed: Record<string, never>;

  // --- Directory / Map (§23) ---------------------------------------------
  listing_created: { category: string; has_coordinates: boolean };
  listing_claimed: Record<string, never>;
  map_view: Record<string, never>;
  listing_view: { listing_id: string };
  contact_click: { listing_id: string; channel: string };

  // --- Platform (§23) -----------------------------------------------------
  badge_awarded: { badge: string };
  low_bandwidth_enabled: { enabled: boolean };
  language_switched: { language: Enums<'language_code'> };
  invite_sent: Record<string, never>;
  invite_accepted: Record<string, never>;

  // --- Phase 4.5 experience expansion (§23, spec §5) ----------------------
  // Social: bookmarks + mutes carry only the entity type (a taxonomy slug).
  bookmark_added: { entity_type: 'post' | 'listing' | 'lab' | 'candidate' };
  bookmark_removed: { entity_type: 'post' | 'listing' | 'lab' | 'candidate' };
  mute_added: { entity_type: 'user' | 'tag' | 'lab' };
  post_edited: Record<string, never>;
  draft_saved: Record<string, never>;
  // Profile / listings media identity.
  avatar_updated: { has_avatar: boolean };
  listing_photos_updated: { count: number };
  // Settings — coarse, PII-free section slug (privacy | notifications |
  // appearance | data | general | notifications).
  settings_updated: { section: string };
  // Data export request (no payload — the request itself is the signal).
  data_export_requested: Record<string, never>;
  // Discovery search — result count only; the query text is PII and never
  // leaves the server handler.
  search_performed: { result_count: number };
  // Lite "Show" taps — which media category the member chose to load.
  media_revealed: { kind: 'image' | 'embed' | 'map' };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

/** A concrete event: its name paired with its exact property shape. */
export type AnalyticsEvent = {
  [K in AnalyticsEventName]: {
    name: K;
    properties: AnalyticsEventMap[K];
  };
}[AnalyticsEventName];

/** Constructor helper so callers get inference + the closed-name check. */
export function event<K extends AnalyticsEventName>(
  name: K,
  properties: AnalyticsEventMap[K],
): AnalyticsEvent {
  return { name, properties } as AnalyticsEvent;
}

/**
 * Events a browser may originate directly. Everything else is server-emitted
 * (the server owns the ground truth — a client cannot forge `signup_completed`
 * or `badge_awarded`). The ingest route (`/api/analytics`) accepts only these.
 */
export const CLIENT_EVENT_NAMES = [
  'map_view',
  'listing_view',
  'contact_click',
  'low_bandwidth_enabled',
  'language_switched',
  // Phase 4.5: Lite "Show" taps fire client-side; search_performed is emitted
  // server-side today but spec §5 lists it client-originated — keep it here so
  // the ingest route accepts it if a future client path emits it directly.
  'media_revealed',
  'search_performed',
  // Phase 7: view/click + reaction + lite-prompt events that genuinely originate
  // in the browser (no server route owns them). reaction_added fires client-side
  // because reactions are written via a direct column-scoped PostgREST insert,
  // not an API route.
  'reaction_added',
  'venture_timeline_viewed',
  'governance_log_viewed',
  'skills_gap_alert_clicked',
  'low_bandwidth_prompt_shown',
  'low_bandwidth_prompt_dismissed',
] as const;

export type ClientAnalyticsEventName = (typeof CLIENT_EVENT_NAMES)[number];

export type ClientAnalyticsEvent = Extract<AnalyticsEvent, { name: ClientAnalyticsEventName }>;

export function isClientEventName(value: string): value is ClientAnalyticsEventName {
  return (CLIENT_EVENT_NAMES as readonly string[]).includes(value);
}
