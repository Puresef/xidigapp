'use client';

import Link from 'next/link';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';
import type { MessageKey } from '@xidig/i18n';

import { CHROME_KEYS, STAGE_KEYS } from '@/lib/labs/labels';
import type { LitePrefs } from '@/lib/lite/prefs';
import { Avatar } from '../media/avatar';
import { MediaSlot } from '../media/media-slot';
import { Excerpt, Highlight } from './highlight';
import type { SearchLab, SearchListing, SearchPerson, SearchPost } from './types';

/**
 * The four result-row shapes. Each is one link surface inside its group's
 * card: identity first, then a meta line of whatever context the row
 * actually has, then the member's own words with their term marked.
 *
 * Rows never invent content. Every optional line — a bio, a category, a
 * photo, a byline, a tag — renders only when the projection supplied it, so a
 * sparse row is short rather than padded with placeholders.
 */

const POST_TYPE_KEYS: Record<string, MessageKey> = {
  intro: 'plaza.typeIntro',
  ask: 'plaza.typeAsk',
  win: 'plaza.typeWin',
  update: 'plaza.typeUpdate',
  poll: 'plaza.typePoll',
};

/** Thumb WebP (480px pipeline) — the only asset a result row ever loads. */
const LISTING_THUMB_EST_BYTES = 30_000;

/** Body preview budget in the post row — two comfortable lines. */
const EXCERPT_CHARS = 150;

const PROFILE_VERIFIED = ['community_verified', 'identity_verified'];

/** Joins the parts of a meta line, dropping the ones this row doesn't have. */
function metaLine(parts: (string | null | undefined | false)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

function CheckBadge({ size }: { size: number }) {
  return (
    <span className="xidig-byline__check">
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

function ReplyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function PersonRow({
  person,
  query,
  prefs,
}: {
  person: SearchPerson;
  query: string;
  prefs: LitePrefs;
}) {
  const verified = PROFILE_VERIFIED.includes(person.verificationStatus);
  return (
    <li className="xidig-search-row">
      <Link className="xidig-search-row__link" href={`/u/${person.handle}`}>
        <span
          className={`xidig-byline__avatar${verified ? ' xidig-byline__avatar--verified' : ''}`}
        >
          <Avatar
            name={person.displayName}
            handle={person.handle}
            src={person.avatarThumbUrl}
            blurhash={person.avatarBlurhash}
            size={40}
            prefs={prefs}
          />
          {verified ? <CheckBadge size={9} /> : null}
        </span>
        <span className="xidig-search-row__body">
          <span className="xidig-search-row__title">
            <Highlight text={person.displayName} query={query} />
          </span>
          <span className="xidig-search-row__meta">
            {metaLine([`@${person.handle}`, person.locationCity, person.locationCountry])}
          </span>
          {person.bio ? (
            <span className="xidig-search-row__snippet">
              <Highlight text={person.bio} query={query} />
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function ListingRow({
  listing,
  query,
  prefs,
}: {
  listing: SearchListing;
  query: string;
  prefs: LitePrefs;
}) {
  const t = useT();
  const { locale } = useLocale();
  const category =
    listing.categoryName === null
      ? null
      : locale === 'so'
        ? (listing.categoryName.so ?? listing.categoryName.en)
        : listing.categoryName.en;
  return (
    <li className="xidig-search-row">
      <Link className="xidig-search-row__link" href={`/l/${listing.id}`}>
        {listing.photoThumbUrl ? (
          <MediaSlot
            kind="image"
            src={listing.photoThumbUrl}
            blurhash={listing.photoBlurhash}
            alt={listing.photoAlt ?? listing.businessName}
            estBytes={LISTING_THUMB_EST_BYTES}
            prefs={prefs}
            className="xidig-search-row__thumb"
          />
        ) : null}
        <span className="xidig-search-row__body">
          <span className="xidig-search-row__title">
            <Highlight text={listing.businessName} query={query} />{' '}
            {listing.verificationStatus === 'verified' ? (
              <span className="xidig-tag xidig-tag--trust">{t('settings.statusVerified')}</span>
            ) : null}
          </span>
          <span className="xidig-search-row__meta">
            {metaLine([
              category,
              listing.city,
              listing.country,
              listing.priceRange ? '$'.repeat(listing.priceRange) : null,
            ])}
          </span>
          {listing.shortDescription ? (
            <span className="xidig-search-row__snippet">
              <Highlight text={listing.shortDescription} query={query} />
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function SpaceRow({ lab, query }: { lab: SearchLab; query: string }) {
  const t = useT();
  return (
    <li className="xidig-search-row">
      <Link className="xidig-search-row__link" href={`/labs/${lab.slug}`}>
        <span className="xidig-search-row__body">
          <span className="xidig-search-row__title">
            <Highlight text={lab.name} query={query} />{' '}
            <span className="xidig-tag">
              {lab.spaceMode === 'club' || lab.spaceMode === 'lab'
                ? t(CHROME_KEYS[lab.spaceMode])
                : lab.spaceMode}
            </span>
          </span>
          <span className="xidig-search-row__meta">
            {metaLine([
              lab.stage in STAGE_KEYS
                ? t(STAGE_KEYS[lab.stage as keyof typeof STAGE_KEYS])
                : lab.stage,
              t('lab.memberCount', { count: lab.memberCount }),
            ])}
          </span>
          {lab.shortDescription ? (
            <span className="xidig-search-row__snippet">
              <Highlight text={lab.shortDescription} query={query} />
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function PostRow({
  post,
  query,
  prefs,
}: {
  post: SearchPost;
  query: string;
  prefs: LitePrefs;
}) {
  const t = useT();
  const { locale } = useLocale();
  const author = post.author;
  const verified = author !== null && PROFILE_VERIFIED.includes(author.verificationStatus);
  const typeKey = POST_TYPE_KEYS[post.type];
  return (
    <li className="xidig-search-row">
      <Link
        className="xidig-search-row__link xidig-search-row__link--stacked"
        href={`/p/${post.id}`}
      >
        <span className="xidig-search-post__byline">
          {author ? (
            <>
              <span
                className={`xidig-byline__avatar${
                  verified ? ' xidig-byline__avatar--verified' : ''
                }`}
              >
                <Avatar
                  name={author.displayName}
                  handle={author.handle}
                  src={author.avatarThumbUrl}
                  blurhash={author.avatarBlurhash}
                  size={28}
                  prefs={prefs}
                />
                {verified ? <CheckBadge size={8} /> : null}
              </span>
              <span className="xidig-byline__name">{author.displayName}</span>
            </>
          ) : null}
          <span className="xidig-search-row__meta">
            {metaLine([
              author ? `@${author.handle}` : null,
              author?.locationCity,
              formatRelativeTime(new Date(post.createdAt), locale),
            ])}
          </span>
          {typeKey ? <span className="xidig-tag xidig-search-post__type">{t(typeKey)}</span> : null}
        </span>
        <span className="xidig-search-post__title">
          <Highlight text={post.title} query={query} />
        </span>
        {post.body ? (
          <span className="xidig-search-post__excerpt">
            <Excerpt text={post.body} query={query} maxChars={EXCERPT_CHARS} />
          </span>
        ) : null}
        {post.tags.length > 0 || post.replyCount > 0 ? (
          <span className="xidig-search-post__foot">
            {post.tags.map((tag) => (
              <span key={tag.id} className="xidig-tag">
                #{tag.name}
              </span>
            ))}
            {post.replyCount > 0 ? (
              <span
                className="xidig-search-post__replies"
                role="img"
                aria-label={t('plaza.commentsCount', { count: post.replyCount })}
              >
                <ReplyIcon />
                <span aria-hidden="true">{post.replyCount}</span>
              </span>
            ) : null}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
