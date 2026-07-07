import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import {
  buildPrefsMatrix,
  DEFAULT_MATRIX,
  PREF_TYPES,
  type PrefOverrideRow,
} from '@/lib/notifications/prefs';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The §26 notification matrix, per member. GET returns defaults merged with
 * the member's notification_prefs override rows. PUT is a FULL-matrix
 * replace: the client sends every togglable cell, the server stores only the
 * cells that differ from the default (absent row = default — the table stays
 * tiny and a future default change flows through to everyone who never
 * touched that toggle).
 *
 * In-app is not accepted as a channel: every notification always writes its
 * in-app row (§26 "in-app = everything").
 */

const putSchema = z.object({
  prefs: z
    .array(
      z.object({
        type: z.enum(PREF_TYPES),
        channel: z.enum(['email', 'push']),
        enabled: z.boolean(),
      }),
    )
    .max(PREF_TYPES.length * 2),
});

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();

    const { data, error } = await ctx.supabase
      .from('notification_prefs')
      .select('notification_type, channel, enabled');
    if (error) throw new Error(`notification prefs read failed: ${error.message}`);

    return apiOk({ matrix: buildPrefsMatrix((data ?? []) as PrefOverrideRow[]) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = putSchema.parse(await request.json());

    const seen = new Set<string>();
    const overrides: { notification_type: string; channel: string; enabled: boolean }[] = [];
    for (const pref of input.prefs) {
      const key = `${pref.type}:${pref.channel}`;
      // Duplicates and cells with no send path are client bugs — reject.
      if (seen.has(key)) throw new ApiError('invalid_request', 400);
      seen.add(key);
      const capable = DEFAULT_MATRIX[pref.type][pref.channel];
      if (!capable && pref.enabled) throw new ApiError('invalid_request', 400);
      // Store only deviations from the default.
      if (capable && pref.enabled !== DEFAULT_MATRIX[pref.type][pref.channel]) {
        overrides.push({
          notification_type: pref.type,
          channel: pref.channel,
          enabled: pref.enabled,
        });
      }
    }

    const admin = getSupabaseAdmin();

    // Full replace: clear, then insert the deviations.
    const { error: clearError } = await admin
      .from('notification_prefs')
      .delete()
      .eq('user_id', ctx.appUser.id);
    if (clearError) throw new Error(`notification prefs clear failed: ${clearError.message}`);

    if (overrides.length > 0) {
      const { error: insertError } = await admin
        .from('notification_prefs')
        .insert(overrides.map((row) => ({ ...row, user_id: ctx.appUser.id })));
      if (insertError) throw new Error(`notification prefs save failed: ${insertError.message}`);
    }

    emitServer(event('settings_updated', { section: 'notifications' }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({
      matrix: buildPrefsMatrix(overrides as PrefOverrideRow[]),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
