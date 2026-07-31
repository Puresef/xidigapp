// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { ReactionCounts } from '@/lib/plaza/views';

import { ReactionBar } from './reaction-bar';

vi.mock('@/lib/api-client', () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  apiPut: vi.fn(() => Promise.resolve({ reacted: true })),
  apiDelete: vi.fn(() => Promise.resolve({ reacted: false })),
}));

vi.mock('@/lib/analytics/client', () => ({
  trackClient: vi.fn(),
}));

/**
 * Anti-anchoring contract (31 Jul decision): reaction COUNTS are visible only
 * once the viewer has reacted on that post. Non-reactors still see which
 * reaction types are in play (emoji chips) plus the add trigger — the numbers
 * stay hidden so nobody's first read of a post is anchored by its score.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

function counts(overrides: Partial<ReactionCounts> = {}): ReactionCounts {
  return { fire: 0, strong: 0, mashallah: 0, idea: 0, watching: 0, ...overrides };
}

function mount(ui: React.ReactNode) {
  root = createRoot(container);
  act(() => root!.render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>));
}

function chip(label: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!el) throw new Error(`chip ${label} not found`);
  return el;
}

describe('ReactionBar anti-anchoring', () => {
  it('hides counts from a viewer who has not reacted (chips still render)', () => {
    mount(
      <ReactionBar
        targetKind="post"
        targetId="post-1"
        counts={counts({ fire: 3, watching: 2 })}
        mine={[]}
      />,
    );
    // Both active types render as chips…
    expect(chip('Fire')).toBeTruthy();
    expect(chip('Watching')).toBeTruthy();
    // …but no numbers leak before the viewer reacts.
    expect(container.textContent).not.toContain('3');
    expect(container.textContent).not.toContain('2');
  });

  it('shows counts once the viewer has a reaction on the post', () => {
    mount(
      <ReactionBar
        targetKind="post"
        targetId="post-1"
        counts={counts({ fire: 3, watching: 2 })}
        mine={['fire']}
      />,
    );
    expect(container.textContent).toContain('3');
    // The rule is per-post, not per-type: every chip's count unlocks.
    expect(container.textContent).toContain('2');
  });

  it('reveals counts optimistically when the viewer reacts', () => {
    mount(
      <ReactionBar
        targetKind="post"
        targetId="post-1"
        counts={counts({ fire: 3, watching: 2 })}
        mine={[]}
      />,
    );
    expect(container.textContent).not.toContain('4');
    act(() => {
      chip('Fire').click();
    });
    // Own reaction lands optimistically: fire 3→4 and watching's 2 both show.
    expect(container.textContent).toContain('4');
    expect(container.textContent).toContain('2');
    expect(chip('Fire').getAttribute('aria-pressed')).toBe('true');
  });

  it('re-hides counts when the viewer removes their only reaction (chips stay)', () => {
    mount(
      <ReactionBar
        targetKind="post"
        targetId="post-1"
        counts={counts({ fire: 3, watching: 2 })}
        mine={[]}
      />,
    );
    // React: the gate opens (fire 3→4 optimistically, watching's 2 unlocks).
    act(() => {
      chip('Fire').click();
    });
    expect(container.textContent).toContain('4');
    expect(container.textContent).toContain('2');
    // Unreact the same chip: the viewer has no reaction left on the post, so
    // anti-anchoring re-arms — every number disappears again…
    act(() => {
      chip('Fire').click();
    });
    expect(container.textContent).not.toContain('3');
    expect(container.textContent).not.toContain('2');
    // …but the chips themselves remain (types in play stay visible).
    expect(chip('Fire')).toBeTruthy();
    expect(chip('Watching')).toBeTruthy();
    expect(chip('Fire').getAttribute('aria-pressed')).toBe('false');
  });
});
