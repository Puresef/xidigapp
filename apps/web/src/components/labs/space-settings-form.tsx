'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { Avatar } from '@/components/media/avatar';
import { ApiRequestError, apiDelete, apiPatch, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { VISIBILITY_HINT_KEYS } from '@/lib/labs/labels';
import type { LabMediaView } from '@/lib/labs/views';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';

type Vis = 'private' | 'members' | 'public';
type Join = 'open' | 'request' | 'invite';

interface MediaEnvelope {
  data?: {
    media: { id: string; url: string; thumbUrl: string | null; blurhash: string | null };
  };
  error?: PlainError;
}

export interface SettingsInitial {
  name: string;
  summary: string;
  visibility: Vis;
  memberListVisibility: Vis;
  joinMode: Join;
  isListed: boolean;
  isSupporterOnly: boolean;
  problemStatement: string;
  hypothesis: string;
  successDefinition: string;
  spaceMode: 'club' | 'lab';
}

/**
 * Space settings (§16): mode-adjacent settings, privacy, member view + the
 * charter. Mode itself changes ONLY via the promote-only ladder (Promote to
 * Lab / Put forward as a Venture) — there is no demotion control. Every save
 * PATCHes the API (role-checked, history-logged); the RSC refreshes after.
 *
 * Phase 4.5 visual identity: icon + cover. Two-step attach like the profile
 * media editor — POST /api/media (kind=space_icon|space_cover: transcode,
 * blurhash, thumb, AI pre-scan) then a media-only PATCH /api/labs/[id] with
 * `iconMediaId`/`coverMediaId` (the API re-validates ownership/kind/scan and
 * denormalizes paths onto labs; manager-only, like this whole page). `null`
 * clears. Each change applies immediately — no draft state.
 */
export function SpaceSettingsForm({
  labId,
  slug,
  initial,
  media,
  skillNeeds,
}: {
  labId: string;
  slug: string;
  initial: SettingsInitial;
  media: LabMediaView;
  skillNeeds: { id: string; skill: string }[];
}) {
  const t = useT();
  const router = useRouter();

  const [form, setForm] = useState<SettingsInitial>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [saved, setSaved] = useState(false);

  const [skillInput, setSkillInput] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [targetLabId, setTargetLabId] = useState('');

  const [iconThumbUrl, setIconThumbUrl] = useState(media.iconThumbUrl);
  const [iconBlurhash, setIconBlurhash] = useState(media.iconBlurhash);
  const [coverUrl, setCoverUrl] = useState(media.coverUrl);
  const [mediaBusy, setMediaBusy] = useState<'icon' | 'cover' | null>(null);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const iconInput = useRef<HTMLInputElement | null>(null);
  const coverInput = useRef<HTMLInputElement | null>(null);

  function set<K extends keyof SettingsInitial>(key: K, value: SettingsInitial[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function run(fn: () => Promise<void>, markSaved = false) {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await fn();
      if (markSaved) setSaved(true);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  async function uploadArt(kind: 'icon' | 'cover', file: File) {
    setMediaBusy(kind);
    setError(null);
    setMediaNotice(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind === 'icon' ? 'space_icon' : 'space_cover');
      formData.append('alt', initial.name);

      // apiPost is JSON-only; multipart talks to the envelope with raw fetch.
      let body: MediaEnvelope = {};
      const res = await fetch('/api/media', { method: 'POST', body: formData });
      try {
        body = (await res.json()) as MediaEnvelope;
      } catch {
        body = {};
      }
      if (!res.ok || body.error || !body.data) {
        setError(body.error ?? { code: 'server_error', message: '' });
        return;
      }

      const { media: uploaded } = body.data;
      await apiPatch(
        `/api/labs/${labId}`,
        kind === 'icon' ? { iconMediaId: uploaded.id } : { coverMediaId: uploaded.id },
      );

      if (kind === 'icon') {
        setIconThumbUrl(uploaded.thumbUrl ?? uploaded.url);
        setIconBlurhash(uploaded.blurhash);
        setMediaNotice(t('lab.iconUpdated'));
      } else {
        setCoverUrl(uploaded.url);
        setMediaNotice(t('lab.coverUpdated'));
      }
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setMediaBusy(null);
    }
  }

  async function removeArt(kind: 'icon' | 'cover') {
    setMediaBusy(kind);
    setError(null);
    setMediaNotice(null);
    try {
      await apiPatch(
        `/api/labs/${labId}`,
        kind === 'icon' ? { iconMediaId: null } : { coverMediaId: null },
      );
      if (kind === 'icon') {
        setIconThumbUrl(null);
        setIconBlurhash(null);
      } else {
        setCoverUrl(null);
      }
      setMediaNotice(t('lab.mediaRemoved'));
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setMediaBusy(null);
    }
  }

  function onPickArt(kind: 'icon' | 'cover', files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadArt(kind, file);
    // Reset so re-picking the same file fires change again.
    if (kind === 'icon' && iconInput.current) iconInput.current.value = '';
    if (kind === 'cover' && coverInput.current) coverInput.current.value = '';
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    void run(
      () =>
        apiPatch(`/api/labs/${labId}`, {
          name: form.name.trim(),
          summary: form.summary.trim() || null,
          visibility: form.visibility,
          memberListVisibility: form.memberListVisibility,
          joinMode: form.joinMode,
          isListed: form.isListed,
          isSupporterOnly: form.isSupporterOnly,
          problemStatement: form.problemStatement.trim() || null,
          hypothesis: form.hypothesis.trim() || null,
          successDefinition: form.successDefinition.trim() || null,
        }).then(() => undefined),
      true,
    );
  }

  return (
    <div className="xidig-section">
      {error ? <PlainErrorBanner error={error} /> : null}
      {saved ? <Banner kind="notice">{t('lab.settingsSaved')}</Banner> : null}

      <form className="xidig-form" onSubmit={saveSettings}>
        <label className="xidig-field">
          <span className="xidig-field__label">{t('lab.fieldName')}</span>
          <input
            className="xidig-field__input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={80}
          />
        </label>
        <label className="xidig-field">
          <span className="xidig-field__label">{t('lab.fieldSummary')}</span>
          <input
            className="xidig-field__input"
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
            maxLength={280}
          />
        </label>

        <label className="xidig-field">
          <span className="xidig-field__label">{t('lab.fieldVisibility')}</span>
          <select
            className="xidig-field__input"
            value={form.visibility}
            onChange={(e) => set('visibility', e.target.value as Vis)}
          >
            <option value="private">{t('lab.visPrivate')}</option>
            <option value="members">{t('lab.visMembers')}</option>
            <option value="public">{t('lab.visPublic')}</option>
          </select>
          <span className="xidig-field__hint">{t(VISIBILITY_HINT_KEYS[form.visibility])}</span>
        </label>

        <label className="xidig-field">
          <span className="xidig-field__label">{t('lab.memberView')}</span>
          <select
            className="xidig-field__input"
            value={form.memberListVisibility}
            onChange={(e) => set('memberListVisibility', e.target.value as Vis)}
          >
            <option value="private">{t('lab.visPrivate')}</option>
            <option value="members">{t('lab.visMembers')}</option>
            <option value="public">{t('lab.visPublic')}</option>
          </select>
        </label>

        <label className="xidig-field">
          <span className="xidig-field__label">{t('lab.fieldJoinMode')}</span>
          <select
            className="xidig-field__input"
            value={form.joinMode}
            onChange={(e) => set('joinMode', e.target.value as Join)}
          >
            <option value="open">{t('lab.joinOpen')}</option>
            <option value="request">{t('lab.joinRequest')}</option>
            <option value="invite">{t('lab.joinInvite')}</option>
          </select>
        </label>

        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('lab.charterHeading')}</h2>
          <label className="xidig-field">
            <span className="xidig-field__label">{t('lab.fieldProblem')}</span>
            <textarea
              className="xidig-field__input"
              value={form.problemStatement}
              onChange={(e) => set('problemStatement', e.target.value)}
              maxLength={600}
            />
          </label>
          <label className="xidig-field">
            <span className="xidig-field__label">{t('lab.fieldHypothesis')}</span>
            <textarea
              className="xidig-field__input"
              value={form.hypothesis}
              onChange={(e) => set('hypothesis', e.target.value)}
              maxLength={600}
            />
          </label>
          <label className="xidig-field">
            <span className="xidig-field__label">{t('lab.fieldSuccess')}</span>
            <textarea
              className="xidig-field__input"
              value={form.successDefinition}
              onChange={(e) => set('successDefinition', e.target.value)}
              maxLength={600}
            />
          </label>
        </section>

        <button
          type="submit"
          className="xidig-button xidig-button--primary"
          disabled={pending}
        >
          {t('lab.actionSaveSettings')}
        </button>
      </form>

      {/* Icon + cover (Phase 4.5 visual identity) — manager-only, like this page. */}
      <section className="xidig-section" aria-label={t('lab.mediaSection')}>
        <h2 className="xidig-section__title">{t('lab.mediaSection')}</h2>
        {mediaNotice ? <Banner kind="notice">{mediaNotice}</Banner> : null}

        <div className="xidig-field">
          <p className="xidig-field__label" id="space-icon-label">
            {t('lab.iconLabel')}
          </p>
          <div className="xidig-media-editor__row">
            <Avatar
              name={initial.name}
              handle={slug}
              src={iconThumbUrl}
              blurhash={iconBlurhash}
              size={64}
            />
            <input
              ref={iconInput}
              id="space-icon-file"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="xidig-visually-hidden"
              aria-labelledby="space-icon-label"
              onChange={(e) => onPickArt('icon', e.target.files)}
            />
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={mediaBusy !== null}
              onClick={() => iconInput.current?.click()}
            >
              {mediaBusy === 'icon' ? t('lab.mediaUploading') : t('lab.iconUpload')}
            </button>
            {iconThumbUrl ? (
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={mediaBusy !== null}
                onClick={() => void removeArt('icon')}
              >
                {t('action.remove')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="xidig-field">
          <p className="xidig-field__label" id="space-cover-label">
            {t('lab.coverLabel')}
          </p>
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={t('lab.coverAlt', { name: initial.name })}
              className="xidig-media-editor__cover"
              loading="lazy"
            />
          ) : null}
          <div className="xidig-media-editor__row">
            <input
              ref={coverInput}
              id="space-cover-file"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="xidig-visually-hidden"
              aria-labelledby="space-cover-label"
              onChange={(e) => onPickArt('cover', e.target.files)}
            />
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={mediaBusy !== null}
              onClick={() => coverInput.current?.click()}
            >
              {mediaBusy === 'cover' ? t('lab.mediaUploading') : t('lab.coverUpload')}
            </button>
            {coverUrl ? (
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={mediaBusy !== null}
                onClick={() => void removeArt('cover')}
              >
                {t('action.remove')}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Promotion ladder (§16) — promote-only, no demotion control exists. */}
      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('lab.tabSettings')}</h2>
        <p className="xidig-field__hint">{t('lab.settingsPromoteHint')}</p>
        {form.spaceMode === 'club' ? (
          <button
            type="button"
            className="xidig-button xidig-button--primary"
            disabled={pending}
            onClick={() =>
              void run(() =>
                apiPost(`/api/labs/${labId}/promote`, {
                  target: 'lab',
                  problemStatement: form.problemStatement.trim() || undefined,
                  hypothesis: form.hypothesis.trim() || undefined,
                  successDefinition: form.successDefinition.trim() || undefined,
                }).then(() => undefined),
              )
            }
          >
            {t('lab.actionPromoteLab')}
          </button>
        ) : (
          <div className="xidig-form">
            <p className="xidig-field__hint">{t('lab.candidateHandoffNote')}</p>
            <label className="xidig-field">
              <span className="xidig-field__label">{t('lab.actionPromoteCandidate')}</span>
              <input
                className="xidig-field__input"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                maxLength={80}
              />
            </label>
            <button
              type="button"
              className="xidig-button xidig-button--primary"
              disabled={pending || !candidateName.trim()}
              onClick={() =>
                void run(() =>
                  apiPost(`/api/labs/${labId}/promote`, {
                    target: 'candidate',
                    name: candidateName.trim(),
                  }).then(() => undefined),
                )
              }
            >
              {t('lab.actionPromoteCandidate')}
            </button>
          </div>
        )}
      </section>

      {/* "Looking for" skills (§16/§20) */}
      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('lab.fieldSkills')}</h2>
        <ul className="xidig-post-list">
          {skillNeeds.map((s) => (
            <li key={s.id} className="xidig-card__meta">
              {s.skill}{' '}
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pending}
                onClick={() =>
                  void run(() =>
                    apiDelete(`/api/labs/${labId}/skills?skillNeedId=${s.id}`).then(() => undefined),
                  )
                }
              >
                {t('action.remove')}
              </button>
            </li>
          ))}
        </ul>
        <div className="xidig-field">
          <input
            className="xidig-field__input"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            maxLength={40}
          />
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending || !skillInput.trim()}
            onClick={() =>
              void run(async () => {
                await apiPost(`/api/labs/${labId}/skills`, { skill: skillInput.trim() });
                setSkillInput('');
              })
            }
          >
            {t('lab.actionAddSkill')}
          </button>
        </div>
      </section>

      {/* Inter-Lab collaboration (§16) */}
      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('lab.actionProposeCollab')}</h2>
        <div className="xidig-field">
          <input
            className="xidig-field__input"
            value={targetLabId}
            onChange={(e) => setTargetLabId(e.target.value)}
          />
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending || !targetLabId.trim()}
            onClick={() =>
              void run(async () => {
                await apiPost(`/api/labs/${labId}/collaborations`, {
                  action: 'propose',
                  targetLabId: targetLabId.trim(),
                });
                setTargetLabId('');
              })
            }
          >
            {t('lab.actionProposeCollab')}
          </button>
        </div>
      </section>

      <p className="xidig-card__meta">
        <a href={`/labs/${slug}`}>← {t('lab.tabOverview')}</a>
      </p>
    </div>
  );
}
