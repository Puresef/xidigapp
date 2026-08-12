import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ANIGA_MODULE_DEFAULTS, ANIGA_MODULE_IDS, resolveModuleStates } from '@/lib/aniga/modules';
import { loadModuleFlags } from '@/lib/aniga/flags';
import { requireUser } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { Json } from '@xidig/db';

/**
 * PUT /api/me/profile/modules — the module manager's save (Aniga v3).
 *
 * Full replacement: the array IS the order and the visibility set, saved in one
 * statement through `set_profile_modules` because supabase-js cannot open a
 * transaction and a half-applied reorder would strand a member with no modules.
 *
 * The load-bearing rule is ruling 7: a flag-gated module cannot be published
 * while its flag is off, and the owner's toggle must be REJECTED rather than
 * quietly coerced to hidden. That is checked twice on purpose —
 *
 *   1. here, before the RPC, so the member gets the §27 sentence instead of a
 *      constraint error, and so no partial write happens; and
 *   2. by `profile_modules_flag_guard`, whose 42501 maps to the same 409. The
 *      trigger is the real boundary — this check is the manners.
 *
 * A future code path that forgets step 1 still cannot publish the module.
 */

const putSchema = z
  .object({
    modules: z
      .array(
        z
          .object({
            moduleId: z.enum(ANIGA_MODULE_IDS),
            position: z.number().int().min(1).max(64),
            visible: z.boolean(),
          })
          .strict(),
      )
      .max(ANIGA_MODULE_IDS.length),
  })
  .strict();

/** Module → the platform flag governing it, from the seed mirror. */
const FLAG_BY_MODULE = new Map(
  ANIGA_MODULE_DEFAULTS.map((kind) => [kind.id, kind.requiresFlag] as const),
);

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = putSchema.parse(await request.json());

    // Both uniqueness rules are DB constraints (the PK and the deferred
    // position unique), but a duplicate here means the manager sent a broken
    // set — a 400 says that, where the raw 23505 would not.
    const ids = input.modules.map((module) => module.moduleId);
    if (new Set(ids).size !== ids.length) throw new ApiError('invalid_request', 400);
    const positions = input.modules.map((module) => module.position);
    if (new Set(positions).size !== positions.length) throw new ApiError('invalid_request', 400);

    const flags = await loadModuleFlags(ctx.supabase);
    for (const module of input.modules) {
      if (!module.visible) continue;
      const flag = FLAG_BY_MODULE.get(module.moduleId) ?? null;
      if (flag !== null && flags[flag] !== true) throw new ApiError('module_flag_disabled', 409);
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin.rpc('set_profile_modules', {
      p_user_id: ctx.appUser.id,
      p_modules: input.modules.map((module) => ({
        module_id: module.moduleId,
        position: module.position,
        visible: module.visible,
      })) as unknown as Json,
    });
    if (error) {
      // 42501 = the flag guard raised. Reachable when a flag flips off between
      // the check above and the write, or when a caller skips the check.
      if (error.code === '42501') throw new ApiError('module_flag_disabled', 409);
      throw new Error(`modules save failed: ${error.message}`);
    }

    // Read back rather than echo: the response is what the profile will render,
    // including the modules the member never sent (which fall back to defaults).
    const { data: rows, error: readError } = await ctx.supabase
      .from('profile_modules')
      .select('module_id, position, visible')
      .eq('user_id', ctx.appUser.id);
    if (readError) throw new Error(`modules read failed: ${readError.message}`);

    const modules = resolveModuleStates(rows ?? [], flags);

    emitServer(
      event('profile_modules_saved', {
        visible_count: modules.filter((module) => module.visible && !module.lockedByFlag).length,
        hidden_count: modules.filter((module) => !module.visible).length,
      }),
      { distinctId: ctx.appUser.id, userId: ctx.appUser.id },
    );

    return apiOk({ modules });
  } catch (error) {
    return handleApiError(error);
  }
}
