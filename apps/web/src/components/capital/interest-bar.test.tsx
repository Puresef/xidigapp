// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import type { InterestCounts } from '@/lib/capital/views';

import { InterestBar } from './interest-bar';

/**
 * Packet B — the /c/[id] support control (Garab, interest_type 'cosign').
 *
 * Owner ruling: the English label is "Support" (never "Co-sign"), with
 * one three-state vocabulary — Support → Supporting → Remove support —
 * and a count that reads as people. Support is encouragement only: it is
 * not an investment, a vote, a review or a verification, and it unlocks
 * nothing, so the count is identical for supporters and non-supporters and
 * taking support back updates the number without hiding it.
 *
 * Live DOM so the toggle round-trip (default → supporting → removed) runs the
 * real component; the API client is mocked. Mechanics are unchanged: the POST
 * still sends type 'cosign' and the DELETE still retracts ?type=cosign.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiPost = vi.fn();
const apiDelete = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiPost: (...args: unknown[]) => apiPost(...args),
  apiDelete: (...args: unknown[]) => apiDelete(...args),
  ApiRequestError: class extends Error {},
}));

const CANDIDATE = '0b7c2f7e-1111-4a2b-9c3d-5e6f7a8b9c0d';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  apiPost.mockReset();
  apiDelete.mockReset();
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

function counts(cosign: number, help = 2): InterestCounts {
  return { help, cosign };
}

function mount(props: { cosign: number; mine?: ('cosign' | 'help')[]; locale?: Locale }) {
  root = createRoot(container);
  act(() =>
    root!.render(
      <LocaleProvider initialLocale={props.locale ?? 'en'}>
        <InterestBar
          candidateId={CANDIDATE}
          initialCounts={counts(props.cosign)}
          initialInterests={props.mine ?? []}
        />
      </LocaleProvider>,
    ),
  );
}

/** The accessible name a button exposes: aria-label, else its text minus
 *  aria-hidden subtrees (the dabqaad icon is decorative). */
function accessibleName(el: HTMLElement): string {
  const label = el.getAttribute('aria-label');
  if (label) return label.trim();
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function accessibleDescription(el: HTMLElement): string {
  const ids = el.getAttribute('aria-describedby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

/** The support toggle is the first action; "I can help" is the second. */
function supportButton(): HTMLButtonElement {
  const button = container.querySelectorAll<HTMLButtonElement>(
    '.xidig-capital-interest__actions button',
  )[0];
  if (!button) throw new Error('support button not found');
  return button;
}

function helpButton(): HTMLButtonElement {
  const button = container.querySelectorAll<HTMLButtonElement>(
    '.xidig-capital-interest__actions button',
  )[1];
  if (!button) throw new Error('help button not found');
  return button;
}

function text(): string {
  return container.textContent ?? '';
}

describe('InterestBar — default state', () => {
  it('names the control "Support", never "Support" or "Co-sign"', () => {
    mount({ cosign: 3 });
    expect(accessibleName(supportButton())).toBe('Support');
    expect(text()).not.toMatch(/show support/i);
    expect(supportButton().getAttribute('aria-pressed')).toBe('false');
    expect(supportButton().hasAttribute('aria-describedby')).toBe(false);
    expect(text()).not.toMatch(/co-?sign/i);
  });

  it('says support, not financial backing, in the section heading', () => {
    mount({ cosign: 3 });
    const section = container.querySelector('section')!;
    expect(section.getAttribute('aria-label')).toBe('Support this venture');
    expect(container.querySelector('h2')?.textContent).toBe('Support this venture');
    expect(text()).not.toMatch(/\bback(ing)?\b/i);
    expect(text()).not.toMatch(/invest(ing|ment)? (now|today)|maalgeli|pledge|fund this/i);
  });

  it('shows the count as people, to everyone, before any interaction', () => {
    mount({ cosign: 3 });
    expect(text()).toContain('3 people support this');
  });

  it('uses the singular and a truthful zero', () => {
    mount({ cosign: 1 });
    expect(text()).toContain('1 person supports this');
    act(() => root!.unmount());
    root = null;
    mount({ cosign: 0 });
    expect(text()).toContain('0 people support this');
  });

  it('states what support is NOT under the actions', () => {
    mount({ cosign: 3 });
    const note = container.querySelector('.xidig-capital-interest__note')?.textContent ?? '';
    expect(note).toBe(
      'Support is encouragement only — not an investment, a vote, a rating, or a check of anyone’s work.',
    );
  });
});

describe('InterestBar — supporting and removal (the count never hides)', () => {
  it('supporter and non-supporter see the identical count (support unlocks nothing)', () => {
    mount({ cosign: 7 });
    const asViewer = text().match(/\d+ people support this/)?.[0];
    act(() => root!.unmount());
    root = null;
    mount({ cosign: 7, mine: ['cosign'] });
    const asSupporter = text().match(/\d+ people support this/)?.[0];
    expect(asViewer).toBe('7 people support this');
    expect(asSupporter).toBe(asViewer);
  });

  it('Support → Supporting (described by "Remove support") → Support, count updating but always visible', async () => {
    mount({ cosign: 3 });

    apiPost.mockResolvedValueOnce({ counts: counts(4) });
    await act(async () => {
      supportButton().click();
    });
    expect(apiPost).toHaveBeenCalledWith(`/api/candidates/${CANDIDATE}/interests`, {
      type: 'cosign',
    });
    expect(accessibleName(supportButton())).toBe('Supporting');
    expect(supportButton().getAttribute('aria-pressed')).toBe('true');
    expect(accessibleDescription(supportButton())).toBe('Remove support');
    expect(text()).toContain('4 people support this');

    apiDelete.mockResolvedValueOnce({ counts: counts(3) });
    await act(async () => {
      supportButton().click();
    });
    expect(apiDelete).toHaveBeenCalledWith(`/api/candidates/${CANDIDATE}/interests?type=cosign`);
    expect(accessibleName(supportButton())).toBe('Support');
    expect(supportButton().getAttribute('aria-pressed')).toBe('false');
    expect(supportButton().hasAttribute('aria-describedby')).toBe(false);
    // Removing your own support updates the number — it never hides it.
    expect(text()).toContain('3 people support this');
    expect(text()).not.toMatch(/co-?sign/i);
  });

  it('supporting does not touch the separate "I can help" offer', async () => {
    mount({ cosign: 3 });
    apiPost.mockResolvedValueOnce({ counts: counts(4) });
    await act(async () => {
      supportButton().click();
    });
    expect(accessibleName(helpButton())).toBe('I can help');
    expect(helpButton().getAttribute('aria-pressed')).toBe('false');
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
});

describe('InterestBar — Somali uses the provisional Taageer (native review pending)', () => {
  it('renders the provisional Taageer / La taageeray and "{count} qof ayaa taageeray" — never Garab', async () => {
    mount({ cosign: 3, locale: 'so' });
    expect(accessibleName(supportButton())).toBe('Taageer');
    expect(text()).toContain('3 qof ayaa taageeray');
    apiPost.mockResolvedValueOnce({ counts: counts(4) });
    await act(async () => {
      supportButton().click();
    });
    expect(accessibleName(supportButton())).toBe('La taageeray');
    expect(accessibleDescription(supportButton())).toBeTruthy();
    expect(text()).toContain('4 qof ayaa taageeray');
  });
});

describe('InterestBar — server HTML hydrates cleanly in every state', () => {
  it.each([
    ['not supporting', [] as ('cosign' | 'help')[]],
    ['supporting', ['cosign'] as ('cosign' | 'help')[]],
  ])('%s: no hydration mismatch (the useId remove hint included)', (_label, mine) => {
    const tree = (
      <LocaleProvider initialLocale="en">
        <InterestBar candidateId={CANDIDATE} initialCounts={counts(5)} initialInterests={mine} />
      </LocaleProvider>
    );
    container.innerHTML = renderToString(tree);
    const recoverable: unknown[] = [];
    act(() => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });
    expect(recoverable).toEqual([]);
    expect(text()).toContain('5 people support this');
    if (mine.length) expect(accessibleDescription(supportButton())).toBe('Remove support');
  });
});
