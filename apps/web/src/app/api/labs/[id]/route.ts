import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database, TablesUpdate } from '@xidig/db';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { hydrateOneLab, loadLabForViewer, parseLabId, requireLabManager } from '@/lib/labs-api';
import { labSettingsSchema } from '@/lib/labs/schemas';
import { logLabEvent, updateLabSettings } from '@/lib/labs/service';
import { loadAttachableMedia } from '@/lib/media/attach';
import type { LabRow } from '@/lib/labs/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * A single Space. GET is RLS-scoped (private/members/public enforced by the DB;
 * a hidden Space is a plain 404). PATCH is the settings surface — only the lead
 * or a platform admin may change mode-adjacent settings, and every change logs
 * a Space History event. Mode itself changes ONLY via /promote (promote-only
 * ladder), never here.
 *
 * Phase 4.5: PATCH also accepts `iconMediaId` / `coverMediaId` (attach-only
 * media surface). The referenced media_uploads row must belong to the caller,
 * carry kind `space_icon` / `space_cover`, and be scan-clean
 * (lib/media/attach.ts); paths + blurhash are denormalized onto labs. `null`
 * clears the art.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

const labMediaAttachSchema = z.object({
  iconMediaId: z.string().uuid().nullable().optional(),
  coverMediaId: z.string().uuid().nullable().optional(),
});

type LabMediaAttachInput = z.infer<typeof labMediaAttachSchema>;

async function attachLabMedia(
  admin: SupabaseClient<Database>,
  lab: LabRow,
  actorUserId: string,
  input: LabMediaAttachInput,
): Promise<LabRow> {
  const patch: Record<string, unknown> = {};
  const changed: string[] = [];

  if (input.iconMediaId !== undefined) {
    if (input.iconMediaId === null) {
      patch.icon_path = null;
      patch.icon_blurhash = null;
    } else {
      const media = await loadAttachableMedia(admin, actorUserId, input.iconMediaId, [
        'space_icon',
      ]);
      patch.icon_path = media.storage_path;
      patch.icon_blurhash = media.blurhash;
    }
    changed.push('icon_path');
  }

  if (input.coverMediaId !== undefined) {
    if (input.coverMediaId === null) {
      patch.cover_path = null;
      patch.cover_blurhash = null;
    } else {
      const media = await loadAttachableMedia(admin, actorUserId, input.coverMediaId, [
        'space_cover',
      ]);
      patch.cover_path = media.storage_path;
      patch.cover_blurhash = media.blurhash;
    }
    changed.push('cover_path');
  }

  const { data, error } = await admin
    .from('labs')
    .update(patch as TablesUpdate<'labs'>)
    .eq('id', lab.id)
    .select('*')
    .single();
  if (error || !data) throw new Error(`lab media attach failed: ${error?.message ?? 'no row'}`);

  await logLabEvent(admin, lab.id, actorUserId, 'settings_changed', { fields: changed });
  return data as LabRow;
}

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const lab = await loadLabForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    return apiOk({ lab: await hydrateOneLab(admin, ctx.appUser.id, lab) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);

    const body = (await request.json()) as Record<string, unknown>;
    const mediaInput = labMediaAttachSchema.parse(body);
    const hasMediaChange =
      mediaInput.iconMediaId !== undefined || mediaInput.coverMediaId !== undefined;

    // Settings keys are everything except the media attach fields. A
    // media-only PATCH skips labSettingsSchema (whose "nothing to update"
    // refine would reject an empty remainder); an empty body still 400s.
    const settingsBody = { ...body };
    delete settingsBody.iconMediaId;
    delete settingsBody.coverMediaId;
    const settingsInput =
      !hasMediaChange || Object.keys(settingsBody).length > 0
        ? labSettingsSchema.parse(settingsBody)
        : null;

    const lab = await loadLabForViewer(ctx, id);
    requireLabManager(ctx, lab);

    const admin = getSupabaseAdmin();
    let updated = lab;
    if (settingsInput)
      updated = await updateLabSettings(admin, updated, ctx.appUser.id, settingsInput);
    if (hasMediaChange) updated = await attachLabMedia(admin, updated, ctx.appUser.id, mediaInput);
    return apiOk({ lab: await hydrateOneLab(admin, ctx.appUser.id, updated) });
  } catch (error) {
    return handleApiError(error);
  }
}
