'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';
import type { Translator } from '@xidig/i18n';

import { Avatar } from '@/components/media/avatar';
import { EmptyState } from '@/components/empty-state';
import { LoadingFlap } from '@/components/loading-flap';
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
 *
 * `variant="module"` (Munaasabado Task 10, frame 9c "Kula talin"): the
 * compact ONE-person card for the Madal rail / mobile-inline slot. Quiet in
 * EVERY non-content state — including loading: the grid keeps its
 * LoadingFlap (it IS the page there), but a rail module that flaps beside a
 * quiet-when-empty mentor card would announce its own absence, so it renders
 * nothing until content exists. Reasons stay mandatory: a suggestion with
 * zero reasons never renders (the API already drops them — this is the
 * client-side belt to the same acceptance criterion).
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
  variant = 'grid',
}: {
  /** Include Lab suggestions (off where LabsSeekingYou already renders). */
  showLabs?: boolean;
  /** Sparse data renders invite-your-people copy instead of collapsing. */
  showEmptyState?: boolean;
  /** 'module' = the frame-9c one-person rail card; 'grid' = existing card grid. */
  variant?: 'grid' | 'module';
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
    // Module: nothing until content exists (see header comment); grid keeps
    // the flap because there it stands in for the surface itself.
    return variant === 'module' ? null : <LoadingFlap />;
  }

  const people = payload.people.filter((person) => !skippedPeople.has(person.user_id));

  if (variant === 'module') {
    // First suggestion that can NAME its reason — reasons are mandatory, so a
    // zero-reason person is skipped entirely rather than shown unexplained.
    const person = people.find((candidate) => candidate.reasons.length > 0);
    if (!person) return null;
    const meta = [
      `@${person.handle}`,
      [person.location_city, person.location_country].filter(Boolean).join(', '),
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      // A plain card, not a landmark — the surrounding rail <aside> / feed
      // <li> owns the structure (mentor-residence-card precedent). Card
      // shell + uppercase label reuse the event-detail rail classes: same
      // silhouette in the frame.
      <div className="xidig-event-detail__card xidig-suggest-module">
        <h2 className="xidig-event-detail__label">{t('matching.suggestModuleTitle')}</h2>
        <div className="xidig-suggest-module__row">
          <Avatar
            name={person.display_name}
            handle={person.handle}
            src={person.avatar_thumb_url}
            blurhash={person.avatar_blurhash}
            size={34}
          />
          <span className="xidig-event-host__lines">
            <Link href={`/u/${person.handle}`} className="xidig-event-host">
              <span className="xidig-event-host__name">
                {person.display_name}
              </span>
            </Link>
            <span className="xidig-event-host__stat">{meta}</span>
          </span>
          <FollowButton targetUserId={person.user_id} initialFollowing={false} />
        </div>
        {/* The visible "why": Sababta + the same reasonCopy() chips the grid
            wears — the reason IS the ranking, nothing hidden. */}
        <p className="xidig-chip-row">
          <span className="xidig-suggest-module__prefix">{t('matching.reasonsPrefix')}</span>
          {person.reasons.slice(0, REASONS_SHOWN).map((reason) => (
            <span key={`${reason.kind}:${reason.value ?? ''}`} className="xidig-tag">
              {reasonCopy(t, reason)}
            </span>
          ))}
        </p>
        <p className="xidig-event-detail__note">{t('matching.privacyNote')}</p>
        <div className="xidig-suggest-card__actions">
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            onClick={() => setSkippedPeople((current) => new Set([...current, person.user_id]))}
          >
            {t('matching.skip')}
          </button>
        </div>
      </div>
    );
  }

  const labs = showLabs ? payload.labs.filter((lab) => !skippedLabs.has(lab.lab_id)) : [];

  if (people.length === 0 && labs.length === 0) {
    if (!showEmptyState) return null;
    // Onboarding teaching empty state — route through the shared EmptyState so
    // it wears the controlled brand mark like every other empty surface (was a
    // hand-rolled card that missed the marker the rest get for free).
    return (
      <EmptyState
        titleKey="matching.suggestEmptyTitle"
        messageKey="matching.suggestEmptyBody"
        action={
          <Link href="/settings/account" className="xidig-button xidig-button--secondary">
            {t('matching.suggestEmptyCta')} →
          </Link>
        }
      />
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
