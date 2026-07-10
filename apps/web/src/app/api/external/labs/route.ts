import { apiOk, handleApiError } from '@/lib/api';
import { requireApiKey } from '@/lib/api-keys/guard';
import { writeAudit } from '@/lib/audit';
import { externalPlaybookCreateSchema } from '@/lib/external/schemas';
import { createSeededPlaybook } from '@/lib/seed/content';

/**
 * Create/update a seeded Lab TEMPLATE (POST, `labs:write` scope, §21).
 *
 * PRD §21 seeds "Lab templates" — the charter starter (a `lab_playbooks` row),
 * NOT a live build-in-public Lab. Creating live Lab *instances* through the API
 * is deliberately DEFERRED: a fake active Lab is fake social proof and needs a
 * human lead, so it fails the low-risk bar. This endpoint is idempotent on the
 * template slug and audited.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/external/labs';

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(request, 'labs:write', ROUTE);
    const input = externalPlaybookCreateSchema.parse(await request.json());

    const { playbookId } = await createSeededPlaybook(ctx.admin, {
      slug: input.slug,
      name: input.name,
      ventureType: input.ventureType,
      template: input.template ?? {},
      source: input.source,
    });

    await writeAudit(ctx.admin, {
      actorUserId: ctx.ownerUserId,
      apiKeyId: ctx.keyId,
      action: 'external.lab_template.upserted',
      targetType: 'lab',
      targetId: playbookId,
      metadata: { source: input.source, slug: input.slug },
    });

    return apiOk({ id: playbookId, kind: 'template', slug: input.slug, source: input.source }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
