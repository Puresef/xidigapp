'use client';

import { useEffect, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Pins picker (Phase 4.5 §4, /settings/profile): choose up to 3 of your own
 * recent posts, led Spaces, or listings to pin to /u/[handle]. Order in the
 * list = display order (position 1..3); reorder via up/down buttons (§22 —
 * keyboard-first, no drag dependency). Saves the whole set in one
 * PUT /api/me/profile/pins.
 */

type PinEntityType = 'post' | 'lab' | 'listing';

interface SelectedPin {
  entityType: PinEntityType;
  entityId: string;
  label: string;
}

interface HydratedPin {
  entityType: PinEntityType;
  entityId: string;
  position: number;
  title?: string | null;
  body?: string;
  name?: string;
  businessName?: string;
}

interface Candidates {
  posts: { id: string; title: string | null; body: string }[];
  labs: { id: string; name: string }[];
  listings: { id: string; business_name: string }[];
}

const MAX_PINS = 3;

function pinLabel(pin: HydratedPin): string {
  if (pin.entityType === 'post') return pin.title?.trim() || pin.body || pin.entityId;
  if (pin.entityType === 'lab') return pin.name ?? pin.entityId;
  return pin.businessName ?? pin.entityId;
}

export function PinsPicker() {
  const t = useT();

  const [selected, setSelected] = useState<SelectedPin[]>([]);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<{ pins: HydratedPin[]; candidates: Candidates }>(
          '/api/me/profile/pins',
        );
        if (cancelled) return;
        setSelected(
          data.pins.map((pin) => ({
            entityType: pin.entityType,
            entityId: pin.entityId,
            label: pinLabel(pin),
          })),
        );
        setCandidates(data.candidates);
        setLoaded(true);
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isSelected = (entityType: PinEntityType, entityId: string) =>
    selected.some((pin) => pin.entityType === entityType && pin.entityId === entityId);

  function add(entityType: PinEntityType, entityId: string, label: string) {
    setNotice(null);
    setSelected((current) => {
      if (current.length >= MAX_PINS) return current;
      if (current.some((pin) => pin.entityType === entityType && pin.entityId === entityId)) {
        return current;
      }
      return [...current, { entityType, entityId, label }];
    });
  }

  function remove(index: number) {
    setNotice(null);
    setSelected((current) => current.filter((_, i) => i !== index));
  }

  function move(index: number, delta: -1 | 1) {
    setNotice(null);
    setSelected((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row!);
      return next;
    });
  }

  async function save() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await apiPut('/api/me/profile/pins', {
        pins: selected.map((pin) => ({ entityType: pin.entityType, entityId: pin.entityId })),
      });
      setNotice(t('profile.pinsSaved'));
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  const candidateGroups: { titleKey: MessageKey; rows: SelectedPin[] }[] =
    candidates === null
      ? []
      : [
          {
            titleKey: 'profile.pinsPickerPosts' as MessageKey,
            rows: candidates.posts.map((post) => ({
              entityType: 'post' as const,
              entityId: post.id,
              label: post.title?.trim() || post.body,
            })),
          },
          {
            titleKey: 'profile.pinsPickerLabs' as MessageKey,
            rows: candidates.labs.map((lab) => ({
              entityType: 'lab' as const,
              entityId: lab.id,
              label: lab.name,
            })),
          },
          {
            titleKey: 'profile.pinsPickerListings' as MessageKey,
            rows: candidates.listings.map((listing) => ({
              entityType: 'listing' as const,
              entityId: listing.id,
              label: listing.business_name,
            })),
          },
        ];

  return (
    <section className="xidig-section" aria-label={t('profile.pinsTitle')}>
      <h2 className="xidig-section__title">{t('profile.pinsTitle')}</h2>
      <p className="xidig-field__hint">{t('profile.pinsHint')}</p>

      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}
      {!loaded ? <p className="xidig-card__meta">{t('state.loading')}</p> : null}

      {loaded ? (
        <>
          {selected.length === 0 ? (
            <p className="xidig-card__meta">{t('profile.pinsEmpty')}</p>
          ) : (
            <ol className="xidig-pins-editor">
              {selected.map((pin, index) => (
                <li key={`${pin.entityType}:${pin.entityId}`} className="xidig-pins-editor__row">
                  <span className="xidig-pins-editor__label">{pin.label}</span>
                  <span className="xidig-pins-editor__actions">
                    <button
                      type="button"
                      className="xidig-button xidig-button--secondary"
                      aria-label={t('a11y.moveUp')}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="xidig-button xidig-button--secondary"
                      aria-label={t('a11y.moveDown')}
                      disabled={index === selected.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="xidig-button xidig-button--secondary"
                      aria-label={t('a11y.removeRow')}
                      onClick={() => remove(index)}
                    >
                      {t('action.remove')}
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {selected.length >= MAX_PINS ? (
            <p className="xidig-card__meta">{t('profile.pinsMax')}</p>
          ) : null}

          {candidateGroups.map((group) =>
            group.rows.length > 0 ? (
              <div key={group.titleKey} className="xidig-field">
                <p className="xidig-field__label">{t(group.titleKey)}</p>
                <ul className="xidig-pins-editor">
                  {group.rows
                    .filter((row) => !isSelected(row.entityType, row.entityId))
                    .map((row) => (
                      <li
                        key={`${row.entityType}:${row.entityId}`}
                        className="xidig-pins-editor__row"
                      >
                        <span className="xidig-pins-editor__label">{row.label}</span>
                        <button
                          type="button"
                          className="xidig-button xidig-button--secondary"
                          disabled={selected.length >= MAX_PINS}
                          onClick={() => add(row.entityType, row.entityId, row.label)}
                        >
                          {t('profile.pinAction')}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null,
          )}

          <button
            type="button"
            className="xidig-button xidig-button--primary"
            disabled={pending}
            onClick={() => void save()}
          >
            {t('action.save')}
          </button>
        </>
      ) : null}
    </section>
  );
}
