import { after } from 'next/server';

import { apiOk, handleApiError } from '@/lib/api';
import { requireApiKey } from '@/lib/api-keys/guard';
import { writeAudit } from '@/lib/audit';
import { externalPostCreateSchema } from '@/lib/external/schemas';
import { externalDedupKey, resolveExistingTagIds } from '@/lib/external/write';
import { scanTextContent } from '@/lib/moderation/scan';
import { createSeededPost } from '@/lib/seed/content';
import { getSeedActorUserId } from '@/lib/seed/actor';

/**
 * Create a labelled seeded/AI Plaza post (POST, `plaza:write` scope, §21).
 *
 * The post is authored by the badged AI-assistant account — it never
 * impersonates a member — and carries a non-'member' `source` so the UI labels
 * it. Idempotent (registry-keyed by an idempotency key or content hash),
 * strictly validated, audited, and — like member posts — put through the §15 AI
 * text pre-scan (fire-and-forget) so external content is moderated too. It earns
 * NO reputation.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/external/plaza/posts';

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(request, 'plaza:write', ROUTE);
    const input = externalPostCreateSchema.parse(await request.json());

    const actorUserId = await getSeedActorUserId(ctx.admin);
    const tagIds = await resolveExistingTagIds(ctx.admin, input.tags);
    const dedupKey = externalDedupKey(ctx.keyId, input.idempotencyKey, {
      type: input.type,
      title: input.title ?? null,
      body: input.body,
    });

    const { postId, created } = await createSeededPost(ctx.admin, {
      actorUserId,
      source: input.source,
      dedupKey,
      apiKeyId: ctx.keyId,
      type: input.type,
      title: input.title ?? null,
      body: input.body,
      linkUrl: input.linkUrl ?? null,
      tagIds,
    });

    // Moderate external content too (post-response, fail-open) — new posts only.
    if (created) {
      after(() =>
        scanTextContent(ctx.admin, {
          entityType: 'post',
          entityId: postId,
          authorUserId: actorUserId,
          text: `${input.title ?? ''} ${input.body}`.trim(),
        }),
      );
    }

    await writeAudit(ctx.admin, {
      actorUserId: ctx.ownerUserId,
      apiKeyId: ctx.keyId,
      action: created ? 'external.post.created' : 'external.post.idempotent',
      targetType: 'post',
      targetId: postId,
      metadata: { source: input.source, type: input.type },
    });

    return apiOk({ id: postId, created, source: input.source }, created ? 201 : 200);
  } catch (error) {
    return handleApiError(error);
  }
}
