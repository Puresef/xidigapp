import { z } from 'zod';

import type { ReviewItem } from '@/components/admin/moderation-queue';
import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { publicMediaUrl } from '@/lib/media/storage';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Human-in-the-loop moderation queue (§15/§24): AI pre-scan escalations
 * (ai_flagged → auto-hidden, ai_uncertain → still live) awaiting a human
 * call. Somali-language rows are the primary lane — the AI is told to prefer
 * 'uncertain' for Somali content, so the queue supports language filtering
 * with Somali surfaced first in the UI. moderation_reviews RLS is
 * mod-select-only via is_mod(); the read here is mod-gated + service role,
 * and content snapshots (posts/comments/media) are joined in application
 * code. NOT the Phase 6 member-reports queue.
 */

const querySchema = z.object({
  status: z.enum(['pending', 'approved', 'removed', 'dismissed']).default('pending'),
  language: z.enum(['so', 'en', 'other', 'all']).default('all'),
});

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function loadReviewItems(
  admin: Admin,
  status: 'pending' | 'approved' | 'removed' | 'dismissed',
  language: 'so' | 'en' | 'other' | 'all',
): Promise<ReviewItem[]> {
  let query = admin
    .from('moderation_reviews')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(200);
  if (language === 'so' || language === 'en') {
    query = query.eq('language', language);
  } else if (language === 'other') {
    // 'other' is the catch-all lane: rows the scanner couldn't attribute to
    // so/en (stored 'other') plus rows with no language guess at all (null).
    query = query.or('language.is.null,language.eq.other');
  }

  const { data: reviewRows, error } = await query;
  if (error) throw new Error(`moderation queue read failed: ${error.message}`);
  const reviews = reviewRows ?? [];

  const authorIds = [...new Set(reviews.map((r) => r.author_user_id))];
  const postIds = reviews.filter((r) => r.entity_type === 'post').map((r) => r.entity_id);
  const commentIds = reviews.filter((r) => r.entity_type === 'comment').map((r) => r.entity_id);
  const mediaIds = reviews.filter((r) => r.entity_type === 'media_upload').map((r) => r.entity_id);

  const [{ data: profiles }, { data: posts }, { data: comments }, { data: media }] =
    await Promise.all([
      authorIds.length
        ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', authorIds)
        : Promise.resolve({ data: [] as { user_id: string; display_name: string; handle: string }[] }),
      postIds.length
        ? admin.from('posts').select('id, title, body, status').in('id', postIds)
        : Promise.resolve({
            data: [] as { id: string; title: string | null; body: string; status: string }[],
          }),
      commentIds.length
        ? admin.from('comments').select('id, post_id, body, status').in('id', commentIds)
        : Promise.resolve({
            data: [] as { id: string; post_id: string; body: string; status: string }[],
          }),
      mediaIds.length
        ? admin
            .from('media_uploads')
            .select('id, storage_path, scan_status, post_id')
            .in('id', mediaIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              storage_path: string;
              scan_status: string;
              post_id: string | null;
            }[],
          }),
    ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const postById = new Map((posts ?? []).map((p) => [p.id, p]));
  const commentById = new Map((comments ?? []).map((c) => [c.id, c]));
  const mediaById = new Map((media ?? []).map((m) => [m.id, m]));

  return reviews.map((row) => {
    let currentStatus: string | null = null;
    let url: string | null = null;
    if (row.entity_type === 'post') {
      const post = postById.get(row.entity_id);
      if (post) {
        currentStatus = post.status;
        url = `/p/${post.id}`;
      }
    } else if (row.entity_type === 'comment') {
      const comment = commentById.get(row.entity_id);
      if (comment) {
        currentStatus = comment.status;
        url = comment.post_id ? `/p/${comment.post_id}` : null;
      }
    } else if (row.entity_type === 'media_upload') {
      const mediaRow = mediaById.get(row.entity_id);
      if (mediaRow) {
        currentStatus = mediaRow.scan_status;
        url = publicMediaUrl(mediaRow.storage_path);
      }
    }

    const profile = profileById.get(row.author_user_id);
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      reason: row.reason,
      language: row.language,
      contentExcerpt: row.content_excerpt,
      aiVerdict: (row.ai_verdict ?? null) as ReviewItem['aiVerdict'],
      status: row.status,
      createdAt: row.created_at,
      author: profile ? { display_name: profile.display_name, handle: profile.handle } : null,
      content: { currentStatus, url },
    };
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole('mod');

    const searchParams = new URL(request.url).searchParams;
    const query = querySchema.parse({
      status: searchParams.get('status') ?? undefined,
      language: searchParams.get('language') ?? undefined,
    });

    const admin = getSupabaseAdmin();
    const items = await loadReviewItems(admin, query.status, query.language);

    return apiOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}
