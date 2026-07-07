'use client';

import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { TAGS_PER_POST_MAX } from '@/lib/plaza/constants';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Post tag selection (§15): pick from the shared tag list or mint a new tag
 * inline (POST /api/tags normalizes + dedupes server-side; tag_invalid /
 * tag_limit come back as §27 plain errors). Selection is capped at
 * TAGS_PER_POST_MAX — unselected chips disable at the cap so the limit is
 * visible, not silent.
 */

interface TagOption {
  id: string;
  name: string;
}

export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useT();
  const [tags, setTags] = useState<TagOption[]>([]);
  const [newName, setNewName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ tags: TagOption[] }>('/api/tags')
      .then((page) => {
        if (!cancelled) setTags(page.tags);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const atCap = value.length >= TAGS_PER_POST_MAX;

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((selected) => selected !== id));
    } else if (!atCap) {
      onChange([...value, id]);
    }
  }

  async function addTag() {
    const name = newName.trim();
    if (!name || pending) return;
    setPending(true);
    setError(null);
    try {
      const { tag } = await apiPost<{ tag: TagOption }>('/api/tags', { name });
      setTags((current) =>
        current.some((row) => row.id === tag.id) ? current : [...current, tag],
      );
      if (!value.includes(tag.id) && !atCap) onChange([...value, tag.id]);
      setNewName('');
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="xidig-field">
      <span className="xidig-field__label">{t('plaza.tagsLabel')}</span>
      <p className="xidig-field__hint">{t('plaza.tagsHint', { max: TAGS_PER_POST_MAX })}</p>
      {error ? <PlainErrorBanner error={error} /> : null}
      {tags.length > 0 ? (
        <div className="xidig-chip-row">
          {tags.map((tag) => {
            const selected = value.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className="xidig-tag"
                aria-pressed={selected}
                disabled={!selected && atCap}
                onClick={() => toggle(tag.id)}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="xidig-row-editor__row">
        <input
          className="xidig-field__input"
          aria-label={t('plaza.tagsLabel')}
          maxLength={80}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            // The picker lives inside the composer <form> — Enter here must
            // mint the tag, not submit the whole post.
            if (e.key === 'Enter') {
              e.preventDefault();
              void addTag();
            }
          }}
        />
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={pending || !newName.trim()}
          onClick={() => void addTag()}
        >
          {t('action.add')}
        </button>
      </div>
    </div>
  );
}
