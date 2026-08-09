'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { Dialog } from '@/components/dialog';
import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { OFFER_MESSAGE_MAX } from '@/lib/plaza/constants';

import { PlainErrorBanner } from '../../auth/plain-error';

/**
 * "Waan caawin karaa" (frames 1a/1b/2a): the offer is a private fariin to the
 * asker — the privacy note rides directly under the CTA so nobody expects a
 * public pile-on. While someone is already helping, offering demotes to
 * secondary but stays possible ("Anigana waan caawin karaa"). A successful
 * offer lands the member in the Fariimo thread it opened.
 */
export function OfferCta({
  postId,
  askStatus,
  isAsker,
  askerName,
}: {
  postId: string;
  askStatus: 'open' | 'in_progress' | 'fulfilled' | 'answered' | 'closed';
  isAsker: boolean;
  askerName: string;
}) {
  const t = useT();
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  if (isAsker) return null;
  if (askStatus !== 'open' && askStatus !== 'in_progress') return null;
  const secondary = askStatus === 'in_progress';

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed === '' || pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        const result = await apiPost<{ offerId: string; conversationId: string }>(
          `/api/posts/${postId}/offers`,
          { message: trimmed },
        );
        router.push(`/messages/${result.conversationId}`);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
        setPending(false);
      }
    })();
  }

  return (
    <div className="xidig-codsi-offer">
      <button
        type="button"
        className={`xidig-button ${secondary ? 'xidig-button--secondary' : 'xidig-button--primary'} xidig-codsi-offer__cta`}
        onClick={() => setOpen(true)}
      >
        {secondary ? t('plaza.offerCtaSecondary') : t('plaza.offerCta')}
      </button>
      <p className="xidig-codsi-offer__note">
        {secondary
          ? t('plaza.offerStillOpenNote', { name: askerName })
          : t('plaza.offerPrivacyNote', { name: askerName })}
      </p>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('plaza.offerCta')}
        presentation="sheet"
      >
        <form className="xidig-form" onSubmit={submit}>
          {error ? <PlainErrorBanner error={error} /> : null}
          <p className="xidig-card__meta">{t('plaza.offerPrivacyNote', { name: askerName })}</p>
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor={fieldId}>
              {t('plaza.offerMessageLabel')}
            </label>
            <textarea
              id={fieldId}
              className="xidig-field__input"
              rows={4}
              maxLength={OFFER_MESSAGE_MAX}
              placeholder={t('plaza.offerMessagePlaceholder')}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
          <button
            type="submit"
            className="xidig-button xidig-button--primary"
            disabled={pending || message.trim() === ''}
          >
            {t('action.send')}
          </button>
        </form>
      </Dialog>
    </div>
  );
}
