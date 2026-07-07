'use client';

import { useState, type FormEvent } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { apiPatch, apiPut, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { PrefMatrixRow, PrefType } from '@/lib/notifications/prefs';
import { DIGEST_FREQUENCY_OPTIONS, type DigestFrequency } from '@/lib/settings/model';

import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Notification matrix (§26): one row per notification type, three channels.
 * In-app is always on (every notification is an inbox row) — shown locked.
 * Email/push cells are togglable only where a send path exists; §26 defaults
 * come pre-checked. Quiet hours + digest frequency ride the same Save
 * (PATCH /api/me/settings) while the matrix goes to PUT
 * /api/me/notification-prefs as a full replace.
 */

const TYPE_LABELS: Record<string, MessageKey> = {
  reply: 'settings.notifTypeReply',
  mention: 'settings.notifTypeMention',
  new_dm: 'settings.notifTypeNewDm',
  dm_request: 'settings.notifTypeDmRequest',
  dm_accepted: 'settings.notifTypeDmAccepted',
  ask_credited: 'settings.notifTypeAskCredited',
  ask_stale: 'settings.notifTypeAskStale',
  moderation_hold: 'settings.notifTypeModerationHold',
  moderation_removed: 'settings.notifTypeModerationRemoved',
  candidate_status: 'settings.notifTypeCandidateStatus',
  lab_update: 'settings.notifTypeLabUpdate',
  lab_join_request: 'settings.notifTypeLabJoinRequest',
  lab_join_response: 'settings.notifTypeLabJoinResponse',
  lab_promoted: 'settings.notifTypeLabPromoted',
  lab_dormant: 'settings.notifTypeLabDormant',
  lab_skill_gap: 'settings.notifTypeLabSkillGap',
  lab_collab_invite: 'settings.notifTypeLabCollabInvite',
  lab_collab_response: 'settings.notifTypeLabCollabResponse',
  weekly_digest: 'settings.notifTypeWeeklyDigest',
};

export interface NotificationSettingsSnapshot {
  /** Merged matrix, weekly_digest excluded (the digest select owns it). */
  matrix: PrefMatrixRow[];
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  digestFrequency: DigestFrequency;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function NotificationSettings({ snapshot }: { snapshot: NotificationSettingsSnapshot }) {
  const t = useT();

  const [matrix, setMatrix] = useState(snapshot.matrix);
  const [quietEnabled, setQuietEnabled] = useState(
    snapshot.quietHoursStart !== null && snapshot.quietHoursEnd !== null,
  );
  const [quietStart, setQuietStart] = useState(snapshot.quietHoursStart ?? 22);
  const [quietEnd, setQuietEnd] = useState(snapshot.quietHoursEnd ?? 7);
  const [digest, setDigest] = useState<DigestFrequency>(snapshot.digestFrequency);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(type: PrefType, channel: 'email' | 'push', enabled: boolean) {
    setMatrix((current) =>
      current.map((row) => (row.type === type ? { ...row, [channel]: enabled } : row)),
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const prefs = matrix.flatMap((row) => {
        const cells: { type: PrefType; channel: 'email' | 'push'; enabled: boolean }[] = [];
        if (row.emailCapable) cells.push({ type: row.type, channel: 'email', enabled: row.email });
        if (row.pushCapable) cells.push({ type: row.type, channel: 'push', enabled: row.push });
        return cells;
      });
      await apiPut('/api/me/notification-prefs', { prefs });
      await apiPatch('/api/me/settings', {
        quietHoursStart: quietEnabled ? quietStart : null,
        quietHoursEnd: quietEnabled ? quietEnd : null,
        digestFrequency: digest,
      });
      setSaved(true);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="xidig-form" onSubmit={onSubmit}>
      {error ? <PlainErrorBanner error={error} /> : null}
      {saved ? <Banner kind="notice">{t('settings.saved')}</Banner> : null}

      <div className="xidig-matrix-wrap">
        <table className="xidig-matrix">
          <caption className="xidig-field__hint">{t('settings.matrixCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('settings.matrixType')}</th>
              <th scope="col">{t('settings.matrixInApp')}</th>
              <th scope="col">{t('settings.matrixEmail')}</th>
              <th scope="col">{t('settings.matrixPush')}</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const labelKey = TYPE_LABELS[row.type];
              const label = labelKey ? t(labelKey) : row.type;
              return (
                <tr key={row.type}>
                  <th scope="row">{label}</th>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.inapp}
                      disabled
                      aria-label={t('settings.matrixCellAria', {
                        type: label,
                        channel: t('settings.matrixInApp'),
                      })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.email}
                      disabled={!row.emailCapable || pending}
                      onChange={(e) => toggle(row.type, 'email', e.target.checked)}
                      aria-label={t('settings.matrixCellAria', {
                        type: label,
                        channel: t('settings.matrixEmail'),
                      })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.push}
                      disabled={!row.pushCapable || pending}
                      onChange={(e) => toggle(row.type, 'push', e.target.checked)}
                      aria-label={t('settings.matrixCellAria', {
                        type: label,
                        channel: t('settings.matrixPush'),
                      })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <fieldset className="xidig-section">
        <legend className="xidig-section__title">{t('settings.quietHoursTitle')}</legend>
        <p className="xidig-field__hint">{t('settings.quietHoursHint')}</p>
        <label className="xidig-checkbox">
          <input
            type="checkbox"
            checked={quietEnabled}
            onChange={(e) => setQuietEnabled(e.target.checked)}
          />
          <span>{t('settings.quietHoursEnable')}</span>
        </label>
        {quietEnabled ? (
          <div className="xidig-option-row">
            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor="quiet-start">
                {t('settings.quietHoursFrom')}
              </label>
              <select
                id="quiet-start"
                className="xidig-field__input"
                value={quietStart}
                onChange={(e) => setQuietStart(Number(e.target.value))}
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </select>
            </div>
            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor="quiet-end">
                {t('settings.quietHoursTo')}
              </label>
              <select
                id="quiet-end"
                className="xidig-field__input"
                value={quietEnd}
                onChange={(e) => setQuietEnd(Number(e.target.value))}
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </fieldset>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="digest-frequency">
          {t('settings.digestLabel')}
        </label>
        <select
          id="digest-frequency"
          className="xidig-field__input"
          value={digest}
          onChange={(e) => setDigest(e.target.value as DigestFrequency)}
        >
          {DIGEST_FREQUENCY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'weekly' ? t('settings.digestWeekly') : t('settings.digestOff')}
            </option>
          ))}
        </select>
        <p className="xidig-field__hint">{t('settings.digestHint')}</p>
      </div>

      <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
        {t('action.save')}
      </button>
    </form>
  );
}
