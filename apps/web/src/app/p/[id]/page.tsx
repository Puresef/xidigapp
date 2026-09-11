import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Banner } from '@/components/banner';
import { OfflineBanner } from '@/components/offline-banner';
import { LiteMediaProvider } from '@/components/media/lite-media-provider';
import { LiteShowAll } from '@/components/media/lite-show-all';
import { ReportControl } from '@/components/report-control';
import { SystemNotice } from '@/components/system-notice';
import { CodsiDetails } from '@/components/plaza/codsi/codsi-details';
import { CodsiTimeline } from '@/components/plaza/codsi/codsi-timeline';
import { FulfilledBanner } from '@/components/plaza/codsi/fulfilled-banner';
import { GarabButton } from '@/components/plaza/codsi/garab-button';
import { GuulPrompt } from '@/components/plaza/codsi/guul-prompt';
import { HelperCard, HelperStrip } from '@/components/plaza/codsi/helper-strip';
import { OfferCta } from '@/components/plaza/codsi/offer-cta';
import { OffersCard, type OfferRowView } from '@/components/plaza/codsi/offers-card';
import { OwnerControls } from '@/components/plaza/codsi/owner-controls';
import { CommentThread } from '@/components/plaza/comment-thread';
import { PostCard } from '@/components/plaza/post-card';
import { getAuthContext } from '@/lib/auth/guards';
import { isActiveModOrAdmin } from '@/lib/auth/privilege';
import { getHeaderViewer } from '@/lib/auth/header-viewer';
import { getLowBandwidth } from '@/lib/bandwidth-server';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';
import { askDurationDays } from '@/lib/plaza/codsi';
import { ASK_NUDGE_AFTER_DAYS } from '@/lib/plaza/constants';
import { fetchPostCosigns, type PostCosignView } from '@/lib/plaza/cosigns';
import { fetchAuthors, hydratePosts, POST_COLUMNS } from '@/lib/plaza/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { BackLink } from '@/components/back-link';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@xidig/db';

export const dynamic = 'force-dynamic';

/**
 * Post permalink (§15) — detail card + comment thread; for Codsi (ask) posts
 * this is the P1 Codsi detail screen (frames 1a–3b): lifecycle open →
 * in_progress → fulfilled, asker-only controls in the rail, offer = private
 * DM, helper named publicly, Garab only post-fulfilled.
 *
 * Members-only in v1 (§28: public share pages are profiles/listings/labs).
 * The post row loads under the CALLER's RLS so authors see their own
 * hidden/removed posts (with the status banner inside PostCard); everyone
 * else gets a plain 404. Desktop = main column + 300px rail; mobile stacks
 * the rail directly under the article (same capability, responsive
 * presentation — never a reduced mobile summary).
 */

const idSchema = z.string().uuid();

interface OfferRow {
  id: string;
  helper_user_id: string;
  conversation_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

/** The asker's private offers list + the accepted offer's DM handle. */
async function fetchOffers(
  admin: SupabaseClient<Database>,
  postId: string,
): Promise<OfferRow[]> {
  const { data, error } = await admin
    .from('post_offers')
    .select('id, helper_user_id, conversation_id, created_at, accepted_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`offers lookup failed: ${error.message}`);
  return data ?? [];
}

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

  // Historical credit (pre-P1 answer model): which comment holds the badge.
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
  // Composer avatar (dark frames): the pill composer leads the thread with
  // the signed-in viewer's disc.
  const headerViewer = await getHeaderViewer();

  const post = view.post;
  const isAsker = post.author_user_id === ctx.appUser.id;
  const askStatus = post.ask_status;
  const isCodsi = post.type === 'ask' && askStatus !== null;
  const fulfilled = askStatus === 'fulfilled' || askStatus === 'answered';

  // Edit history (Phase 4.5): author or mod only — the revisions API
  // re-checks, this just decides whether to render the affordance.
  const isAuthor = post.author_user_id === ctx.appUser.id;
  const canSeeHistory =
    isAuthor || isActiveModOrAdmin(ctx.appUser);
  let revisionCount = 0;
  if (canSeeHistory && post.edited_at !== null) {
    const { count, error: revisionError } = await admin
      .from('post_revisions')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', post.id);
    if (revisionError) throw new Error(`revision count failed: ${revisionError.message}`);
    revisionCount = count ?? 0;
  }

  // ---- Codsi hydration (asks only) ----------------------------------------
  let cosigns: PostCosignView = { count: 0, mine: false };
  let pendingOffers: OfferRowView[] = [];
  let acceptedConversationId: string | null = null;
  if (isCodsi) {
    const offerRows = isAsker ? await fetchOffers(admin, id) : [];
    if (fulfilled) cosigns = await fetchPostCosigns(admin, id, ctx.appUser.id);
    if (isAsker) {
      const authors = await fetchAuthors(
        admin,
        offerRows.map((offer) => offer.helper_user_id),
      );
      acceptedConversationId =
        offerRows.find((offer) => offer.accepted_at !== null)?.conversation_id ?? null;
      if (askStatus === 'open') {
        pendingOffers = offerRows
          .filter((offer) => offer.accepted_at === null)
          .map((offer) => ({
            id: offer.id,
            helper: authors.get(offer.helper_user_id) ?? null,
            conversationId: offer.conversation_id,
            createdAt: offer.created_at,
          }));
      }
    }
  }

  const helper = view.askHelper;
  const durationDays =
    fulfilled && post.ask_fulfilled_at
      ? askDurationDays(post.created_at, post.ask_fulfilled_at)
      : null;

  const garab = isCodsi ? (
    <GarabButton
      postId={post.id}
      fulfilled={fulfilled}
      initialCount={cosigns.count}
      initialMine={cosigns.mine}
    />
  ) : null;

  const codsiRail = isCodsi ? (
    <aside className="xidig-codsi-rail">
      {isAsker ? (
        <>
          <OffersCard postId={post.id} offers={pendingOffers} />
          <OwnerControls postId={post.id} askStatus={askStatus} isAsker={isAsker} />
        </>
      ) : (
        <OfferCta
          postId={post.id}
          askStatus={askStatus}
          isAsker={isAsker}
          askerName={view.author?.display_name ?? t('app.name')}
        />
      )}
      {fulfilled && helper ? <HelperCard helper={helper} garab={garab} /> : null}
      <CodsiTimeline
        askStatus={askStatus}
        createdAt={post.created_at}
        helper={helper}
        helpedAt={post.ask_helped_at}
        fulfilledAt={post.ask_fulfilled_at}
      />
      <CodsiDetails
        category={view.tags[0]?.name ?? null}
        location={view.author?.location_city ?? null}
        durationDays={durationDays}
      />
      {!isAsker && view.author ? (
        <ReportControl
          targetType="post"
          targetId={post.id}
          targetName={view.author.display_name}
          variant="quiet"
          labelKey="plaza.reportCodsi"
        />
      ) : null}
    </aside>
  ) : null;

  const mainColumn = (
    <>
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
          codsiBanner={
            isCodsi && fulfilled ? (
              <FulfilledBanner
                helper={helper}
                createdAt={post.created_at}
                fulfilledAt={post.ask_fulfilled_at}
              />
            ) : undefined
          }
          codsiHelper={
            isCodsi && askStatus === 'in_progress' && helper ? (
              <HelperStrip
                helper={helper}
                askerName={view.author?.display_name ?? t('app.name')}
                isAsker={isAsker}
                helpedAt={post.ask_helped_at}
                conversationId={acceptedConversationId}
              />
            ) : undefined
          }
        />
      </LiteMediaProvider>

      {isCodsi && isAsker && fulfilled ? <GuulPrompt postId={post.id} /> : null}

      {isCodsi && isAsker && askStatus === 'open' && post.ask_nudged_at !== null ? (
        <Banner kind="notice">
          <strong>{t('plaza.askStaleTitle')}</strong>{' '}
          {t('plaza.askStaleBody', { days: ASK_NUDGE_AFTER_DAYS })}
        </Banner>
      ) : null}

      {isCodsi && askStatus === 'in_progress' ? (
        <SystemNotice tone="info" messageKey="plaza.threadPublicNote" />
      ) : null}

      <h2 className="xidig-section__title">
        {isCodsi
          ? t('plaza.threadHeadingCount', { count: view.commentCount })
          : t('plaza.commentsHeading')}
      </h2>
      <CommentThread
        postId={post.id}
        viewerId={ctx.appUser.id}
        openedAt={post.created_at}
        askContext={{
          isAsker,
          askStatus: post.type === 'ask' ? askStatus : null,
          creditedCommentId,
        }}
        viewer={{
          displayName: headerViewer.displayName,
          handle: headerViewer.handle,
          avatarThumbUrl: headerViewer.avatarThumbUrl,
          avatarBlurhash: headerViewer.avatarBlurhash,
        }}
      />
    </>
  );

  return (
    <main className={`xidig-section${isCodsi && fulfilled ? ' xidig-codsi-celebrated' : ''}`}>
      <OfflineBanner />
      <BackLink href="/plaza" labelKey="nav.plaza" />
      {isCodsi ? (
        <div className="xidig-codsi-layout">
          <div className="xidig-codsi-layout__main">{mainColumn}</div>
          {codsiRail}
        </div>
      ) : (
        mainColumn
      )}
    </main>
  );
}
