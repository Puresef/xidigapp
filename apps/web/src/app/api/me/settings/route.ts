import { z } from 'zod';

import type { Json } from '@xidig/db';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import {
  deepMergePreferences,
  DIGEST_FREQUENCY_OPTIONS,
  DM_PRIVACY_OPTIONS,
  LOCATION_GRANULARITY_OPTIONS,
  settingsViewFromRow,
} from '@/lib/settings/model';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The member's settings row (§26 privacy + notification knobs, Phase 4.5
 * preferences jsonb). GET reads under the caller's RLS (select own) and
 * returns the defaults when no row exists yet; PATCH lazily upserts the row
 * (writes are API-only — user_settings has no client write grants) with a
 * DEEP-merged `preferences` so a patch touching preferences.appearance.theme
 * never clobbers preferences.lite.
 */

const patchSchema = z
  .object({
    dmPrivacy: z.enum(DM_PRIVACY_OPTIONS).optional(),
    discoverableDirectory: z.boolean().optional(),
    discoverableSearchEngines: z.boolean().optional(),
    locationGranularity: z.enum(LOCATION_GRANULARITY_OPTIONS).optional(),
    quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
    quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
    digestFrequency: z.enum(DIGEST_FREQUENCY_OPTIONS).optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

type PatchInput = z.infer<typeof patchSchema>;

/** Belt-and-braces cap on the merged jsonb — preferences hold flags, not documents. */
const PREFERENCES_MAX_JSON_BYTES = 16_384;

/** §23 settings_updated {section} — coarse, PII-free section slug. */
function sectionOf(input: PatchInput): string {
  if (
    input.dmPrivacy !== undefined ||
    input.discoverableDirectory !== undefined ||
    input.discoverableSearchEngines !== undefined ||
    input.locationGranularity !== undefined
  ) {
    return 'privacy';
  }
  if (
    input.quietHoursStart !== undefined ||
    input.quietHoursEnd !== undefined ||
    input.digestFrequency !== undefined
  ) {
    return 'notifications';
  }
  if (input.preferences && 'appearance' in input.preferences) return 'appearance';
  if (input.preferences && ('lite' in input.preferences || 'liteBundle' in input.preferences)) {
    return 'data';
  }
  return 'general';
}

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();

    const { data, error } = await ctx.supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', ctx.appUser.id)
      .maybeSingle();
    if (error) throw new Error(`settings read failed: ${error.message}`);

    return apiOk({ settings: settingsViewFromRow(data ?? null) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = patchSchema.parse(await request.json());

    const admin = getSupabaseAdmin();
    const { data: existing, error: readError } = await admin
      .from('user_settings')
      .select('*')
      .eq('user_id', ctx.appUser.id)
      .maybeSingle();
    if (readError) throw new Error(`settings read failed: ${readError.message}`);

    const current = settingsViewFromRow(existing ?? null);

    const preferences = input.preferences
      ? deepMergePreferences(current.preferences, input.preferences)
      : current.preferences;
    if (JSON.stringify(preferences).length > PREFERENCES_MAX_JSON_BYTES) {
      throw new ApiError('invalid_request', 400);
    }

    const quietHoursStart =
      input.quietHoursStart !== undefined ? input.quietHoursStart : current.quietHoursStart;
    const quietHoursEnd =
      input.quietHoursEnd !== undefined ? input.quietHoursEnd : current.quietHoursEnd;
    // Quiet hours are a window: both bounds or neither.
    if ((quietHoursStart === null) !== (quietHoursEnd === null)) {
      throw new ApiError('invalid_request', 400);
    }

    const { data: saved, error } = await admin
      .from('user_settings')
      .upsert(
        {
          user_id: ctx.appUser.id,
          dm_privacy: input.dmPrivacy ?? current.dmPrivacy,
          discoverable_directory: input.discoverableDirectory ?? current.discoverableDirectory,
          discoverable_search_engines:
            input.discoverableSearchEngines ?? current.discoverableSearchEngines,
          location_granularity: input.locationGranularity ?? current.locationGranularity,
          quiet_hours_start: quietHoursStart,
          quiet_hours_end: quietHoursEnd,
          digest_frequency: input.digestFrequency ?? current.digestFrequency,
          preferences: preferences as Json,
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();
    if (error || !saved) throw new Error(`settings save failed: ${error?.message ?? 'no row'}`);

    emitServer(event('settings_updated', { section: sectionOf(input) }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ settings: settingsViewFromRow(saved) });
  } catch (error) {
    return handleApiError(error);
  }
}
