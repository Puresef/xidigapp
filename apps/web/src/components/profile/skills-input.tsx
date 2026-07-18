'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiGet } from '@/lib/api-client';

/**
 * Skills chip-input with count-guided autocomplete. Typing queries
 * `GET /api/skills?q=` (debounced) and offers matching vocabulary entries with
 * how many members already claim each — so "ecommerce · 10k" outranks
 * "e-com · 1" and everyone converges on the canonical token. A typed term that
 * isn't in the list is offered as a "+ create" option (instant-create: the skill
 * is coined when the profile saves). Search failures fail silent — never blocks.
 *
 * Value is the normalized skill list (lowercase); the DB re-normalizes on save,
 * so this is a UX convenience, not the source of truth.
 */

interface SkillHit {
  name: string;
  member_count: number;
}

type Suggestion =
  | { kind: 'existing'; name: string; count: number }
  | { kind: 'create'; name: string };

const DEBOUNCE_MS = 200;
const SUGGESTION_LIMIT = 8;

/** 1_234 → "1.2k", 12_345 → "12k". */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
}

export function SkillsInput({
  id,
  value,
  onChange,
  max = 50,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const t = useT();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState('');
  const [hits, setHits] = useState<SkillHit[]>([]);
  const [active, setActive] = useState(0);

  const term = text.trim().toLowerCase();
  const atCap = value.length >= max;

  useEffect(() => {
    if (term.length < 1) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiGet<{ skills: SkillHit[] }>(
        `/api/skills?q=${encodeURIComponent(term)}&limit=${SUGGESTION_LIMIT}`,
      )
        .then((page) => {
          if (cancelled) return;
          setHits(page.skills);
          setActive(0);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  // Suggestions: matches not already chosen, plus a create option for a novel term.
  const matches = hits.filter((h) => !value.includes(h.name));
  const isKnown = matches.some((h) => h.name === term) || value.includes(term);
  const suggestions: Suggestion[] = [
    ...matches.map((h) => ({ kind: 'existing' as const, name: h.name, count: h.member_count })),
    ...(term.length >= 1 && !isKnown ? [{ kind: 'create' as const, name: term }] : []),
  ];
  const open = suggestions.length > 0;

  function add(name: string) {
    const norm = name.trim().toLowerCase();
    setText('');
    setHits([]);
    if (!norm || value.includes(norm) || atCap) return;
    onChange([...value, norm]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function remove(name: string) {
    onChange(value.filter((s) => s !== name));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const pick = suggestions[active];
      if (pick) add(pick.name);
      else if (term) add(term);
    } else if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
      remove(value[value.length - 1]!);
    } else if (event.key === 'Escape') {
      setText('');
      setHits([]);
    }
  }

  return (
    <div className="xidig-mention xidig-skills">
      {value.length > 0 ? (
        <div className="xidig-chip-row">
          {value.map((skill) => (
            <span key={skill} className="xidig-tag">
              {skill}
              <button
                type="button"
                className="xidig-skills__x"
                aria-label={t('profile.removeSkill', { name: skill })}
                onClick={() => remove(skill)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        className="xidig-field__input"
        value={text}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={atCap}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setHits([]), 150)}
      />
      {open ? (
        <ul id={listId} role="listbox" aria-label={t('profile.skillSuggestions')} className="xidig-mention__list">
          {suggestions.map((item, index) => (
            <li key={`${item.kind}-${item.name}`} role="presentation">
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`xidig-mention__item${index === active ? ' xidig-mention__item--active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(item.name);
                }}
                onMouseEnter={() => setActive(index)}
              >
                {item.kind === 'create' ? (
                  <span>+ {item.name}</span>
                ) : (
                  <>
                    <span>{item.name}</span>
                    {item.count > 0 ? (
                      <span className="xidig-skills__count">{formatCount(item.count)}</span>
                    ) : null}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
