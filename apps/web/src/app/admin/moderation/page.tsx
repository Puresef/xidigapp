import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LOCALE_NAMES } from '@xidig/i18n';

import { ModerationQueue, type ReviewItem } from '@/components/admin/moderation-queue';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { publicMediaUrl } from '@/lib/media/storage';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Mod → moderation review queue (§15/§24): human decisions on AI pre-scan
 * escalations, with Somali content as the primary lane (the scanner prefers
 * 'uncertain' for Somali — a Somali-speaking human makes the call). Role gate
 * mirrors requireRole('mod') — mods AND admins. Service-role read because
 * moderation_reviews RLS is mod-select via is_mod() and the content
 * snapshots span tables. The load duplicates GET /api/admin/moderation's
 * query on purpose — route handlers must not be imported into pages.
 * Decisions hit PATCH /api/admin/moderation/[id]. NOT the Phase 6
 * member-reports queue.
 */

const STATUSES = ['pending', 'approved', 'removed', 'dismissed'] as const;
type QueueStatus = (typeof STATUSES)[number];

// Somali first — it is the queue's primary lane (§24).
const LANGUAGES = ['so', 'en', 'other', 'all'] as const;
type QueueLanguage = (typeof LANGUAGES)[number];

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function loadReviewItems(
  admin: Admin,
  status: QueueStatus,
  language: QueueLanguage,
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

function queueHref(status: QueueStatus, language: QueueLanguage): string {
  const params = new URLSearchParams();
  if (status !== 'pending') params.set('status', status);
  if (language !== 'all') params.set('language', language);
  const qs = params.toString();
  return qs ? `/admin/moderation?${qs}` : '/admin/moderation';
}

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/admin/moderation');
  if (ctx.appUser.status !== 'active' || (ctx.appUser.role !== 'mod' && ctx.appUser.role !== 'admin')) {
    redirect('/');
  }

  const params = await searchParams;
  const rawStatus = typeof params.status === 'string' ? params.status : '';
  const rawLanguage = typeof params.language === 'string' ? params.language : '';
  const status: QueueStatus = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as QueueStatus)
    : 'pending';
  const language: QueueLanguage = (LANGUAGES as readonly string[]).includes(rawLanguage)
    ? (rawLanguage as QueueLanguage)
    : 'all';

  const t = await getT();
  const admin = getSupabaseAdmin();
  const items = await loadReviewItems(admin, status, language);

  const languageLabels: Record<QueueLanguage, string> = {
    so: LOCALE_NAMES.so,
    en: LOCALE_NAMES.en,
    other: t('admin.modLangOther'),
    all: t('plaza.filterAll'),
  };
  const statusLabels: Record<QueueStatus, string> = {
    pending: t('admin.modStatusPending'),
    approved: t('admin.modStatusApproved'),
    removed: t('admin.modStatusRemoved'),
    dismissed: t('admin.modStatusDismissed'),
  };

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('admin.modTitle')}</h1>
      <p className="xidig-field__hint">{t('admin.modIntro')}</p>

      <div className="xidig-tabs" aria-label={t('admin.modFilterLanguage')}>
        {LANGUAGES.map((lang) => (
          <Link
            key={lang}
            className="xidig-tabs__tab"
            href={queueHref(status, lang)}
            aria-current={language === lang ? 'page' : undefined}
          >
            {lang === 'so' ? <strong>{languageLabels[lang]}</strong> : languageLabels[lang]}
          </Link>
        ))}
      </div>

      <div className="xidig-tabs" aria-label={t('admin.modFilterStatus')}>
        {STATUSES.map((queueStatus) => (
          <Link
            key={queueStatus}
            className="xidig-tabs__tab"
            href={queueHref(queueStatus, language)}
            aria-current={status === queueStatus ? 'page' : undefined}
          >
            {statusLabels[queueStatus]}
          </Link>
        ))}
      </div>

      <ModerationQueue initialItems={items} />
    </main>
  );
}
