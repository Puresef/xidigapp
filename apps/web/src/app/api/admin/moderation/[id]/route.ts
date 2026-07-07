import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { publicMediaUrl } from '@/lib/media/storage';
import { MEDIA_BUCKET } from '@/lib/plaza/constants';
import { insertNotification } from '@/lib/plaza/notify';
import { moderationDecisionSchema } from '@/lib/plaza/schemas';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Human decision on an AI pre-scan escalation (§15/§24). Approving restores
 * ONLY rows the scanner auto-hid (status 'hidden') — it never resurrects
 * author-deleted or mod-removed content. Removing records the §19 trail
 * (mod_actions + immutable audit row) and tells the author via an in-app
 * notification; removed media also loses its storage object and its slot in
 * the owning post's image_urls. All writes are service role — the involved
 * tables have no client write policies by design.
 */

const idSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const mod = await requireRole('mod');
    const reviewId = idSchema.safeParse((await context.params).id);
    if (!reviewId.success) throw new ApiError('not_found', 404);

    const body = moderationDecisionSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const { data: review, error: loadError } = await admin
      .from('moderation_reviews')
      .select('*')
      .eq('id', reviewId.data)
      .maybeSingle();
    if (loadError) throw new Error(`moderation review lookup failed: ${loadError.message}`);
    if (!review) throw new ApiError('not_found', 404);
    if (review.status !== 'pending') throw new ApiError('invalid_request', 400);

    if (body.decision === 'approved') {
      // Restore only what the scanner hid — 'hidden' is the only status a
      // pre-scan sets, so anything else (author delete, mod removal) stays.
      if (review.entity_type === 'post') {
        const { error } = await admin
          .from('posts')
          .update({ status: 'published' })
          .eq('id', review.entity_id)
          .eq('status', 'hidden');
        if (error) throw new Error(`moderation approve failed: ${error.message}`);
      } else if (review.entity_type === 'comment') {
        const { error } = await admin
          .from('comments')
          .update({ status: 'published' })
          .eq('id', review.entity_id)
          .eq('status', 'hidden');
        if (error) throw new Error(`moderation approve failed: ${error.message}`);
      } else if (review.entity_type === 'media_upload') {
        const { error } = await admin
          .from('media_uploads')
          .update({ scan_status: 'passed' })
          .eq('id', review.entity_id);
        if (error) throw new Error(`moderation approve failed: ${error.message}`);
      }
    } else if (body.decision === 'removed') {
      if (review.entity_type === 'post') {
        const { error } = await admin
          .from('posts')
          .update({ status: 'removed' })
          .eq('id', review.entity_id);
        if (error) throw new Error(`moderation remove failed: ${error.message}`);
      } else if (review.entity_type === 'comment') {
        const { error } = await admin
          .from('comments')
          .update({ status: 'removed' })
          .eq('id', review.entity_id);
        if (error) throw new Error(`moderation remove failed: ${error.message}`);
      } else if (review.entity_type === 'media_upload') {
        const { data: mediaRow, error: mediaLoadError } = await admin
          .from('media_uploads')
          .select('id, storage_path, post_id')
          .eq('id', review.entity_id)
          .maybeSingle();
        if (mediaLoadError) {
          throw new Error(`moderation media lookup failed: ${mediaLoadError.message}`);
        }
        if (mediaRow) {
          const { error } = await admin
            .from('media_uploads')
            .update({ scan_status: 'removed' })
            .eq('id', mediaRow.id);
          if (error) throw new Error(`moderation remove failed: ${error.message}`);

          // Best-effort object delete — the DB row is the source of truth;
          // an orphaned storage object is a cleanup chore, not a failure.
          const { error: storageError } = await admin.storage
            .from(MEDIA_BUCKET)
            .remove([mediaRow.storage_path]);
          if (storageError) {
            console.error('[moderation] storage delete failed:', storageError.message);
          }

          if (mediaRow.post_id) {
            const { data: post } = await admin
              .from('posts')
              .select('id, image_urls')
              .eq('id', mediaRow.post_id)
              .maybeSingle();
            if (post) {
              const removedUrl = publicMediaUrl(mediaRow.storage_path);
              const nextUrls = (post.image_urls ?? []).filter(
                (imageUrl) => imageUrl !== removedUrl && !imageUrl.endsWith(mediaRow.storage_path),
              );
              const { error: postError } = await admin
                .from('posts')
                .update({ image_urls: nextUrls })
                .eq('id', post.id);
              if (postError) {
                throw new Error(`moderation image detach failed: ${postError.message}`);
              }
            }
          }
        }
      }

      const { error: actionError } = await admin.from('mod_actions').insert({
        actor_user_id: mod.appUser.id,
        action: 'remove_content',
        target_type: review.entity_type,
        target_id: review.entity_id,
        reason: body.note ?? null,
      });
      if (actionError) throw new Error(`mod action record failed: ${actionError.message}`);

      await insertNotification(admin, {
        userId: review.author_user_id,
        type: 'moderation_removed',
        entityType: review.entity_type,
        entityId: review.entity_id,
      });
    }
    // 'dismissed': nothing to do on the entity — only the review row below.

    const { error: reviewError } = await admin
      .from('moderation_reviews')
      .update({
        status: body.decision,
        reviewed_by_user_id: mod.appUser.id,
        reviewed_at: new Date().toISOString(),
        review_note: body.note ?? null,
      })
      .eq('id', review.id);
    if (reviewError) throw new Error(`moderation review update failed: ${reviewError.message}`);

    await writeAudit(admin, {
      actorUserId: mod.appUser.id,
      action: `moderation_review.${body.decision}`,
      targetType: review.entity_type,
      targetId: review.entity_id,
      metadata: { reviewId: review.id, language: review.language },
    });

    return apiOk({ review: { id: review.id, status: body.decision } });
  } catch (error) {
    return handleApiError(error);
  }
}
