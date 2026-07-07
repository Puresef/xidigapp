'use client';

import { useState } from 'react';

import { LOCALE_NAMES } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPatch } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Human-in-the-loop moderation queue (§15/§24, Phase 2). Cards are AI
 * pre-scan escalations (flagged → auto-hidden, uncertain → still live);
 * decisions go through PATCH /api/admin/moderation/[id]. This is NOT the
 * Phase 6 member-reports queue — it only sees what the AI escalated, with
 * Somali-language content as the primary lane.
 */

export interface ReviewItem {
  id: string;
  entityType: string;
  entityId: string;
  reason: string;
  language: string | null;
  contentExcerpt: string | null;
  aiVerdict: {
    decision?: string;
    language?: string;
    categories?: string[];
    confidence?: number;
    model?: string;
  } | null;
  status: string;
  createdAt: string;
  author: { display_name: string; handle: string } | null;
  content: { currentStatus: string | null; url: string | null };
}

export function ModerationQueue({ initialItems }: { initialItems: ReviewItem[] }) {
  const t = useT();
  const [items, setItems] = useState<ReviewItem[]>(initialItems);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(id: string, decision: 'approved' | 'removed' | 'dismissed') {
    setPendingId(id);
    setError(null);
    setNotice(null);
    const snapshot = items;
    const note = (notes[id] ?? '').trim();
    // Optimistic removal — the card leaves the queue immediately and comes
    // back only if the decision fails.
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await apiPatch(`/api/admin/moderation/${id}`, note ? { decision, note } : { decision });
      setNotice(t('admin.modDecided'));
    } catch (cause) {
      setItems(snapshot);
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPendingId(null);
    }
  }

  function languageLabel(language: string | null): string {
    if (language === 'so' || language === 'en') return LOCALE_NAMES[language];
    return t('admin.modLangOther');
  }

  function verdictSummary(verdict: ReviewItem['aiVerdict']): string | null {
    if (!verdict) return null;
    const parts: string[] = [];
    if (verdict.categories && verdict.categories.length > 0) {
      parts.push(verdict.categories.join(', '));
    }
    if (typeof verdict.confidence === 'number') {
      parts.push(`${Math.round(verdict.confidence * 100)}%`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  if (items.length === 0 && !notice) {
    return <p className="xidig-card__meta">{t('admin.modEmpty')}</p>;
  }

  return (
    <div>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}
      <ul className="xidig-card-grid">
        {items.map((item) => {
          const summary = verdictSummary(item.aiVerdict);
          return (
            <li key={item.id} className="xidig-card">
              <p className="xidig-chip-row">
                <span className="xidig-tag">
                  {item.reason === 'ai_flagged'
                    ? t('admin.modReasonFlagged')
                    : t('admin.modReasonUncertain')}
                </span>
                <span className="xidig-tag">{languageLabel(item.language)}</span>
              </p>
              {item.author ? (
                <p className="xidig-card__meta">
                  {t('admin.modAuthor')}: {item.author.display_name} (@{item.author.handle})
                </p>
              ) : null}
              {item.entityType === 'media_upload' && item.content.url ? (
                <div className="xidig-media-thumb">
                  <img src={item.content.url} alt={t('admin.modVerdict')} />
                </div>
              ) : item.contentExcerpt ? (
                <p className="xidig-card__body">{item.contentExcerpt}</p>
              ) : null}
              {summary ? (
                <p className="xidig-card__meta">
                  {t('admin.modVerdict')}: {summary}
                </p>
              ) : null}
              {item.content.url ? (
                <p className="xidig-card__meta">
                  <a href={item.content.url} target="_blank" rel="noopener noreferrer">
                    {t('admin.modViewContent')}
                  </a>
                </p>
              ) : null}
              {item.status === 'pending' ? (
                <>
                  <div className="xidig-field">
                    <label className="xidig-field__label" htmlFor={`mod-note-${item.id}`}>
                      {t('admin.modNoteLabel')}
                    </label>
                    <textarea
                      id={`mod-note-${item.id}`}
                      className="xidig-field__input"
                      rows={2}
                      maxLength={1000}
                      value={notes[item.id] ?? ''}
                      onChange={(e) =>
                        setNotes((current) => ({ ...current, [item.id]: e.target.value }))
                      }
                    />
                  </div>
                  <p className="xidig-profile__actions">
                    <button
                      type="button"
                      className="xidig-button xidig-button--primary"
                      disabled={pendingId === item.id}
                      onClick={() => void decide(item.id, 'approved')}
                    >
                      {t('admin.modApprove')}
                    </button>
                    <button
                      type="button"
                      className="xidig-button xidig-button--secondary"
                      disabled={pendingId === item.id}
                      onClick={() => void decide(item.id, 'removed')}
                    >
                      {t('admin.modRemove')}
                    </button>
                    <button
                      type="button"
                      className="xidig-button xidig-button--secondary"
                      disabled={pendingId === item.id}
                      onClick={() => void decide(item.id, 'dismissed')}
                    >
                      {t('admin.modDismiss')}
                    </button>
                  </p>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
