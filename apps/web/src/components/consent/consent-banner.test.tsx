// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { LITE_BUNDLES } from '@/lib/lite/prefs';

/**
 * Consent banner contract (Task 6, 31 Jul): the three consent actions keep
 * their UK-GDPR equal-prominence parity (the Lite shortcut is a secondary
 * row, NOT a fourth button); the title is a real <h2> in a polite live
 * region; and the Lite shortcut runs the shared write path — cookies flip
 * BEFORE the reload fires (xidig_lite is the rendering source of truth), the
 * settings mirror is awaited, and a failed mirror still reloads.
 */

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  trackClient: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiPost: mocks.apiPost,
  apiPatch: mocks.apiPatch,
  ApiRequestError: class ApiRequestError extends Error {
    constructor(public readonly plain: { code: string; message: string }) {
      super(plain.message);
    }
  },
}));

vi.mock('@/lib/analytics/client', () => ({ trackClient: mocks.trackClient }));

// jsdom has no Next app-router context; the banner only needs an anchor.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ConsentBanner } from './consent-banner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiPost.mockResolvedValue({});
  mocks.apiPatch.mockResolvedValue({});
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  // jsdom cookies persist per file — clear between tests.
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
});

function mount(ui: ReactNode) {
  root = createRoot(container);
  act(() => root!.render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>));
}

const banner = () => document.querySelector<HTMLElement>('.xidig-consent');

function buttonByText(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!match) throw new Error(`no button "${text}"`);
  return match;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('ConsentBanner', () => {
  it('renders nothing without needsPrompt', () => {
    mount(<ConsentBanner needsPrompt={false} />);
    expect(banner()).toBeNull();
  });

  it('is a polite live region with a real h2 title', () => {
    mount(<ConsentBanner needsPrompt />);
    const region = banner()!;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-label')).toBe('Privacy choices');
    const title = region.querySelector('.xidig-consent__title')!;
    expect(title.tagName).toBe('H2');
    // No focus steal on mount — non-modal by design.
    expect(document.activeElement).not.toBe(title);
  });

  it('keeps three-way parity: the Lite shortcut is not a fourth action button', () => {
    mount(<ConsentBanner needsPrompt />);
    const actionButtons = banner()!.querySelectorAll('.xidig-consent__actions .xidig-button');
    expect(actionButtons.length).toBe(3);
    // Every consent action shares ONE styling class (equal prominence).
    for (const b of actionButtons) {
      expect(b.className).toBe('xidig-button xidig-button--secondary');
    }
    const liteBtn = banner()!.querySelector('.xidig-consent__lite-btn')!;
    expect(liteBtn.classList.contains('xidig-button')).toBe(false);
  });

  it('Accept all posts the consent choice and hides the banner', async () => {
    mount(<ConsentBanner needsPrompt />);
    await click(buttonByText('Accept all'));
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/me/consent', {
      analytics: true,
      errorMonitoring: true,
      method: 'banner',
    });
    expect(banner()).toBeNull();
  });

  it('Lite shortcut: cookies are set BEFORE reload; settings mirror carries the bundle', async () => {
    let cookieAtReload = '';
    const reloadPage = vi.fn(() => {
      cookieAtReload = document.cookie;
    });
    mount(<ConsentBanner needsPrompt reloadPage={reloadPage} />);

    await click(buttonByText('Turn on'));

    expect(reloadPage).toHaveBeenCalledTimes(1);
    // The rendering source of truth was already flipped when reload fired.
    expect(cookieAtReload).toContain('xidig_lite=');
    const encoded = /xidig_lite=([^;]+)/.exec(cookieAtReload)![1]!;
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual(LITE_BUNDLES.essentials);
    // essentials defers animations → the data-motion kill-switch cookie flips
    // too, plus the legacy low-bandwidth cookie.
    expect(cookieAtReload).toContain('xidig_motion=off');
    expect(cookieAtReload).toContain('xidig_lowbw=1');

    expect(mocks.apiPatch).toHaveBeenCalledWith('/api/me/bandwidth', { enabled: true });
    expect(mocks.apiPatch).toHaveBeenCalledWith('/api/me/settings', {
      preferences: { lite: LITE_BUNDLES.essentials, liteBundle: 'essentials' },
    });
    expect(mocks.trackClient).toHaveBeenCalledWith('low_bandwidth_enabled', { enabled: true });
    // The banner did NOT record a consent choice — Lite is not consent.
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it('Lite shortcut still reloads when the server mirrors fail (cookie is truth)', async () => {
    mocks.apiPatch.mockRejectedValue(new Error('offline'));
    const reloadPage = vi.fn();
    mount(<ConsentBanner needsPrompt reloadPage={reloadPage} />);

    await click(buttonByText('Turn on'));

    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(document.cookie).toContain('xidig_lite=');
  });
});
