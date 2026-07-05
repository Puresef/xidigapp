'use client';

import { useEffect, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

/**
 * Deliverability UX: a visible resend with cooldown + attempt counter, plus
 * plain-language guidance (check spam / use the code / switch channel).
 * Server-side rate limits stay authoritative — this is the polite front.
 */
export function ResendControls({
  onResend,
  hintKeys,
  cooldownSeconds = 60,
  maxAttempts = 3,
}: {
  /** Re-triggers the original send; rejections are surfaced by the parent. */
  onResend: () => Promise<void>;
  /** Guidance lines, e.g. auth.checkSpam / auth.trySmsInstead. */
  hintKeys: MessageKey[];
  cooldownSeconds?: number;
  maxAttempts?: number;
}) {
  const t = useT();
  const [secondsLeft, setSecondsLeft] = useState(cooldownSeconds);
  const [attempts, setAttempts] = useState(0);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const exhausted = attempts >= maxAttempts;

  return (
    <div className="xidig-auth__meta">
      {hintKeys.map((key) => (
        <p key={key} className="xidig-field__hint">
          {t(key)}
        </p>
      ))}
      {exhausted ? (
        <p className="xidig-field__hint">{t('auth.resendLimitHint')}</p>
      ) : secondsLeft > 0 ? (
        <p className="xidig-field__hint">{t('auth.resendWait', { count: secondsLeft })}</p>
      ) : (
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={pending}
          onClick={() => {
            setPending(true);
            onResend()
              .then(() => {
                setAttempts((n) => n + 1);
                setSecondsLeft(cooldownSeconds);
              })
              .finally(() => setPending(false));
          }}
        >
          {t('action.resend')}
        </button>
      )}
    </div>
  );
}
