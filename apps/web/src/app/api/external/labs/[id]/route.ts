import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireApiKey } from '@/lib/api-keys/guard';
import { writeAudit } from '@/lib/audit';
import { externalPlaybookPatchSchema } from '@/lib/external/schemas';
import { updateSeededPlaybook } from '@/lib/seed/content';

/**
 * Update a seeded Lab TEMPLATE / playbook (PATCH, `labs:write` scope, §21).
 * Guarded so an external caller only mutates a seeded template, never a
 * member-authored one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/external/labs/:id';
const paramsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireApiKey(request, 'labs:write', ROUTE);
    const { id } = paramsSchema.parse(await params);
    const patch = externalPlaybookPatchSchema.parse(await request.json());

    const updated = await updateSeededPlaybook(ctx.admin, id, patch);
    if (!updated) throw new ApiError('not_found', 404);

    await writeAudit(ctx.admin, {
      actorUserId: ctx.ownerUserId,
      apiKeyId: ctx.keyId,
      action: 'external.lab_template.updated',
      targetType: 'lab',
      targetId: id,
    });

    return apiOk({ id, updated: true });
  } catch (error) {
    return handleApiError(error);
  }
}
