'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { Avatar } from '@/components/media/avatar';
import { apiGet } from '@/lib/api-client';
import { FollowButton } from './follow-button';

/**
 * "People to follow" module (Phase 4.5 §4): shared lanes/skills + same-city +
 * verified scoring from GET /api/me/suggested-follows. Used on the empty
 * following feed (and reusable on Home). Deliberately quiet on failure — a
 * broken suggestion module must never block the surface it decorates, so
 * errors collapse to nothing instead of a banner.
 */

interface Suggestion {
  user_id: string;
  display_name: string;
  handle: string;
  bio: string | null;
  location_city: string | null;
  location_country: string | null;
  lanes: string[];
  verification_status: string;
  avatar_thumb_url: string | null;
  avatar_blurhash: string | null;
  shared_lanes: string[];
  same_city: boolean;
}

export function SuggestedFollows() {
  const t = useT();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await apiGet<{ suggestions: Suggestion[] }>('/api/me/suggested-follows');
        if (!cancelled) setSuggestions(page.suggestions);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  if (suggestions === null) {
    return <p className="xidig-card__meta">{t('state.loading')}</p>;
  }
  if (suggestions.length === 0) return null;

  return (
    <section className="xidig-section" aria-label={t('profile.suggestedFollowsTitle')}>
      <h2 className="xidig-section__title">{t('profile.suggestedFollowsTitle')}</h2>
      <p className="xidig-card__meta">{t('profile.suggestedFollowsHint')}</p>
      <ul className="xidig-card-grid">
        {suggestions.map((person) => (
          <li key={person.user_id} className="xidig-card xidig-suggest-card">
            <div className="xidig-suggest-card__identity">
              <Avatar
                name={person.display_name}
                handle={person.handle}
                src={person.avatar_thumb_url}
                blurhash={person.avatar_blurhash}
                size={40}
              />
              <div>
                <h3 className="xidig-card__title">
                  <Link href={`/u/${person.handle}`}>{person.display_name}</Link>
                </h3>
                <p className="xidig-card__meta">@{person.handle}</p>
              </div>
            </div>
            {person.location_city || person.location_country ? (
              <p className="xidig-card__meta">
                {[person.location_city, person.location_country].filter(Boolean).join(', ')}
              </p>
            ) : null}
            {person.shared_lanes.length > 0 ? (
              <p className="xidig-chip-row">
                {person.shared_lanes.slice(0, 3).map((lane) => (
                  <span key={lane} className="xidig-tag">
                    {lane}
                  </span>
                ))}
              </p>
            ) : null}
            <FollowButton targetUserId={person.user_id} initialFollowing={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}
