'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type ChangeEvent } from 'react';

import type { Enums } from '@xidig/db';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPatch, apiPost } from '@/lib/api-client';
import {
  CANDIDATE_ASK_MAX,
  CANDIDATE_NAME_MAX,
  CANDIDATE_ONE_LINER_MAX,
  CANDIDATE_PROBLEM_MAX,
  CANDIDATE_SOLUTION_MAX,
  CANDIDATE_TEAM_MAX,
  CANDIDATE_TRACTION_MAX,
} from '@/lib/capital/constants';
import type { CandidateRow } from '@/lib/capital/views';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';
import { FilePickerButton } from '../file-picker-button';

/**
 * Draft/submitted candidate editor (§17). Creator/lead only (the page + the
 * PATCH API both re-check). Content fields, logo/cover upload (POST /api/media
 * kind candidate_logo/candidate_cover → PATCH with the returned media id), a
 * reviewers-only visibility toggle, and the submit action (draft → submitted,
 * opens the 7-day vote window server-side). Uploads talk to /api/media as
 * multipart, so they use a raw fetch (apiPost is JSON-only), mirroring the
 * plaza ImagePicker.
 */

interface MediaEnvelope {
  data?: { media: { id: string; url: string; thumbUrl?: string | null; scanStatus: string } };
  error?: PlainError;
}

type Visibility = Enums<'candidate_visibility'>;

const TEXT_FIELDS = [
  { key: 'problem', label: 'capital.fieldProblem', max: CANDIDATE_PROBLEM_MAX },
  { key: 'solution', label: 'capital.fieldSolution', max: CANDIDATE_SOLUTION_MAX },
  { key: 'traction', label: 'capital.fieldTraction', max: CANDIDATE_TRACTION_MAX },
  { key: 'team', label: 'capital.fieldTeam', max: CANDIDATE_TEAM_MAX },
  { key: 'ask', label: 'capital.fieldAsk', max: CANDIDATE_ASK_MAX },
] as const;

type TextFieldKey = (typeof TEXT_FIELDS)[number]['key'];

export function CandidateEditor({ candidate }: { candidate: CandidateRow }) {
  const t = useT();
  const router = useRouter();

  // Stable per-field ids so each <label> wires to its control (a11y). The text
  // fields share one base id namespaced by key (they render in a .map).
  const nameId = useId();
  const oneLinerId = useId();
  const logoId = useId();
  const coverId = useId();
  const fieldBaseId = useId();
  const textFieldId = (key: TextFieldKey) => `${fieldBaseId}-${key}`;

  const [name, setName] = useState(candidate.name);
  const [oneLiner, setOneLiner] = useState(candidate.one_liner ?? '');
  const [fields, setFields] = useState<Record<TextFieldKey, string>>({
    problem: candidate.problem ?? '',
    solution: candidate.solution ?? '',
    traction: candidate.traction ?? '',
    team: candidate.team ?? '',
    ask: candidate.ask ?? '',
  });
  const [visibility, setVisibility] = useState<Visibility>(candidate.visibility);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<'candidate_logo' | 'candidate_cover' | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const isSubmittable = candidate.status === 'draft';

  async function uploadMedia(file: File, kind: 'candidate_logo' | 'candidate_cover') {
    setUploading(kind);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);
    formData.append('alt', kind === 'candidate_logo' ? name : `${name} cover`);
    try {
      const res = await fetch('/api/media', { method: 'POST', body: formData });
      let envelope: MediaEnvelope = {};
      try {
        envelope = (await res.json()) as MediaEnvelope;
      } catch {
        envelope = {};
      }
      if (!res.ok || envelope.error || !envelope.data) {
        setError(envelope.error ?? { code: 'server_error', message: '' });
        return;
      }
      const patchKey = kind === 'candidate_logo' ? 'logoMediaId' : 'coverMediaId';
      await apiPatch(`/api/candidates/${candidate.id}`, { [patchKey]: envelope.data.media.id });
      setSaved(true);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setUploading(null);
    }
  }

  function onFile(kind: 'candidate_logo' | 'candidate_cover') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) void uploadMedia(file, kind);
    };
  }

  function save() {
    if (pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      setSaved(false);
      try {
        await apiPatch(`/api/candidates/${candidate.id}`, {
          name: name.trim(),
          oneLiner: oneLiner.trim() || null,
          problem: fields.problem.trim() || null,
          solution: fields.solution.trim() || null,
          traction: fields.traction.trim() || null,
          team: fields.team.trim() || null,
          ask: fields.ask.trim() || null,
          visibility,
        });
        setSaved(true);
        router.refresh();
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  function submit() {
    if (pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        // Phase 7: analytics (candidate_submitted)
        await apiPost(`/api/candidates/${candidate.id}/submit`, {});
        router.push(`/c/${candidate.id}`);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <section className="xidig-section xidig-capital-editor">
      {error ? <PlainErrorBanner error={error} /> : null}
      {saved ? <Banner kind="notice">{t('capital.editorSaved')}</Banner> : null}

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor={nameId}>
          {t('capital.fieldName')}
        </label>
        <input
          id={nameId}
          className="xidig-field__input"
          maxLength={CANDIDATE_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor={oneLinerId}>
          {t('capital.fieldOneLiner')}
        </label>
        <input
          id={oneLinerId}
          className="xidig-field__input"
          maxLength={CANDIDATE_ONE_LINER_MAX}
          value={oneLiner}
          onChange={(e) => setOneLiner(e.target.value)}
        />
      </div>

      {TEXT_FIELDS.map((f) => (
        <div className="xidig-field" key={f.key}>
          <label className="xidig-field__label" htmlFor={textFieldId(f.key)}>
            {t(f.label)}
          </label>
          <textarea
            id={textFieldId(f.key)}
            className="xidig-field__input"
            rows={4}
            maxLength={f.max}
            value={fields[f.key]}
            onChange={(e) => setFields((cur) => ({ ...cur, [f.key]: e.target.value }))}
          />
        </div>
      ))}

      {/* Logo + cover upload */}
      <div className="xidig-field">
        <p className="xidig-field__label" id={`${logoId}-label`}>
          {t('capital.fieldLogo')}
        </p>
        <FilePickerButton
          id={logoId}
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading !== null}
          labelKey="action.chooseImage"
          labelledBy={`${logoId}-label`}
          onChange={onFile('candidate_logo')}
        />
        {uploading === 'candidate_logo' ? (
          <p className="xidig-field__hint">{t('capital.uploading')}</p>
        ) : null}
      </div>
      <div className="xidig-field">
        <p className="xidig-field__label" id={`${coverId}-label`}>
          {t('capital.fieldCover')}
        </p>
        <FilePickerButton
          id={coverId}
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading !== null}
          labelKey="action.chooseImage"
          labelledBy={`${coverId}-label`}
          onChange={onFile('candidate_cover')}
        />
        {uploading === 'candidate_cover' ? (
          <p className="xidig-field__hint">{t('capital.uploading')}</p>
        ) : null}
      </div>

      {/* Reviewers-only visibility toggle */}
      <label className="xidig-checkbox">
        <input
          type="checkbox"
          checked={visibility === 'reviewers_only'}
          onChange={(e) => setVisibility(e.target.checked ? 'reviewers_only' : 'all_members')}
        />
        <span>{t('capital.reviewersOnlyLabel')}</span>
      </label>
      <p className="xidig-field__hint">{t('capital.reviewersOnlyHint')}</p>

      <div className="xidig-capital-editor__actions">
        <button
          type="button"
          className="xidig-button xidig-button--primary"
          disabled={pending || name.trim() === ''}
          onClick={save}
        >
          {t('action.save')}
        </button>
        {isSubmittable ? (
          <button
            type="button"
            className="xidig-button xidig-button--primary"
            disabled={pending || name.trim() === ''}
            onClick={submit}
          >
            {t('capital.submitCta')}
          </button>
        ) : null}
      </div>
      {isSubmittable ? <p className="xidig-field__hint">{t('capital.submitHint')}</p> : null}
    </section>
  );
}
