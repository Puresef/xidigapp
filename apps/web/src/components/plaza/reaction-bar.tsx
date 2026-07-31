'use client';

import { useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import { ApiRequestError, apiDelete, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { REACTION_TYPES, type ReactionCounts, type ReactionType } from '@/lib/plaza/views';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * §20 reaction taxonomy — five named reactions, never a generic "like".
 * Toggles are optimistic: flip locally, then PUT/DELETE; on failure revert
 * and show the server's §27 copy.
 *
 * ANTI-ANCHORING (31 Jul decision): reaction COUNTS render only when the
 * viewer has reacted on this target (`localMine.length > 0`). Non-reactors
 * see which reaction types are in play — emoji chips, no numbers — plus the
 * add trigger, so nobody's first read of a post is anchored by its score.
 * React once and every chip's count unlocks (the rule is per-post, not
 * per-type). Applies everywhere the bar renders: feed cards AND detail.
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
  const [pickerOpen, setPickerOpen] = useState(false);

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
      else {
        await apiPut<{ reacted: boolean }>(path);
        trackClient('reaction_added', { type });
      }
    } catch (cause) {
      setLocalCounts(previousCounts);
      setLocalMine(previousMine);
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    }
  }

  // Only reactions with a count — or ones the viewer picked — render as chips;
  // the rest stay behind the "+ React" trigger so a post with no reactions
  // isn't five empty emoji.
  const active = REACTION_TYPES.filter((type) => localCounts[type] > 0 || localMine.includes(type));

  // Anti-anchoring gate (see module doc): numbers only after the viewer reacts.
  const showCounts = localMine.length > 0;

  function pick(type: ReactionType) {
    setPickerOpen(false);
    void toggle(type);
  }

  return (
    <>
      <div className="xidig-reactions">
        {active.map((type) => (
          <button
            key={type}
            type="button"
            className="xidig-reaction"
            aria-pressed={localMine.includes(type)}
            aria-label={t(REACTION_LABEL_KEYS[type])}
            onClick={() => void toggle(type)}
          >
            <span aria-hidden="true">{REACTION_EMOJI[type]}</span>
            {showCounts && localCounts[type] > 0 ? <span>{localCounts[type]}</span> : null}
          </button>
        ))}
        <div className="xidig-reaction-add">
          <button
            type="button"
            className="xidig-reaction xidig-reaction--add"
            aria-haspopup="true"
            aria-expanded={pickerOpen}
            aria-label={t('plaza.addReaction')}
            title={t('plaza.addReaction')}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 14.5a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
            </svg>
          </button>
          {pickerOpen ? (
            <div className="xidig-reaction-picker" role="menu">
              {REACTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  className={`xidig-reaction-picker__opt${localMine.includes(type) ? ' xidig-reaction-picker__opt--on' : ''}`}
                  aria-label={t(REACTION_LABEL_KEYS[type])}
                  title={t(REACTION_LABEL_KEYS[type])}
                  onClick={() => pick(type)}
                >
                  <span aria-hidden="true">{REACTION_EMOJI[type]}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {error ? <PlainErrorBanner error={error} /> : null}
    </>
  );
}
