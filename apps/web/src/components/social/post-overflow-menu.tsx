'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';

/**
 * Post card overflow menu (Phase 4.5): author edit + viewer-side mutes.
 * Muting is private (never notifies) and takes effect on the next feed load —
 * the confirmation copy says so instead of yanking the card out from under
 * the reader. Reuses the DM menu chrome (.xidig-dm-menu) — same dropdown,
 * same keyboard/escape behaviour expectations.
 */
export function PostOverflowMenu({
  authorUserId,
  authorName,
  isOwn,
  tags,
  canEdit,
  onEdit,
}: {
  authorUserId: string;
  authorName: string;
  isOwn: boolean;
  tags: { id: string; name: string }[];
  /** Author on the detail page — shows the inline-edit entry. */
  canEdit: boolean;
  onEdit?: (() => void) | undefined;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const hasItems = canEdit || !isOwn || tags.length > 0;
  if (!hasItems) return null;

  function mute(entityType: 'user' | 'tag', entityId: string) {
    setError(null);
    apiPut(`/api/mutes/${entityType}/${entityId}`)
      .then(() => {
        setMuted(true);
        setOpen(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      });
  }

  if (muted) return <Banner kind="notice">{t('social.mutedNotice')}</Banner>;

  return (
    <div className="xidig-dm-menu">
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('social.postOptions')}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        ⋯
      </button>

      {open ? (
        <div className="xidig-dm-menu__panel" role="menu">
          {error ? <PlainErrorBanner error={error} /> : null}
          <ul className="xidig-dm-menu__list">
            {canEdit ? (
              <li>
                <button
                  type="button"
                  className="xidig-dm-menu__item"
                  onClick={() => {
                    setOpen(false);
                    onEdit?.();
                  }}
                >
                  {t('plaza.editPost')}
                </button>
              </li>
            ) : null}
            {!isOwn ? (
              <li>
                <button
                  type="button"
                  className="xidig-dm-menu__item"
                  onClick={() => mute('user', authorUserId)}
                >
                  {t('social.muteUser', { name: authorName })}
                </button>
              </li>
            ) : null}
            {tags.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  className="xidig-dm-menu__item"
                  onClick={() => mute('tag', tag.id)}
                >
                  {t('social.muteTag', { tag: tag.name })}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
