'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { Dialog } from '@/components/dialog';
import { Avatar } from '@/components/media/avatar';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api-client';
import { MESSAGE_MAX_LENGTH } from '@/lib/dm/constants';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * "Fariin cusub" (6a/6c/6d): compose a NEW request — pick a member, write
 * the ONE message the request grammar allows, Dir. On success the sender
 * lands in the thread, which renders the f5 pending state (request sent,
 * composer closed until acceptance). Uses the same member search as
 * @mentions (GET /api/profiles?q=).
 */

interface ProfileHit {
  user_id: string;
  display_name: string;
  handle: string;
}

export function NewMessageButton() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProfileHit[]>([]);
  const [picked, setPicked] = useState<ProfileHit | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  // Out-of-order guard (review #22): a slow earlier response must never
  // overwrite fresher hits.
  const searchSeqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2 || picked) {
      setHits([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const seq = ++searchSeqRef.current;
      apiGet<{ profiles: ProfileHit[] }>(`/api/profiles?q=${encodeURIComponent(term)}&limit=5`)
        .then((res) => {
          if (seq === searchSeqRef.current) setHits(res.profiles);
        })
        .catch(() => {
          if (seq === searchSeqRef.current) setHits([]);
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, picked]);

  function reset() {
    setOpen(false);
    setQuery('');
    setHits([]);
    setPicked(null);
    setMessage('');
    setError(null);
  }

  async function send() {
    if (!picked || sending) return;
    const body = message.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiPost<{ conversationId: string }>('/api/conversations', {
        recipientUserId: picked.user_id,
        message: body,
      });
      reset();
      router.push(`/messages/${res.conversationId}`);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="xidig-icon-button"
        aria-label={t('messages.newMessage')}
        title={t('messages.newMessage')}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16.5 3.9a2.2 2.2 0 0 1 3.1 3.1L8.4 18.2l-4.1 1 1-4.1Z" />
        </svg>
      </button>

      <Dialog open={open} onClose={reset} title={t('messages.newMessage')} presentation="sheet">
        <div className="xidig-form">
          {error ? <PlainErrorBanner error={error} /> : null}

          {picked ? (
            <div className="xidig-dm-compose__picked">
              <Avatar name={picked.display_name} handle={picked.handle} src={null} size={28} />
              <span className="xidig-dm-compose__pickedname">{picked.display_name}</span>
              <button
                type="button"
                className="xidig-icon-button"
                aria-label={t('action.cancel')}
                onClick={() => setPicked(null)}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <input
                type="search"
                className="xidig-field__input"
                placeholder={t('messages.searchMembers')}
                aria-label={t('messages.searchMembers')}
                value={query}
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
              <p role="status" className="xidig-visually-hidden">
                {hits.length > 0 ? t('messages.searchResultsCount', { count: hits.length }) : ''}
              </p>
              {hits.length > 0 ? (
                <ul className="xidig-dm-compose__hits">
                  {hits.map((hit) => (
                    <li key={hit.user_id}>
                      <button
                        type="button"
                        className="xidig-dm-compose__hit"
                        onClick={() => {
                          setPicked(hit);
                          setHits([]);
                          // The picked button unmounts — hand focus to the
                          // message box (review #14).
                          setTimeout(() => messageRef.current?.focus(), 0);
                        }}
                      >
                        <Avatar name={hit.display_name} handle={hit.handle} src={null} size={28} />
                        <span>{hit.display_name}</span>
                        <span className="xidig-card__meta">@{hit.handle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          {picked ? (
            <>
              <textarea
                ref={messageRef}
                className="xidig-field__input"
                rows={3}
                maxLength={MESSAGE_MAX_LENGTH}
                value={message}
                placeholder={t('messages.composerPlaceholder')}
                aria-label={t('messages.composerPlaceholder')}
                onChange={(event) => setMessage(event.target.value)}
              />
              <p className="xidig-card__meta">{t('messages.requestsFootnote')}</p>
              <button
                type="button"
                className="xidig-button xidig-button--primary"
                disabled={sending || message.trim().length === 0}
                onClick={() => void send()}
              >
                {t('action.send')}
              </button>
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
