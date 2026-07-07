'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { VISIBILITY_HINT_KEYS } from '@/lib/labs/labels';
import {
  orderPlaybooks,
  playbookHintKey,
  playbookLabelKey,
  type Playbook,
  type PlaybookTemplate,
} from '@/lib/labs/playbooks';
import { createClient } from '@/lib/supabase-browser';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Create-Space form (§16). Choose Club (casual, free) or Lab (charter-backed,
 * Supporter-gated — the server enforces the gate and returns §27 copy). A Lab
 * requires the three charter fields up front. Teaching hints throughout (§20).
 */
export function SpaceForm() {
  const t = useT();
  const router = useRouter();

  const [mode, setMode] = useState<'club' | 'lab'>('club');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'members' | 'public'>('members');
  const [joinMode, setJoinMode] = useState<'open' | 'request' | 'invite'>('request');
  const [skills, setSkills] = useState('');
  const [problem, setProblem] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [success, setSuccess] = useState('');
  const [sprintLength, setSprintLength] = useState('');

  // Playbook picker (§16): the six seeded starters, fetched under RLS. Choosing
  // one pre-fills the charter fields from its template (see applyPlaybook).
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [playbookSlug, setPlaybookSlug] = useState('');
  const [playbookId, setPlaybookId] = useState<string | null>(null);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('lab_playbooks')
        .select('id, slug, name, template')
        .eq('is_active', true);
      if (!active || !data) return;
      setPlaybooks(orderPlaybooks(data as Playbook[]));
    })();
    return () => {
      active = false;
    };
  }, []);

  /**
   * Apply a playbook's charter template. NON-DESTRUCTIVE: only fills fields the
   * user has left empty; if a chosen template would overwrite text the user
   * already typed, confirm first. Declining keeps the user's text but still
   * stamps the playbook_id so the Space records which starter was picked.
   */
  function applyPlaybook(slug: string) {
    setPlaybookSlug(slug);
    const chosen = playbooks.find((p) => p.slug === slug);
    if (!chosen) {
      setPlaybookId(null);
      return;
    }
    setPlaybookId(chosen.id);
    const template: PlaybookTemplate = chosen.template ?? {};

    const wouldClobber =
      (problem.trim() && template.problem_statement && template.problem_statement !== problem) ||
      (hypothesis.trim() && template.hypothesis && template.hypothesis !== hypothesis) ||
      (success.trim() && template.success_definition && template.success_definition !== success);

    const overwrite = wouldClobber ? window.confirm(t('lab.playbookOverwriteConfirm')) : false;

    if (!problem.trim() || overwrite) setProblem(template.problem_statement ?? problem);
    if (!hypothesis.trim() || overwrite) setHypothesis(template.hypothesis ?? hypothesis);
    if (!success.trim() || overwrite) setSuccess(template.success_definition ?? success);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        mode,
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        visibility,
        joinMode,
      };
      const summaryTrim = summary.trim();
      if (summaryTrim) payload.summary = summaryTrim;
      const skillList = skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (skillList.length) payload.skills = skillList;
      if (mode === 'lab') {
        payload.problemStatement = problem.trim();
        payload.hypothesis = hypothesis.trim();
        payload.successDefinition = success.trim();
        if (sprintLength) payload.sprintLengthWeeks = Number(sprintLength);
        if (playbookId) payload.playbookId = playbookId;
      }

      const { lab } = await apiPost<{ lab: { lab: { slug: string } } }>('/api/labs', payload);
      router.push(`/labs/${lab.lab.slug}`);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="xidig-form" onSubmit={submit}>
      {error ? <PlainErrorBanner error={error} /> : null}

      <fieldset className="xidig-field">
        <legend className="xidig-field__label">{t('lab.createModeQuestion')}</legend>
        <label className="xidig-field__radio">
          <input
            type="radio"
            name="mode"
            checked={mode === 'club'}
            onChange={() => setMode('club')}
          />
          <span>
            <strong>{t('lab.modeClub')}</strong> — {t('lab.modeClubHint')}
          </span>
        </label>
        <label className="xidig-field__radio">
          <input type="radio" name="mode" checked={mode === 'lab'} onChange={() => setMode('lab')} />
          <span>
            <strong>{t('lab.modeLab')}</strong> — {t('lab.modeLabHint')}
          </span>
        </label>
      </fieldset>

      <label className="xidig-field">
        <span className="xidig-field__label">{t('lab.fieldName')}</span>
        <input
          className="xidig-field__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />
      </label>

      <label className="xidig-field">
        <span className="xidig-field__label">{t('lab.fieldSlug')}</span>
        <input
          className="xidig-field__input"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          maxLength={61}
          required
        />
        <span className="xidig-field__hint">{t('lab.fieldSlugHint')}</span>
      </label>

      <label className="xidig-field">
        <span className="xidig-field__label">{t('lab.fieldSummary')}</span>
        <input
          className="xidig-field__input"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={280}
        />
        <span className="xidig-field__hint">{t('lab.fieldSummaryHint')}</span>
      </label>

      <label className="xidig-field">
        <span className="xidig-field__label">{t('lab.fieldVisibility')}</span>
        <select
          className="xidig-field__input"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
        >
          <option value="private">{t('lab.visPrivate')}</option>
          <option value="members">{t('lab.visMembers')}</option>
          <option value="public">{t('lab.visPublic')}</option>
        </select>
        <span className="xidig-field__hint">{t(VISIBILITY_HINT_KEYS[visibility])}</span>
      </label>

      <label className="xidig-field">
        <span className="xidig-field__label">{t('lab.fieldJoinMode')}</span>
        <select
          className="xidig-field__input"
          value={joinMode}
          onChange={(e) => setJoinMode(e.target.value as typeof joinMode)}
        >
          <option value="open">{t('lab.joinOpen')}</option>
          <option value="request">{t('lab.joinRequest')}</option>
          <option value="invite">{t('lab.joinInvite')}</option>
        </select>
      </label>

      <label className="xidig-field">
        <span className="xidig-field__label">{t('lab.fieldSkills')}</span>
        <input
          className="xidig-field__input"
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
        />
        <span className="xidig-field__hint">{t('lab.fieldSkillsHint')}</span>
      </label>

      {mode === 'lab' ? (
        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('lab.charterHeading')}</h2>
          <p className="xidig-field__hint">{t('lab.charterHint')}</p>
          <p className="xidig-field__hint">{t('lab.createSupporterNote')}</p>

          {playbooks.length > 0 ? (
            <label className="xidig-field">
              <span className="xidig-field__label">{t('lab.playbookLabel')}</span>
              <select
                className="xidig-field__input"
                value={playbookSlug}
                onChange={(e) => applyPlaybook(e.target.value)}
              >
                <option value="">{t('lab.playbookNone')}</option>
                {playbooks.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {t(playbookLabelKey(p.slug))}
                  </option>
                ))}
              </select>
              <span className="xidig-field__hint">
                {(() => {
                  const hint = playbookSlug ? playbookHintKey(playbookSlug) : null;
                  return hint ? t(hint) : t('lab.playbookPickerHint');
                })()}
              </span>
            </label>
          ) : null}

          <label className="xidig-field">
            <span className="xidig-field__label">{t('lab.fieldProblem')}</span>
            <textarea
              className="xidig-field__input"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              maxLength={600}
              required
            />
          </label>
          <label className="xidig-field">
            <span className="xidig-field__label">{t('lab.fieldHypothesis')}</span>
            <textarea
              className="xidig-field__input"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              maxLength={600}
              required
            />
          </label>
          <label className="xidig-field">
            <span className="xidig-field__label">{t('lab.fieldSuccess')}</span>
            <textarea
              className="xidig-field__input"
              value={success}
              onChange={(e) => setSuccess(e.target.value)}
              maxLength={600}
              required
            />
          </label>
          <label className="xidig-field">
            <span className="xidig-field__label">{t('lab.fieldSprintLength')}</span>
            <input
              className="xidig-field__input"
              type="number"
              min={1}
              max={52}
              value={sprintLength}
              onChange={(e) => setSprintLength(e.target.value)}
            />
          </label>
        </section>
      ) : null}

      <button
        type="submit"
        className="xidig-button xidig-button--primary"
        disabled={pending || !name.trim() || !slug.trim()}
      >
        {t('lab.createCta')}
      </button>
    </form>
  );
}
