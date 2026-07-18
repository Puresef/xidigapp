import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Banner } from '@/components/banner';
import { LiteMediaProvider } from '@/components/media/lite-media-provider';
import { LiteShowAll } from '@/components/media/lite-show-all';
import { AskControls } from '@/components/plaza/ask-controls';
import { CommentThread } from '@/components/plaza/comment-thread';
import { PostCard } from '@/components/plaza/post-card';
import { getAuthContext } from '@/lib/auth/guards';
import { getLowBandwidth } from '@/lib/bandwidth-server';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';
import { ASK_NUDGE_AFTER_DAYS } from '@/lib/plaza/constants';
import { hydratePosts, POST_COLUMNS } from '@/lib/plaza/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { BackLink } from '@/components/back-link';

export const dynamic = 'force-dynamic';

/**
 * Post permalink (§15) — detail card + Ask lifecycle + comment thread.
 * Members-only in v1 (§28: public share pages are profiles/listings/labs).
 * The post row loads under the CALLER's RLS so authors see their own
 * hidden/removed posts (with the status banner inside PostCard); everyone
 * else gets a plain 404.
 */

const idSchema = z.string().uuid();

export default async function PostPermalinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const ctx = await getAuthContext();
  if (!ctx) redirect(`/signin?next=/p/${id}`);
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const { data: row, error } = await ctx.supabase
    .from('posts')
    .select(POST_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`post lookup failed: ${error.message}`);
  if (!row) notFound();

  const admin = getSupabaseAdmin();
  // Permalinks bypass the mute filter — a mute hides posts from FEEDS, it
  // never 404s a direct link someone shared with you.
  const [view] = await hydratePosts(admin, ctx.appUser.id, [row], { applyMuteFilter: false });
  if (!view) notFound();

  // Asker UX: which comment holds the credit (unique partial index — ≤1).
  const { data: credited, error: creditedError } = await admin
    .from('comments')
    .select('id')
    .eq('post_id', id)
    .eq('is_credited_answer', true)
    .maybeSingle();
  if (creditedError) {
    throw new Error(`credited comment lookup failed: ${creditedError.message}`);
  }
  const creditedCommentId = credited?.id ?? null;

  const lowBandwidth = await getLowBandwidth();
  const prefs = await getLitePrefs();
  const t = await getT();

  const post = view.post;
  const isAsker = post.author_user_id === ctx.appUser.id;
  const askStatus = post.ask_status;

  // Edit history (Phase 4.5): author or mod only — the revisions API
  // re-checks, this just decides whether to render the affordance.
  const isAuthor = post.author_user_id === ctx.appUser.id;
  const canSeeHistory =
    isAuthor || ctx.appUser.role === 'mod' || ctx.appUser.role === 'admin';
  let revisionCount = 0;
  if (canSeeHistory && post.edited_at !== null) {
    const { count, error: revisionError } = await admin
      .from('post_revisions')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', post.id);
    if (revisionError) throw new Error(`revision count failed: ${revisionError.message}`);
    revisionCount = count ?? 0;
  }

  return (
    <main className="xidig-section">
      <BackLink href="/plaza" labelKey="nav.plaza" />
      <LiteMediaProvider>
        <LiteShowAll />
        <PostCard
          view={view}
          viewerId={ctx.appUser.id}
          lowBandwidth={lowBandwidth}
          prefs={prefs}
          detail
          canSeeHistory={canSeeHistory}
          revisionCount={revisionCount}
        />
      </LiteMediaProvider>

      {post.type === 'ask' && isAsker && askStatus === 'open' && post.ask_nudged_at !== null ? (
        <Banner kind="notice">
          <strong>{t('plaza.askStaleTitle')}</strong>{' '}
          {t('plaza.askStaleBody', { days: ASK_NUDGE_AFTER_DAYS })}
        </Banner>
      ) : null}

      {post.type === 'ask' && askStatus !== null ? (
        <AskControls postId={post.id} isAsker={isAsker} askStatus={askStatus} />
      ) : null}

      <h2 className="xidig-section__title">{t('plaza.commentsHeading')}</h2>
      <CommentThread
        postId={post.id}
        viewerId={ctx.appUser.id}
        askContext={{
          isAsker,
          askStatus: post.type === 'ask' ? askStatus : null,
          creditedCommentId,
        }}
      />
    </main>
  );
}
