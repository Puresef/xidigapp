import { env } from '@/env';

import type { AnalyticsEvent, AnalyticsScalar } from './events';

/**
 * Server-side analytics capture (PRD §23 — PostHog, EU/self-hosted, no PII).
 *
 * Plain fetch against the PostHog capture API — no SDK dependency, same
 * philosophy as lib/rate-limit.ts. Every emission is:
 *   * **PII-guarded** — property keys are checked against a denylist and
 *     values sniffed for email/phone shapes. A leak is a bug: it throws in
 *     dev/test (caught early) and strips + warns in production (never ships a
 *     PII payload, never takes the request down).
 *   * **Fail-safe** — a capture failure (network, PostHog down) is swallowed.
 *     Analytics must never break a user request.
 *   * **Disabled cleanly** when POSTHOG_KEY is unset (tests, local dev with no
 *     analytics) — no network call, but the PII guard still runs.
 *
 * Server-only: imports validated server env. Never import from a client
 * component — use lib/analytics/client.ts (which posts to /api/analytics).
 */

const POSTHOG_KEY = env.POSTHOG_KEY;
const POSTHOG_HOST = env.POSTHOG_HOST;
// typeof guard: under SKIP_ENV_VALIDATION (build/tests) values may be
// undefined — module load must not crash.
const enabled = typeof POSTHOG_KEY === 'string' && POSTHOG_KEY.length > 0;

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Property keys that must never appear in an analytics payload (§23). Exact
 * matches plus a few substrings for the unambiguous ones — deliberately NOT
 * broad substrings like "name" (would trip `business_name`-style booleans
 * such as `has_coordinates`).
 */
const DENIED_KEYS = new Set<string>([
  'email',
  'phone',
  'name',
  'display_name',
  'first_name',
  'last_name',
  'full_name',
  'handle',
  'username',
  'bio',
  'password',
  'secret',
  'token',
  'api_key',
  'address',
  'ip',
  'ip_address',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'coordinates',
  'geo',
]);

/** Substring patterns that are always PII-bearing regardless of surrounding text. */
const DENIED_KEY_PATTERNS = [/email/i, /password/i, /secret/i, /token/i, /phone/i];

/** Obvious email-shaped value — a last-ditch catch for free text sneaking in. */
const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function keyIsDenied(key: string): boolean {
  const normalized = key.toLowerCase();
  if (DENIED_KEYS.has(normalized)) return true;
  return DENIED_KEY_PATTERNS.some((re) => re.test(normalized));
}

export interface SanitizeResult {
  safe: Record<string, AnalyticsScalar>;
  dropped: string[];
}

/**
 * Split properties into the safe set and the keys that were rejected as PII.
 * Pure — the policy (throw vs strip) lives in the caller.
 */
export function sanitizeProperties(properties: Record<string, unknown>): SanitizeResult {
  const safe: Record<string, AnalyticsScalar> = {};
  const dropped: string[] = [];

  for (const [key, value] of Object.entries(properties)) {
    if (keyIsDenied(key)) {
      dropped.push(key);
      continue;
    }
    if (typeof value === 'string' && EMAIL_VALUE.test(value)) {
      dropped.push(key);
      continue;
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      safe[key] = value;
    } else {
      // Objects/arrays aren't part of the taxonomy and could hide PII — drop.
      dropped.push(key);
    }
  }

  return { safe, dropped };
}

/**
 * Enforce the no-PII rule. Dev/test: a rejected key is a programming error —
 * throw so it's caught before it ever ships. Production: strip + warn.
 */
function guardProperties(properties: Record<string, unknown>): Record<string, AnalyticsScalar> {
  const { safe, dropped } = sanitizeProperties(properties);
  if (dropped.length > 0) {
    const message = `[analytics] refused PII-bearing propert${
      dropped.length === 1 ? 'y' : 'ies'
    }: ${dropped.join(', ')}`;
    if (!isProduction) throw new Error(message);
    console.warn(message);
  }
  return safe;
}

export interface CapturePayload {
  api_key: string;
  event: string;
  distinct_id: string;
  properties: Record<string, AnalyticsScalar>;
  timestamp: string;
}

/** Build the PostHog capture body (pure — extracted for testable shape). */
export function buildCapturePayload(
  event: AnalyticsEvent,
  distinctId: string,
  timestamp: string,
  properties: Record<string, AnalyticsScalar>,
): CapturePayload {
  return {
    api_key: POSTHOG_KEY as string,
    event: event.name,
    distinct_id: distinctId,
    properties: { ...properties, $lib: 'xidig-server' },
    timestamp,
  };
}

export interface CaptureOptions {
  /** PostHog distinct_id — the acting user's UUID, or an anonymous id. */
  distinctId: string;
  /** ISO timestamp; defaults to now. */
  timestamp?: string;
}

/**
 * Capture one event. Awaitable, but never throws in production and never
 * blocks meaningfully (2s timeout, errors swallowed). The PII guard runs
 * before the enabled check so misuse is caught even with analytics off.
 */
export async function captureServer(event: AnalyticsEvent, options: CaptureOptions): Promise<void> {
  const safe = guardProperties(event.properties);
  if (!enabled) return;

  const timestamp = options.timestamp ?? new Date().toISOString();
  const body = buildCapturePayload(event, options.distinctId, timestamp, safe);

  try {
    await fetch(`${POSTHOG_HOST.replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Analytics is best-effort — a failed capture must not surface to the user.
  }
}

/** Resolve a distinct_id: the signed-in user, else a supplied anon id, else 'anonymous'. */
export function distinctIdFor(
  userId: string | null | undefined,
  anonymousId?: string | null,
): string {
  return userId ?? anonymousId ?? 'anonymous';
}
