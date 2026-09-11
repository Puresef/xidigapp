// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { GarabButton } from './garab-button';

/**
 * Packet B — Show support on a resolved Codsi, live DOM. The count is visible
 * before, during and after taking part (the retired rule hid it until the
 * viewer co-signed — a reveal reward the owner ruling removes), and the
 * control walks Show support → Supporting (described by "Remove support") →
 * Show support. The route and response field keep their `cosign` identity.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiPut = vi.fn();
const apiDelete = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiPut: (...args: unknown[]) => apiPut(...args),
  apiDelete: (...args: unknown[]) => apiDelete(...args),
  ApiRequestError: class extends Error {},
}));

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  apiPut.mockReset();
  apiDelete.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

function mount(initialCount: number, initialMine = false) {
  root = createRoot(container);
  act(() =>
    root!.render(
      <LocaleProvider initialLocale="en">
        <GarabButton postId="p1" fulfilled initialCount={initialCount} initialMine={initialMine} />
      </LocaleProvider>,
    ),
  );
}

function button(): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('button');
  if (!found) throw new Error('button not found');
  return found;
}

function accessibleName(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function description(el: HTMLElement): string {
  const id = el.getAttribute('aria-describedby');
  return id ? (document.getElementById(id)?.textContent ?? '') : '';
}

function count(): string {
  return container.querySelector('.xidig-codsi-garab__count')?.textContent ?? '';
}

describe('GarabButton (live) — Show support → Supporting → Remove support', () => {
  it('round-trips with the count visible in every state', async () => {
    mount(9);
    expect(accessibleName(button())).toBe('Show support');
    expect(count()).toBe('9 people support this');

    apiPut.mockResolvedValueOnce({ cosigned: true, count: 10 });
    await act(async () => {
      button().click();
    });
    expect(apiPut).toHaveBeenCalledWith('/api/posts/p1/cosign');
    expect(accessibleName(button())).toBe('Supporting');
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(description(button())).toBe('Remove support');
    expect(count()).toBe('10 people support this');

    apiDelete.mockResolvedValueOnce({ cosigned: false, count: 9 });
    await act(async () => {
      button().click();
    });
    expect(apiDelete).toHaveBeenCalledWith('/api/posts/p1/cosign');
    expect(accessibleName(button())).toBe('Show support');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().hasAttribute('aria-describedby')).toBe(false);
    expect(count()).toBe('9 people support this');
    expect(container.textContent).not.toMatch(/co-?sign/i);
  });

  it('the meaning note is present before the first tap, not only after it', () => {
    mount(0);
    expect(container.querySelector('.xidig-codsi-garab__note')?.textContent).toContain(
      'Support is encouragement only',
    );
    expect(count()).toBe('0 people support this');
  });
});

describe('GarabButton — server HTML hydrates cleanly in every state', () => {
  it.each([false, true])('initialMine=%s: no hydration mismatch', (initialMine) => {
    const tree = (
      <LocaleProvider initialLocale="en">
        <GarabButton postId="p1" fulfilled initialCount={3} initialMine={initialMine} />
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
    expect(count()).toBe('3 people support this');
    if (initialMine) expect(description(button())).toBe('Remove support');
  });
});
