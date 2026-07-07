import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, type NotificationType } from './types';

/**
 * Per-member notification preferences (§26 matrix, Phase 4.5).
 *
 * `notification_prefs` rows are OVERRIDES of the default matrix below —
 * absent row = default. The default matrix derives from the §26 channel
 * registry (lib/notifications/types.ts) so capability and default never
 * drift: a channel a type cannot send on (no send path) can never be
 * enabled, and every channel it can send on is ON until the member turns it
 * off. The weekly digest is email-only and lives here too (its cadence
 * control, user_settings.digest_frequency, is the §26 weekly/off switch —
 * both must be on for a digest to go out).
 *
 * In-app is NOT a preference: every notification is always written as a row
 * (§26 "in-app = everything"); these helpers gate only email + push.
 */

export const WEEKLY_DIGEST_TYPE = 'weekly_digest' as const;

export type PrefType = NotificationType | typeof WEEKLY_DIGEST_TYPE;

export const PREF_TYPES = [...NOTIFICATION_TYPES, WEEKLY_DIGEST_TYPE] as const;

export type PrefChannel = 'inapp' | 'email' | 'push';

export interface ChannelDefaults {
  inapp: boolean;
  email: boolean;
  push: boolean;
}

/** §26 default matrix. Default true ⇔ the channel has a send path for the type. */
export const DEFAULT_MATRIX: Record<PrefType, ChannelDefaults> = {
  ...(Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [
      type,
      {
        inapp: true,
        email: NOTIFICATION_CHANNELS[type].email,
        push: NOTIFICATION_CHANNELS[type].push,
      },
    ]),
  ) as Record<NotificationType, ChannelDefaults>),
  // Email-only summary — no in-app row, no push.
  [WEEKLY_DIGEST_TYPE]: { inapp: false, email: true, push: false },
};

export function isPrefType(value: string): value is PrefType {
  return (PREF_TYPES as readonly string[]).includes(value);
}

/** One row of the merged matrix as the settings UI consumes it. */
export interface PrefMatrixRow {
  type: PrefType;
  /** Always-on channel (§26) — shown checked + locked in the UI. */
  inapp: boolean;
  email: boolean;
  push: boolean;
  /** Whether the channel is togglable at all (a send path exists). */
  emailCapable: boolean;
  pushCapable: boolean;
}

export interface PrefOverrideRow {
  notification_type: string;
  channel: string;
  enabled: boolean;
}

/** Merge defaults + override rows into the full matrix (§26 defaults pre-checked). */
export function buildPrefsMatrix(overrides: readonly PrefOverrideRow[]): PrefMatrixRow[] {
  const byKey = new Map<string, boolean>();
  for (const row of overrides) {
    byKey.set(`${row.notification_type}:${row.channel}`, row.enabled);
  }
  return PREF_TYPES.map((type) => {
    const defaults = DEFAULT_MATRIX[type];
    return {
      type,
      inapp: defaults.inapp,
      // A channel with no send path stays false regardless of stray overrides.
      email: defaults.email && (byKey.get(`${type}:email`) ?? defaults.email),
      push: defaults.push && (byKey.get(`${type}:push`) ?? defaults.push),
      emailCapable: defaults.email,
      pushCapable: defaults.push,
    };
  });
}

/**
 * Is `channel` on for this member + type? Merges the §26 default with the
 * member's override row. Fail-open to the DEFAULT (never to silence a
 * channel the member left on, never to enable one with no send path) — a
 * prefs-read hiccup must not decide notification delivery.
 */
export async function isChannelEnabled(
  admin: SupabaseClient<Database>,
  userId: string,
  type: PrefType,
  channel: 'email' | 'push',
): Promise<boolean> {
  const fallback = DEFAULT_MATRIX[type][channel];
  // No send path → no override can conjure one.
  if (!fallback) return false;
  try {
    const { data, error } = await admin
      .from('notification_prefs')
      .select('enabled')
      .eq('user_id', userId)
      .eq('notification_type', type)
      .eq('channel', channel)
      .maybeSingle();
    if (error || !data) return fallback;
    return data.enabled;
  } catch {
    return fallback;
  }
}

/** Current hour (0–23) on the member's wall clock; UTC when timezone is unset/invalid. */
export function hourInTimezone(now: Date, timezone: string | null): number {
  try {
    const rendered = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone ?? 'UTC',
      hour: 'numeric',
      hour12: false,
    }).format(now);
    const hour = Number.parseInt(rendered, 10);
    // en-US hourCycle can render midnight as "24".
    return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
}

/**
 * Is the member inside their quiet hours right now (§26 — push only)?
 * Window is [start, end) hours on the member's local clock (profile
 * timezone), wrapping midnight when start > end. No quiet hours configured
 * (either bound null, or a zero-length window) → false. Fails open to
 * false — a settings-read hiccup must not swallow a push.
 */
export async function isQuietHours(
  admin: SupabaseClient<Database>,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const [{ data: settings }, { data: profile }] = await Promise.all([
      admin
        .from('user_settings')
        .select('quiet_hours_start, quiet_hours_end')
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('profiles').select('timezone').eq('user_id', userId).maybeSingle(),
    ]);
    const start = settings?.quiet_hours_start ?? null;
    const end = settings?.quiet_hours_end ?? null;
    if (start === null || end === null || start === end) return false;

    const hour = hourInTimezone(now, profile?.timezone ?? null);
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
  } catch {
    return false;
  }
}
