'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { formatRelativeTime, type MessageKey } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ButtonTabs } from '@/components/button-tabs';
import { MentionAutocomplete } from '@/components/social/mention-autocomplete';
import { ApiRequestError, apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';
import { detectLink } from '@/lib/embeds';
import type { PlainError } from '@/lib/errors';
import {
  COMPOSE_EVENT,
  POLL_DEFAULT_DAYS,
  POLL_MAX_DAYS,
  POLL_MIN_DAYS,
  POLL_OPTION_LABEL_MAX,
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POST_BODY_MAX,
  POST_TITLE_MAX,
} from '@/lib/plaza/constants';
import type { DraftPayload } from '@/lib/social/drafts';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';
import { ImagePicker, type UploadedImage } from './image-picker';
import { TagPicker } from './tag-picker';

/**
 * Plaza composer (§15, §20): one card, five post types behind a tab row, with
 * a teaching hint per type. Non-embeddable links get the §27 notice on blur
 * but never block posting; the §27 post_limit copy (5/day free) surfaces via
 * PlainErrorBanner with the server-resolved upgrade CTA. Image upload is
 * hidden entirely in low-bandwidth mode (§22).
 *
 * Phase 4.5 additions:
 *   - drafts: ~2s-debounced autosave to /api/me/drafts, with an instant
 *     localStorage copy for crash/refresh recovery (flaky connections must
 *     never eat someone's words, §22), a "continue a draft" picker, and
 *     draft cleanup on publish;
 *   - @mention autocomplete in the body (directory-backed, debounced).
 */

type PostType = 'intro' | 'ask' | 'win' | 'update' | 'poll';

const POST_TYPES: readonly PostType[] = ['intro', 'ask', 'win', 'update', 'poll'];

const TYPE_LABEL_KEYS: Record<PostType, MessageKey> = {
  intro: 'plaza.typeIntro',
  ask: 'plaza.typeAsk',
  win: 'plaza.typeWin',
  update: 'plaza.typeUpdate',
  poll: 'plaza.typePoll',
};

const TYPE_HINT_KEYS: Record<PostType, MessageKey> = {
  intro: 'plaza.typeIntroHint',
  ask: 'plaza.typeAskHint',
  win: 'plaza.typeWinHint',
  update: 'plaza.typeUpdateHint',
  poll: 'plaza.typePollHint',
};

const BODY_LABEL_KEYS: Record<PostType, MessageKey> = {
  intro: 'plaza.bodyLabel',
  ask: 'plaza.bodyLabelAsk',
  win: 'plaza.bodyLabel',
  update: 'plaza.bodyLabel',
  poll: 'plaza.bodyLabelPoll',
};

const POLL_DAY_CHOICES = Array.from(
  { length: POLL_MAX_DAYS - POLL_MIN_DAYS + 1 },
  (_, i) => POLL_MIN_DAYS + i,
);

/** Instant-recovery copy of the in-progress draft (server copy lags ~2s). */
const LOCAL_DRAFT_KEY = 'xidig_plaza_draft';

const DRAFT_AUTOSAVE_MS = 2000;

const DRAFT_SNIPPET_LENGTH = 80;

interface DraftListItem {
  id: string;
  payload: DraftPayload;
  updated_at: string;
}

interface LocalDraft {
  draftId: string | null;
  payload: DraftPayload;
}

function readLocalDraft(): LocalDraft | null {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft> | null;
    if (!parsed?.payload || typeof parsed.payload !== 'object') return null;
    if (!parsed.payload.title && !parsed.payload.body) return null;
    return { draftId: typeof parsed.draftId === 'string' ? parsed.draftId : null, payload: parsed.payload as DraftPayload };
  } catch {
    return null;
  }
}

export function PostComposer({
  lowBandwidth,
  defaultExpanded = false,
}: {
  lowBandwidth: boolean;
  defaultExpanded?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();

  // Collapsed by default so the Plaza leads with the feed, not a form. A
  // restored draft, the feed's empty-state CTA (COMPOSE_EVENT), or the prompt
  // itself expands it; it never auto-collapses.
  const [expanded, setExpanded] = useState(defaultExpanded);
  const focusOnExpandRef = useRef(false);

  const [type, setType] = useState<PostType>('intro');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [linkNotice, setLinkNotice] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollDays, setPollDays] = useState(POLL_DEFAULT_DAYS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  // --- drafts (Phase 4.5) ---------------------------------------------------
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [draftSaved, setDraftSaved] = useState(false);
  const [restored, setRestored] = useState(false);
  const draftIdRef = useRef<string | null>(null);
  const pendingPayloadRef = useRef<DraftPayload | null>(null);
  const saveStateRef = useRef({ inFlight: false, queued: false });
  const mountedRef = useRef(false);

  const applyPayload = useCallback((payload: DraftPayload) => {
    setType(payload.type);
    setTitle(payload.title ?? '');
    setBody(payload.body ?? '');
    setLink(payload.linkUrl ?? '');
    setTagIds(payload.tagIds ?? []);
    setLinkNotice(false);
  }, []);

  // Crash/refresh recovery + server drafts list, once on mount.
  useEffect(() => {
    const local = readLocalDraft();
    if (local) {
      applyPayload(local.payload);
      draftIdRef.current = local.draftId;
      setRestored(true);
      // Someone mid-thought gets their words back on screen, not behind a
      // collapsed prompt.
      setExpanded(true);
    }
    apiGet<{ items: DraftListItem[] }>('/api/me/drafts')
      .then((page) => setDrafts(page.items))
      .catch(() => {
        // Drafts list is a bonus affordance — never block composing.
      });
  }, [applyPayload]);

  // Latest has-unsaved-text, readable from the stable event listener below.
  const hasTextRef = useRef(false);
  hasTextRef.current = Boolean(title.trim() || body.trim());

  // Feed empty-state CTA (or any future "compose" entry point). detail.type
  // carries the feed's active filter — "No polls yet → Start the first post"
  // must land on the Poll tab, not Intro. Never override a draft in progress.
  useEffect(() => {
    function onCompose(event: Event) {
      const requested = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (
        requested &&
        (POST_TYPES as readonly string[]).includes(requested) &&
        !hasTextRef.current
      ) {
        setType(requested as PostType);
      }
      focusOnExpandRef.current = true;
      setExpanded(true);
      // Already expanded → no state change, no effect re-run: focus directly.
      document.getElementById('composer-body')?.focus();
    }
    window.addEventListener(COMPOSE_EVENT, onCompose);
    return () => window.removeEventListener(COMPOSE_EVENT, onCompose);
  }, []);

  // Focus lands in the body only for user-initiated expansion — never on a
  // mount that happens to start expanded.
  useEffect(() => {
    if (!expanded || !focusOnExpandRef.current) return;
    focusOnExpandRef.current = false;
    document.getElementById('composer-body')?.focus();
  }, [expanded]);

  const persistDraft = useCallback(async () => {
    const state = saveStateRef.current;
    if (state.inFlight) {
      state.queued = true;
      return;
    }
    const payload = pendingPayloadRef.current;
    if (!payload) return;
    state.inFlight = true;
    try {
      if (draftIdRef.current) {
        await apiPatch(`/api/me/drafts/${draftIdRef.current}`, { payload });
      } else {
        const { draft } = await apiPost<{ draft: { id: string } }>('/api/me/drafts', { payload });
        draftIdRef.current = draft.id;
      }
      setDraftSaved(true);
    } catch (cause) {
      // Draft was deleted in another tab → start a fresh row next tick.
      if (cause instanceof ApiRequestError && cause.plain.code === 'not_found') {
        draftIdRef.current = null;
      }
      // Cap hit / offline: stay quiet — the localStorage copy has the text.
    } finally {
      state.inFlight = false;
      if (state.queued) {
        state.queued = false;
        void persistDraft();
      }
    }
  }, []);

  // Autosave: localStorage instantly, server after ~2s of quiet.
  useEffect(() => {
    if (!mountedRef.current) {
      // Skip the initial render — nothing typed yet.
      mountedRef.current = true;
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle && !trimmedBody) return;

    const payload: DraftPayload = { type };
    if (trimmedTitle) payload.title = trimmedTitle;
    if (trimmedBody) payload.body = trimmedBody;
    const trimmedLink = link.trim();
    if (trimmedLink) payload.linkUrl = trimmedLink;
    if (tagIds.length > 0) payload.tagIds = tagIds;

    pendingPayloadRef.current = payload;
    setDraftSaved(false);
    try {
      localStorage.setItem(
        LOCAL_DRAFT_KEY,
        JSON.stringify({ draftId: draftIdRef.current, payload } satisfies LocalDraft),
      );
    } catch {
      // Storage full/blocked — the server autosave still runs.
    }

    const timer = setTimeout(() => void persistDraft(), DRAFT_AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [type, title, body, link, tagIds, persistDraft]);

  function continueDraft(draft: DraftListItem) {
    applyPayload(draft.payload);
    draftIdRef.current = draft.id;
    setDrafts((current) => current.filter((row) => row.id !== draft.id));
    setRestored(false);
    focusOnExpandRef.current = true;
    setExpanded(true);
  }

  function deleteDraft(draftId: string) {
    setDrafts((current) => current.filter((row) => row.id !== draftId));
    if (draftIdRef.current === draftId) draftIdRef.current = null;
    apiDelete(`/api/me/drafts/${draftId}`).catch(() => {
      // Idempotent server-side; a failed delete just leaves a stale row.
    });
  }

  function clearDraftAfterPublish() {
    if (draftIdRef.current) {
      apiDelete(`/api/me/drafts/${draftIdRef.current}`).catch(() => {});
      draftIdRef.current = null;
    }
    pendingPayloadRef.current = null;
    try {
      localStorage.removeItem(LOCAL_DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  // --- existing composer behaviour -------------------------------------------

  function onLinkBlur() {
    const raw = link.trim();
    if (!raw) {
      setLinkNotice(false);
      return;
    }
    // §27: non-blocking teaching notice — unknown/unparseable links still
    // post as plain URLs behind the /out interstitial.
    const detected = detectLink(raw);
    setLinkNotice(detected === null || detected.kind === 'external');
  }

  function setPollOption(index: number, text: string) {
    setPollOptions((current) => current.map((row, i) => (i === index ? text : row)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      // Shaped to lib/plaza/schemas postCreateSchema: optionals are omitted,
      // never sent as undefined/empty.
      const payload: Record<string, unknown> = { type, body: body.trim() };
      const trimmedTitle = title.trim();
      if (trimmedTitle) payload.title = trimmedTitle;
      const trimmedLink = link.trim();
      if (trimmedLink) payload.linkUrl = trimmedLink;
      if (images.length > 0) payload.imageIds = images.map((image) => image.id);
      if (tagIds.length > 0) payload.tagIds = tagIds;
      if (type === 'poll') {
        payload.options = pollOptions.map((option) => option.trim()).filter(Boolean);
        payload.closesInDays = pollDays;
      }

      // Route returns { post: PostView }; the row id lives at post.post.id.
      const { post } = await apiPost<{ post: { post: { id: string } } }>('/api/posts', payload);
      clearDraftAfterPublish();
      router.push(`/p/${post.post.id}`);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  const visibleDrafts = drafts.filter((row) => row.id !== draftIdRef.current);

  // Shared between the collapsed and expanded renders: the title, the
  // draft-restored banner, and the "continue a draft" picker (continueDraft
  // expands, so drafts stay reachable while collapsed).
  const header = (
    <>
      <h2 className="xidig-section__title">{t('plaza.composerTitle')}</h2>

      {restored ? <Banner kind="notice">{t('plaza.draftRestored')}</Banner> : null}

      {visibleDrafts.length > 0 ? (
        <section className="xidig-drafts" aria-label={t('plaza.draftsHeading')}>
          <p className="xidig-field__hint">{t('plaza.draftsHeading')}</p>
          <ul className="xidig-drafts__list">
            {visibleDrafts.map((draft) => {
              const snippet =
                draft.payload.title?.trim() ||
                draft.payload.body?.trim().slice(0, DRAFT_SNIPPET_LENGTH) ||
                t('plaza.draftUntitled');
              return (
                <li key={draft.id} className="xidig-drafts__row">
                  <span className="xidig-drafts__snippet">
                    {snippet}
                    <span className="xidig-card__meta">
                      {' · '}
                      {formatRelativeTime(new Date(draft.updated_at), locale)}
                    </span>
                  </span>
                  <span className="xidig-drafts__actions">
                    <button
                      type="button"
                      className="xidig-button xidig-button--secondary"
                      onClick={() => continueDraft(draft)}
                    >
                      {t('plaza.draftContinue')}
                    </button>
                    <button
                      type="button"
                      className="xidig-button xidig-button--secondary"
                      aria-label={t('plaza.draftDeleteLabel', { name: snippet })}
                      onClick={() => deleteDraft(draft.id)}
                    >
                      {t('action.delete')}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );

  if (!expanded) {
    return (
      <section className="xidig-section">
        {header}
        {/* A one-way reveal whose trigger unmounts on activation is a plain
            button — aria-expanded would promise a collapse that never comes. */}
        <button
          type="button"
          className="xidig-composer-prompt"
          onClick={() => {
            focusOnExpandRef.current = true;
            setExpanded(true);
          }}
        >
          {t('plaza.composerPrompt')}
        </button>
      </section>
    );
  }

  return (
    <section className="xidig-section">
      {header}

      <ButtonTabs<PostType>
        label={t('plaza.composerTitle')}
        idBase="composer-type"
        panelId="composer-panel"
        value={type}
        onChange={setType}
        tabs={POST_TYPES.map((candidate) => ({
          value: candidate,
          label: t(TYPE_LABEL_KEYS[candidate]),
        }))}
      />

      <div role="tabpanel" id="composer-panel" aria-labelledby={`composer-type-tab-${type}`}>
      <p className="xidig-field__hint">{t(TYPE_HINT_KEYS[type])}</p>

      <form className="xidig-form" onSubmit={submit}>
        {error ? <PlainErrorBanner error={error} /> : null}

        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="composer-title">
            {t('plaza.titleLabel')}
          </label>
          <input
            id="composer-title"
            className="xidig-field__input"
            maxLength={POST_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="composer-body">
            {t(BODY_LABEL_KEYS[type])}
          </label>
          <MentionAutocomplete
            id="composer-body"
            value={body}
            onChange={setBody}
            rows={4}
            maxLength={POST_BODY_MAX}
          />
        </div>

        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="composer-link">
            {t('plaza.linkLabel')}
          </label>
          <input
            id="composer-link"
            className="xidig-field__input"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onBlur={onLinkBlur}
          />
          <p className="xidig-field__hint">{t('plaza.linkHint')}</p>
          {linkNotice ? <Banner kind="notice">{t('plaza.linkNotEmbeddable')}</Banner> : null}
        </div>

        <TagPicker value={tagIds} onChange={setTagIds} />

        {lowBandwidth ? null : <ImagePicker value={images} onChange={setImages} />}

        {type === 'poll' ? (
          <>
            <fieldset className="xidig-field">
              <legend className="xidig-field__label">{t('plaza.pollOptionsLabel')}</legend>
              <div className="xidig-row-editor">
                {pollOptions.map((option, index) => (
                  <div key={index} className="xidig-row-editor__row">
                    <input
                      className="xidig-field__input"
                      placeholder={t('plaza.pollOptionPlaceholder', { n: index + 1 })}
                      aria-label={t('plaza.pollOptionPlaceholder', { n: index + 1 })}
                      maxLength={POLL_OPTION_LABEL_MAX}
                      value={option}
                      onChange={(e) => setPollOption(index, e.target.value)}
                    />
                    {pollOptions.length > POLL_OPTIONS_MIN ? (
                      <button
                        type="button"
                        className="xidig-button xidig-button--secondary"
                        aria-label={t('a11y.removeRow')}
                        onClick={() =>
                          setPollOptions((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        {t('action.remove')}
                      </button>
                    ) : null}
                  </div>
                ))}
                {pollOptions.length < POLL_OPTIONS_MAX ? (
                  <button
                    type="button"
                    className="xidig-button xidig-button--secondary"
                    onClick={() => setPollOptions((current) => [...current, ''])}
                  >
                    {t('action.add')}
                  </button>
                ) : null}
              </div>
            </fieldset>

            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor="composer-poll-days">
                {t('plaza.pollDurationLabel')}
              </label>
              <select
                id="composer-poll-days"
                className="xidig-field__input"
                value={pollDays}
                onChange={(e) => setPollDays(Number(e.target.value))}
              >
                {POLL_DAY_CHOICES.map((days) => (
                  <option key={days} value={days}>
                    {t('plaza.pollDurationDays', { count: days })}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        <p className="xidig-profile__actions">
          <button
            type="submit"
            className="xidig-button xidig-button--primary"
            disabled={pending || !body.trim()}
          >
            {t('action.post')}
          </button>
          {draftSaved ? (
            <span className="xidig-card__meta" role="status">
              {t('plaza.draftSaved')}
            </span>
          ) : null}
        </p>
      </form>
      </div>
    </section>
  );
}
