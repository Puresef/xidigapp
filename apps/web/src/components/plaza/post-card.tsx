'use client';

import Link from 'next/link';
import { useState } from 'react';

import { formatRelativeTime, type MessageKey } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { Banner } from '@/components/banner';
import { ContentSourceBadge } from '@/components/content-source-badge';
import { MediaSlot } from '@/components/media/media-slot';
import { ShareActions } from '@/components/share-actions';
import { BookmarkButton } from '@/components/social/bookmark-button';
import { PostEditForm } from '@/components/social/post-edit-form';
import { PostHistory } from '@/components/social/post-history';
import { PostOverflowMenu } from '@/components/social/post-overflow-menu';
import { estimateEmbedBytes } from '@/lib/lite/estimates';
import { LITE_BUNDLES, type LitePrefs } from '@/lib/lite/prefs';
import type { PostView } from '@/lib/plaza/views';

import { EmbedFrame } from './embed-frame';
import { PollBlock } from './poll-block';
import { PostLink } from './post-link';
import { ReactionBar } from './reaction-bar';

/**
 * One Plaza post (feed card and /p/[id] detail body). Media renders through
 * MediaSlot (§22 Lite, Phase 4.5): a deferred category shows a ~0-byte
 * blurhash placeholder with a "Show / Muuji" tap instead of disappearing.
 * Feed cards load image THUMBS; the detail view loads the full asset.
 * Authors see their own hidden/removed status as a banner (§27); everyone
 * else never receives those rows at all (RLS).
 */

type PostType = PostView['post']['type'];
type AskStatus = NonNullable<PostView['post']['ask_status']>;

const TYPE_KEYS: Record<PostType, MessageKey> = {
  intro: 'plaza.typeIntro',
  ask: 'plaza.typeAsk',
  win: 'plaza.typeWin',
  update: 'plaza.typeUpdate',
  poll: 'plaza.typePoll',
};

const ASK_STATUS_KEYS: Record<AskStatus, MessageKey> = {
  open: 'plaza.askOpen',
  answered: 'plaza.askAnswered',
  closed: 'plaza.askClosed',
};

export function PostCard({
  view,
  viewerId,
  lowBandwidth,
  prefs,
  detail = false,
  canSeeHistory = false,
  revisionCount = 0,
}: {
  view: PostView;
  viewerId: string;
  /** Legacy boolean — used only when `prefs` is absent (older call sites). */
  lowBandwidth: boolean;
  /** Granular Lite prefs (Phase 4.5). Wins over `lowBandwidth` when passed. */
  prefs?: LitePrefs | undefined;
  detail?: boolean;
  /** Author or mod (detail page passes it) — unlocks the edit-history view. */
  canSeeHistory?: boolean;
  /** post_revisions count (detail page hydrates it when canSeeHistory). */
  revisionCount?: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const { post, author, link } = view;
  const isOwn = post.author_user_id === viewerId;
  const permalink = `/p/${post.id}`;
  const litePrefs: LitePrefs =
    prefs ?? (lowBandwidth ? LITE_BUNDLES.essentials : LITE_BUNDLES.everything);

  const plainLink =
    link === null ? null : link.kind === 'internal' ? (
      <p className="xidig-card__meta">
        <Link href={link.path}>{link.url}</Link>
      </p>
    ) : link.kind === 'external' ? (
      <p className="xidig-card__meta">
        <PostLink url={link.url} host={link.host} />
      </p>
    ) : null;

  return (
    <article className="xidig-card">
      <div className="xidig-card__top">
        <p className="xidig-card__meta">
          {author ? <Link href={`/u/${author.handle}`}>{author.display_name}</Link> : null}
          {/* Diaspora geography in every byline (brand-rethink adoption):
              profile city when set — "Ayaan · Toronto · 2h". */}
          {author?.location_city ? ` · ${author.location_city}` : null}
          {author ? ' · ' : null}
          {formatRelativeTime(new Date(post.created_at), locale)}
        </p>
        <PostOverflowMenu
          authorUserId={post.author_user_id}
          authorName={author?.display_name ?? ''}
          isOwn={isOwn}
          tags={view.tags}
          canEdit={detail && isOwn && post.status !== 'removed'}
          onEdit={() => setEditing(true)}
        />
      </div>

      <p className="xidig-chip-row">
        <span className="xidig-tag">{t(TYPE_KEYS[post.type])}</span>
        <ContentSourceBadge source={post.source} />
        {post.pinned_at ? <span className="xidig-tag">{t('plaza.pinned')}</span> : null}
        {post.ask_status ? (
          <span className="xidig-tag">{t(ASK_STATUS_KEYS[post.ask_status])}</span>
        ) : null}
        {post.edited_at ? <span className="xidig-card__meta">{t('plaza.edited')}</span> : null}
      </p>

      {isOwn && post.status === 'hidden' ? (
        <Banner kind="notice">{t('plaza.hiddenOwn')}</Banner>
      ) : null}
      {isOwn && post.status === 'removed' ? (
        <Banner kind="notice">{t('plaza.removedOwn')}</Banner>
      ) : null}

      {editing ? (
        <PostEditForm
          postId={post.id}
          initialTitle={post.title}
          initialBody={post.body}
          initialLinkUrl={post.link_url}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          {post.title ? (
            detail ? (
              <h1>{post.title}</h1>
            ) : (
              <h3 className="xidig-card__title">
                <Link href={permalink}>{post.title}</Link>
              </h3>
            )
          ) : null}

          <p className="xidig-card__body">{post.body}</p>
        </>
      )}

      {view.images.length > 0 ? (
        <div className="xidig-post-images">
          {view.images.map((image, index) => (
            <MediaSlot
              key={image.url}
              kind="image"
              // Feed cards ask for the thumb; the detail view earns the full
              // asset (MediaSlot still picks thumb-first on slow connections).
              src={detail ? image.url : (image.thumbUrl ?? image.url)}
              thumbSrc={image.thumbUrl ?? undefined}
              blurhash={image.blurhash}
              alt={image.alt ?? t('plaza.imageAlt', { n: index + 1 })}
              estBytes={image.bytes ?? undefined}
              width={image.width}
              height={image.height}
              prefs={litePrefs}
            />
          ))}
        </div>
      ) : null}

      {link?.kind === 'video' ? (
        <MediaSlot
          kind="embed"
          src={link.embedUrl}
          alt={t('lite.embedLabel')}
          estBytes={estimateEmbedBytes(link.provider)}
          prefs={litePrefs}
        >
          <EmbedFrame provider={link.provider} embedUrl={link.embedUrl} />
        </MediaSlot>
      ) : (
        plainLink
      )}

      {view.tags.length > 0 ? (
        <div className="xidig-chip-row">
          {view.tags.map((tag) => (
            <span key={tag.id} className="xidig-tag">
              {`#${tag.name}`}
            </span>
          ))}
        </div>
      ) : null}

      {view.poll ? (
        <PollBlock
          postId={post.id}
          poll={view.poll}
          pollStatus={post.poll_status ?? 'closed'}
          pollClosesAt={post.poll_closes_at}
          isAuthor={isOwn}
        />
      ) : null}

      <ReactionBar
        targetKind="post"
        targetId={post.id}
        counts={view.reactions}
        mine={view.myReactions}
      />
      <p className="xidig-card__meta">
        <Link href={permalink}>{t('plaza.commentsCount', { count: view.commentCount })}</Link>
      </p>
      <div className="xidig-profile__actions">
        <BookmarkButton
          entityType="post"
          entityId={post.id}
          initialBookmarked={view.bookmarked}
          signedIn
        />
        {detail && canSeeHistory && revisionCount > 0 ? (
          <PostHistory postId={post.id} count={revisionCount} />
        ) : null}
      </div>
      <ShareActions path={permalink} text={post.title ?? post.body.slice(0, 80)} />
    </article>
  );
}
