'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Button-driven tab switcher implementing the full APG tabs contract that
 * role="tablist" announces: roving tabindex (the selected tab is the only tab
 * stop), arrow-key/Home/End movement with selection following focus, and
 * aria-controls wiring when the caller identifies its panel. The active-tab
 * styling in globals.css keys off [aria-selected] for button tabs — link tab
 * rows keep using aria-current instead.
 */

export interface ButtonTabItem<V extends string> {
  value: V;
  label: ReactNode;
}

export function ButtonTabs<V extends string>({
  label,
  idBase,
  tabs,
  value,
  onChange,
  panelId,
}: {
  label: string;
  /** Prefix for per-tab ids (`{idBase}-tab-{value}`), for aria-labelledby. */
  idBase: string;
  tabs: ReadonlyArray<ButtonTabItem<V>>;
  value: V;
  onChange: (next: V) => void;
  /** Id of the tabpanel these tabs control, when the caller renders one. */
  panelId?: string;
}) {
  const refs = useRef(new Map<V, HTMLButtonElement>());

  function moveTo(event: KeyboardEvent, position: number | 'home' | 'end') {
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.value === value);
    const nextIndex =
      position === 'home'
        ? 0
        : position === 'end'
          ? tabs.length - 1
          : (index + position + tabs.length) % tabs.length;
    const target = tabs[nextIndex];
    if (!target || target.value === value) return;
    onChange(target.value);
    refs.current.get(target.value)?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        moveTo(event, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        moveTo(event, -1);
        break;
      case 'Home':
        moveTo(event, 'home');
        break;
      case 'End':
        moveTo(event, 'end');
        break;
    }
  }

  return (
    <div role="tablist" aria-label={label} className="xidig-tabs" onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              if (el) refs.current.set(tab.value, el);
              else refs.current.delete(tab.value);
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.value}`}
            className="xidig-tabs__tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            {...(panelId ? { 'aria-controls': panelId } : {})}
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
