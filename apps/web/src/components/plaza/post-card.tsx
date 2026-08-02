'use client';

import Link from 'next/link';
import { useState } from 'react';

import { formatRelativeTime, type MessageKey } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { Avatar } from '@/components/media/avatar';
import { ContentSourceBadge } from '@/components/content-source-badge';
import { XidigIcon } from '@/components/icons/XidigIcon';
import { XIDIG_POST_TYPE_ICON } from '@/components/icons/paths';
import { MediaSlot } from '@/components/media/media-slot';
import { ShareActions } from '@/components/share-actions';
import { BookmarkButton } from '@/components/social/bookmark-button';
import { SystemNotice } from '@/components/system-notice';
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
 * Authors see their own hidden/removed status as a SystemNotice — the system
 * voice, visually distinct from their own content (DESIGN.md §4), with an
 * appeal link on removal (§19/§27); everyone else never receives those rows
 * at all (RLS).
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

  const verified =
    author?.verification_status === 'community_verified' ||
    author?.verification_status === 'identity_verified';

  // Feed cards clamp the body to 4 lines (detail pages NEVER clamp). CSS
  // line-clamp can't report overflow without client measurement, so the
  // "Read more" escape hatch uses a cheap server-safe heuristic: long text or
  // many hard line breaks. A rare short-but-clamped body still links out via
  // the title/comments; a rare unclamped "Read more" is harmless.
  const mayClamp = !detail && (post.body.length > 280 || post.body.split('\n').length > 4);
  const latestComment = detail ? null : (view.latestComment ?? null);

  return (
    <article className="xidig-card">
      <div className="xidig-card__top">
        <div className="xidig-byline">
          {author ? (
            <Link
              href={`/u/${author.handle}`}
              className={`xidig-byline__avatar${verified ? ' xidig-byline__avatar--verified' : ''}`}
              aria-label={author.display_name}
            >
              <Avatar
                name={author.display_name}
                handle={author.handle}
                src={author.avatar_thumb_url}
                blurhash={author.avatar_blurhash}
                size={40}
                prefs={litePrefs}
              />
              {verified ? (
                <span
                  className="xidig-byline__check"
                  title={
                    author.verification_status === 'identity_verified'
                      ? t('profile.badgeIdentityVerified')
                      : t('profile.verifStatusCommunity')
                  }
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              ) : null}
            </Link>
          ) : null}
          <p className="xidig-card__meta xidig-byline__text">
            {author ? (
              <Link className="xidig-byline__name" href={`/u/${author.handle}`}>
                {author.display_name}
              </Link>
            ) : null}
            {/* Diaspora geography in every byline (brand-rethink adoption):
                profile city when set — "Ayaan · Toronto · 2h". */}
            {author?.location_city ? ` · ${author.location_city}` : null}
            {author ? ' · ' : null}
            {formatRelativeTime(new Date(post.created_at), locale)}
          </p>
        </div>
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
        <span className={`xidig-tag xidig-post-type xidig-post-type--${post.type}`}>
          {/* D3 glyph (docs/d3-icon-handoff): decorative — the text label is
              adjacent, so no `label` (icon renders aria-hidden). tone="inherit"
              keeps icon+text on the chip's own color (Guul's chip already rides
              the trust treatment; the icon must match its text exactly). */}
          <XidigIcon
            name={XIDIG_POST_TYPE_ICON[post.type]}
            variant="filled"
            size={14}
            tone="inherit"
            className="x-ic--lead"
          />
          {t(TYPE_KEYS[post.type])}
        </span>
        <ContentSourceBadge source={post.source} />
        {post.pinned_at ? <span className="xidig-tag">{t('plaza.pinned')}</span> : null}
        {post.ask_status ? (
          <span className="xidig-tag">{t(ASK_STATUS_KEYS[post.ask_status])}</span>
        ) : null}
        {post.edited_at ? <span className="xidig-card__meta">{t('plaza.edited')}</span> : null}
      </p>

      {isOwn && post.status === 'hidden' ? (
        <SystemNotice tone="info" messageKey="plaza.hiddenOwn" />
      ) : null}
      {isOwn && post.status === 'removed' ? (
        <SystemNotice
          tone="moderation"
          messageKey="plaza.removedOwn"
          link={{ href: '/support/appeal', textKey: 'plaza.removedOwnLinkText' }}
        />
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

          <p className={detail ? 'xidig-card__body' : 'xidig-card__body xidig-post-body--clamp'}>
            {post.body}
          </p>
          {mayClamp ? (
            <p className="xidig-card__meta xidig-post-readmore">
              <Link href={permalink}>{t('plaza.readMore')}</Link>
            </p>
          ) : null}
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
      <div className="xidig-post-footer">
        <Link
          className="xidig-icon-button xidig-post-comments"
          href={permalink}
          aria-label={t('plaza.commentsCount', { count: view.commentCount })}
          title={t('plaza.commentsCount', { count: view.commentCount })}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5a8.5 8.5 0 0 1-.9-4 8.38 8.38 0 0 1 8.5-8.5A8.5 8.5 0 0 1 21 11.5z" />
          </svg>
          <span className="xidig-post-comments__n">{view.commentCount}</span>
        </Link>
        <span className="xidig-post-footer__spacer" />
        <BookmarkButton
          entityType="post"
          entityId={post.id}
          initialBookmarked={view.bookmarked}
          signedIn
        />
        {detail && canSeeHistory && revisionCount > 0 ? (
          <PostHistory postId={post.id} count={revisionCount} />
        ) : null}
        <ShareActions path={permalink} text={post.title ?? post.body.slice(0, 80)} />
      </div>

      {/* Newest-comment teaser (feed cards only): tiny avatar + name + one-line
          snippet, the whole row a link into the thread. Author may be null
          (deactivated) — the snippet still shows, unattributed. */}
      {latestComment ? (
        <Link href={permalink} className="xidig-post-latest">
          <span className="xidig-visually-hidden">{t('plaza.latestComment')}: </span>
          {latestComment.author ? (
            <>
              <Avatar
                name={latestComment.author.display_name}
                handle={latestComment.author.handle}
                src={latestComment.author.avatar_thumb_url}
                blurhash={latestComment.author.avatar_blurhash}
                size={20}
                prefs={litePrefs}
              />
              <span className="xidig-post-latest__name">
                {latestComment.author.display_name}
              </span>
            </>
          ) : null}
          <span className="xidig-post-latest__snippet">{latestComment.snippet}</span>
        </Link>
      ) : null}
    </article>
  );
}
