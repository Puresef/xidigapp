'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiGet } from '@/lib/api-client';

/**
 * Textarea with @mention autocomplete (Phase 4.5 §13). Drop-in replacement
 * for the composer/comment textareas: typing `@` plus a character queries the
 * member directory (`GET /api/profiles?q=`, debounced) and offers up to five
 * handles. Keyboard: ↑/↓ move, Enter/Tab insert, Escape dismisses. The popup
 * is a listbox wired via aria-activedescendant so screen readers track the
 * highlighted option. Search failures fail silent — typing is never blocked.
 */

interface ProfileHit {
  user_id: string;
  display_name: string;
  handle: string;
}

/** The `@prefix` token immediately before the caret (mirrors lib/mentions.ts). */
const ACTIVE_MENTION_RE = /(?:^|[^a-z0-9_@])@([a-z0-9_]{1,30})$/i;

const DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 5;

interface ActiveQuery {
  term: string;
  /** Index of the `@` in the textarea value. */
  start: number;
}

export function MentionAutocomplete({
  id,
  value,
  onChange,
  rows = 3,
  maxLength,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  maxLength?: number | undefined;
  disabled?: boolean;
}) {
  const t = useT();
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<ActiveQuery | null>(null);
  const [options, setOptions] = useState<ProfileHit[]>([]);
  const [active, setActive] = useState(0);

  const open = query !== null && options.length > 0;
  const term = query?.term ?? null;

  useEffect(() => {
    if (term === null) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiGet<{ profiles: ProfileHit[] }>(
        `/api/profiles?q=${encodeURIComponent(term)}&limit=${MAX_SUGGESTIONS}`,
      )
        .then((page) => {
          if (cancelled) return;
          setOptions(page.profiles.slice(0, MAX_SUGGESTIONS));
          setActive(0);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  /** Re-derive the active `@token` from the DOM caret position. */
  function syncQuery() {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const match = ACTIVE_MENTION_RE.exec(el.value.slice(0, caret));
    if (!match || match[1] === undefined) {
      setQuery(null);
      return;
    }
    setQuery({ term: match[1], start: caret - match[1].length - 1 });
  }

  function close() {
    setQuery(null);
    setOptions([]);
  }

  function insert(handle: string) {
    const el = textareaRef.current;
    if (!el || !query) return;
    const caret = el.selectionStart ?? el.value.length;
    const next = `${value.slice(0, query.start)}@${handle} ${value.slice(caret)}`;
    onChange(next);
    close();
    const newCaret = query.start + handle.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current - 1 + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const hit = options[active];
      if (hit) {
        event.preventDefault();
        insert(hit.handle);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  return (
    <div className="xidig-mention">
      <textarea
        ref={textareaRef}
        id={id}
        className="xidig-field__input"
        rows={rows}
        {...(maxLength !== undefined ? { maxLength } : {})}
        disabled={disabled}
        value={value}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          syncQuery();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={syncQuery}
        onClick={syncQuery}
        onBlur={() => {
          // Delay so an option mousedown (which preventDefaults) still lands.
          setTimeout(close, 150);
        }}
      />
      {open ? (
        <ul id={listId} role="listbox" aria-label={t('social.mentionsLabel')} className="xidig-mention__list">
          {options.map((profile, index) => (
            <li key={profile.user_id} role="presentation">
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`xidig-mention__item${index === active ? ' xidig-mention__item--active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insert(profile.handle);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <strong>{profile.display_name}</strong> @{profile.handle}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
