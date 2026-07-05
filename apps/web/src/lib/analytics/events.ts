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
  profile_completed: { has_location: boolean; skills_count: number; lanes_count: number };
  lane_selected: { lane: string };
  verification_started: { type: Enums<'verification_type'> };
  verification_completed: { type: Enums<'verification_type'>; outcome: 'approved' | 'rejected' };

  // --- Social (§23) -------------------------------------------------------
  follow_created: { target_type: Enums<'follow_target_type'> };

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
] as const;

export type ClientAnalyticsEventName = (typeof CLIENT_EVENT_NAMES)[number];

export type ClientAnalyticsEvent = Extract<AnalyticsEvent, { name: ClientAnalyticsEventName }>;

export function isClientEventName(value: string): value is ClientAnalyticsEventName {
  return (CLIENT_EVENT_NAMES as readonly string[]).includes(value);
}
