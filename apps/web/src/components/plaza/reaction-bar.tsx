'use client';

import { useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { REACTION_TYPES, type ReactionCounts, type ReactionType } from '@/lib/plaza/views';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * §20 reaction taxonomy — five named reactions, never a generic "like".
 * Toggles are optimistic: flip locally, then PUT/DELETE; on failure revert
 * and show the server's §27 copy.
 */

const REACTION_EMOJI: Record<ReactionType, string> = {
  fire: '🔥',
  strong: '💪',
  mashallah: '🤲',
  idea: '💡',
  watching: '👀',
};

const REACTION_LABEL_KEYS: Record<ReactionType, MessageKey> = {
  fire: 'plaza.reactionFire',
  strong: 'plaza.reactionStrong',
  mashallah: 'plaza.reactionMashallah',
  idea: 'plaza.reactionIdea',
  watching: 'plaza.reactionWatching',
};

export function ReactionBar({
  targetKind,
  targetId,
  counts,
  mine,
}: {
  targetKind: 'post' | 'comment';
  targetId: string;
  counts: ReactionCounts;
  mine: ReactionType[];
}) {
  const t = useT();
  const [localCounts, setLocalCounts] = useState<ReactionCounts>(counts);
  const [localMine, setLocalMine] = useState<ReactionType[]>(mine);
  const [error, setError] = useState<PlainError | null>(null);

  async function toggle(type: ReactionType) {
    const previousCounts = localCounts;
    const previousMine = localMine;
    const hadIt = localMine.includes(type);

    setError(null);
    setLocalMine(hadIt ? localMine.filter((item) => item !== type) : [...localMine, type]);
    setLocalCounts({
      ...localCounts,
      [type]: Math.max(0, localCounts[type] + (hadIt ? -1 : 1)),
    });

    const path = `/api/${targetKind === 'post' ? 'posts' : 'comments'}/${targetId}/reactions/${type}`;
    try {
      if (hadIt) await apiDelete<{ reacted: boolean }>(path);
      else await apiPut<{ reacted: boolean }>(path);
    } catch (cause) {
      setLocalCounts(previousCounts);
      setLocalMine(previousMine);
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    }
  }

  return (
    <>
      <div className="xidig-reactions">
        {REACTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="xidig-reaction"
            aria-pressed={localMine.includes(type)}
            aria-label={t(REACTION_LABEL_KEYS[type])}
            onClick={() => void toggle(type)}
          >
            <span aria-hidden="true">{REACTION_EMOJI[type]}</span>
            {localCounts[type] > 0 ? <span>{localCounts[type]}</span> : null}
          </button>
        ))}
      </div>
      {error ? <PlainErrorBanner error={error} /> : null}
    </>
  );
}
