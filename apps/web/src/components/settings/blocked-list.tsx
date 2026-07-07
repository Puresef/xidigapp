'use client';

import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiDelete, apiGet, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { Avatar } from '../media/avatar';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Blocked members (Settings → Privacy & Safety). List from GET /api/blocks,
 * unblock via the existing DELETE /api/blocks/[userId] (idempotent). A failed
 * unblock puts the row back — the block must never LOOK lifted while it
 * still stands.
 */

interface BlockedMember {
  userId: string;
  displayName: string | null;
  handle: string | null;
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
  blockedAt: string;
}

export function BlockedList() {
  const t = useT();

  const [blocks, setBlocks] = useState<BlockedMember[] | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ blocks: BlockedMember[] }>('/api/blocks')
      .then((data) => {
        if (!cancelled) setBlocks(data.blocks);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function unblock(member: BlockedMember) {
    setBusyId(member.userId);
    setError(null);
    setBlocks((current) => (current ?? []).filter((row) => row.userId !== member.userId));
    try {
      await apiDelete(`/api/blocks/${member.userId}`);
    } catch (cause) {
      // Roll back — the block still stands.
      setBlocks((current) => [member, ...(current ?? [])]);
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setBusyId(null);
    }
  }

  if (error && blocks === null) return <PlainErrorBanner error={error} />;
  if (blocks === null) return <p className="xidig-field__hint">{t('state.loading')}</p>;
  if (blocks.length === 0) return <p className="xidig-field__hint">{t('settings.blockedEmpty')}</p>;

  return (
    <>
      {error ? <PlainErrorBanner error={error} /> : null}
      <ul className="xidig-block-list">
        {blocks.map((member) => {
          const name = member.displayName ?? t('settings.blockedUnknownMember');
          return (
            <li key={member.userId} className="xidig-block-list__item">
              <Avatar
                name={name}
                handle={member.handle ?? member.userId}
                src={member.avatarThumbUrl}
                blurhash={member.avatarBlurhash}
                size={32}
              />
              <span className="xidig-block-list__who">
                <span>{name}</span>
                {member.handle ? (
                  <span className="xidig-block-list__handle">@{member.handle}</span>
                ) : null}
              </span>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={busyId === member.userId}
                onClick={() => void unblock(member)}
              >
                {t('settings.unblock')}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
