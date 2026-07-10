'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';
import type { Translator } from '@xidig/i18n';

import { Avatar } from '@/components/media/avatar';
import { apiGet } from '@/lib/api-client';
import { OPEN_TO_KEYS } from './open-to';
import { FollowButton } from './follow-button';

/**
 * Interest-based follow suggestions (extras plan item 4): people + Labs from
 * GET /api/me/suggested-follows, DECLARED fields only. Every card names its
 * reason as visible copy ("Shares your fintech lane") — the reason IS the
 * ranking, nothing hidden. Follow uses the existing follows API via
 * FollowButton; Skip is a client-side dismiss (no tracking table — a refresh
 * forgets it, deliberately).
 *
 * Two temperaments, one component:
 * - decoration (empty Following feed): quiet — errors and empty results
 *   collapse to nothing so a broken module never blocks its host surface.
 * - onboarding (`showEmptyState`): teaching — sparse declared data renders
 *   the invite-your-people card instead of fake suggestions.
 */

interface ReasonPayload {
  kind:
    | 'shares_lane'
    | 'shares_skill'
    | 'same_city'
    | 'same_country'
    | 'shares_open_to'
    | 'they_hiring'
    | 'you_hiring';
  value?: string;
}

interface PersonPayload {
  user_id: string;
  display_name: string;
  handle: string;
  location_city: string | null;
  location_country: string | null;
  avatar_thumb_url: string | null;
  avatar_blurhash: string | null;
  reasons: ReasonPayload[];
}

interface LabPayload {
  lab_id: string;
  slug: string;
  name: string;
  short_description: string | null;
  matched_skills: string[];
}

interface SuggestionsPayload {
  people: PersonPayload[];
  labs: LabPayload[];
}

const REASONS_SHOWN = 2;

function reasonCopy(t: Translator, reason: ReasonPayload): string {
  switch (reason.kind) {
    case 'shares_lane':
      return t('matching.reasonSharesLane', { lane: reason.value ?? '' });
    case 'shares_skill':
      return t('matching.reasonSharesSkill', { skill: reason.value ?? '' });
    case 'same_city':
      return t('matching.reasonSameCity');
    case 'same_country':
      return t('matching.reasonSameCountry');
    case 'shares_open_to': {
      const key = reason.value ? OPEN_TO_KEYS[reason.value] : undefined;
      // Unknown slug (future seed) renders as-is — open-to.ts precedent.
      return t('matching.reasonSharesOpenTo', { label: key ? t(key) : (reason.value ?? '') });
    }
    case 'they_hiring':
      return t('matching.reasonTheyHiring');
    case 'you_hiring':
      return t('matching.reasonYouHiring');
  }
}

export function SuggestedFollows({
  showLabs = false,
  showEmptyState = false,
}: {
  /** Include Lab suggestions (off where LabsSeekingYou already renders). */
  showLabs?: boolean;
  /** Sparse data renders invite-your-people copy instead of collapsing. */
  showEmptyState?: boolean;
}) {
  const t = useT();
  const [payload, setPayload] = useState<SuggestionsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [skippedPeople, setSkippedPeople] = useState<ReadonlySet<string>>(new Set());
  const [skippedLabs, setSkippedLabs] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const page = await apiGet<SuggestionsPayload>('/api/me/suggested-follows');
        if (!cancelled) setPayload(page);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  if (payload === null) {
    return <p className="xidig-card__meta">{t('state.loading')}</p>;
  }

  const people = payload.people.filter((person) => !skippedPeople.has(person.user_id));
  const labs = showLabs ? payload.labs.filter((lab) => !skippedLabs.has(lab.lab_id)) : [];

  if (people.length === 0 && labs.length === 0) {
    if (!showEmptyState) return null;
    return (
      <section className="xidig-section xidig-card" aria-label={t('matching.suggestEmptyTitle')}>
        <div className="xidig-card__body">
          <h2 className="xidig-card__title">{t('matching.suggestEmptyTitle')}</h2>
          <p className="xidig-card__meta">{t('matching.suggestEmptyBody')}</p>
          <Link href="/settings/account" className="xidig-button xidig-button--secondary">
            {t('matching.suggestEmptyCta')} →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="xidig-section" aria-label={t('profile.suggestedFollowsTitle')}>
      {people.length > 0 ? (
        <>
          <h2 className="xidig-section__title">{t('profile.suggestedFollowsTitle')}</h2>
          <p className="xidig-card__meta">{t('profile.suggestedFollowsHint')}</p>
          <ul className="xidig-card-grid">
            {people.map((person) => (
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
                {/* The visible "why": declared-field reasons, strongest first. */}
                <p className="xidig-chip-row">
                  {person.reasons.slice(0, REASONS_SHOWN).map((reason) => (
                    <span key={`${reason.kind}:${reason.value ?? ''}`} className="xidig-tag">
                      {reasonCopy(t, reason)}
                    </span>
                  ))}
                </p>
                <div className="xidig-suggest-card__actions">
                  <FollowButton targetUserId={person.user_id} initialFollowing={false} />
                  <button
                    type="button"
                    className="xidig-button xidig-button--secondary"
                    onClick={() =>
                      setSkippedPeople((current) => new Set([...current, person.user_id]))
                    }
                  >
                    {t('matching.skip')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {labs.length > 0 ? (
        <>
          <h2 className="xidig-section__title">{t('matching.labsSeekingTitle')}</h2>
          <p className="xidig-card__meta">{t('matching.labsSeekingBody')}</p>
          <ul className="xidig-card-grid">
            {labs.map((lab) => (
              <li key={lab.lab_id} className="xidig-card xidig-suggest-card">
                <h3 className="xidig-card__title">
                  <Link href={`/labs/${lab.slug}`}>{lab.name}</Link>
                </h3>
                {lab.short_description ? (
                  <p className="xidig-card__meta">{lab.short_description}</p>
                ) : null}
                <p className="xidig-chip-row">
                  {lab.matched_skills.slice(0, REASONS_SHOWN).map((skill) => (
                    <span key={skill} className="xidig-tag">
                      {t('matching.reasonLabSeeking', { skill })}
                    </span>
                  ))}
                </p>
                <div className="xidig-suggest-card__actions">
                  <Link href={`/labs/${lab.slug}`} className="xidig-button xidig-button--primary">
                    {t('matching.viewLab')}
                  </Link>
                  <button
                    type="button"
                    className="xidig-button xidig-button--secondary"
                    onClick={() => setSkippedLabs((current) => new Set([...current, lab.lab_id]))}
                  >
                    {t('matching.skip')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
