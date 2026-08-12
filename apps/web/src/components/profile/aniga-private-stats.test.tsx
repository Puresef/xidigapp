// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import type { Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import { AnigaPrivateStats } from './aniga-private-stats';

/**
 * Owner-private stats (spec §3.6, state a4).
 *
 * The block's promise — "Tirooyinkan cidna ma arkaan" — is only as good as
 * the visitor render, so the central assertion is an ABSENCE: not a hidden
 * node, not an `aria-hidden` wrapper, not an empty section. Nothing. A count
 * that exists in the markup is a count, whatever CSS says about it (A1).
 *
 * The second assertion is about staleness. An offline shell serves numbers it
 * cannot refresh; the honest move is to say how old they are rather than
 * render them as if they were current.
 */

const state = vi.hoisted(() => ({ locale: 'so' as Locale }));

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return {
    getLocale: async () => state.locale,
    getT: async () => createTranslator(state.locale),
  };
});

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: state.locale, children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const DAY = 24 * 60 * 60 * 1000;
const FRESH = { posts: 31, asksHelped: 7, connections: 128, cachedAt: null };

describe('the visitor render carries no numbers, because it carries nothing', () => {
  it('emits no DOM at all when the caller passes null', async () => {
    const html = await mount(createElement(AnigaPrivateStats, { stats: null }));

    expect(html.children).toHaveLength(0);
    expect(html.textContent).toBe('');
    // Structural, not stylistic: there is no node to un-hide in devtools.
    expect(html.querySelector('.xidig-aprivate')).toBeNull();
    expect(html.innerHTML.trim()).toBe('');
  });

  it('emits nothing in the rail variant either', async () => {
    const html = await mount(
      createElement(AnigaPrivateStats, { stats: null, variant: 'rail' as const }),
    );
    expect(html.innerHTML.trim()).toBe('');
  });
});

describe('the owner sees three numbers and who else sees them', () => {
  it('renders the lock title, the frame stats and the privacy note', async () => {
    const html = await mount(createElement(AnigaPrivateStats, { stats: FRESH }));

    expect(html.querySelector('.xidig-aprivate__title')?.textContent).toContain(
      'Adiga kaliya ayaa arka',
    );
    const stats = Array.from(html.querySelectorAll('.xidig-aprivate__stat'));
    expect(stats.map((node) => node.textContent)).toEqual([
      '31Qoraal',
      '7Codsi la caawiyay',
      '128Xiriir',
    ]);
    expect(html.querySelector('.xidig-aprivate__note')?.textContent).toBe(
      'Tirooyinkan cidna ma arkaan. Profile-kaagu wuxuu tusaa waxa aad samaysay — ma aha inta jeer.',
    );
  });

  it('spells the labels out in the desktop rail (5c)', async () => {
    const html = await mount(
      createElement(AnigaPrivateStats, { stats: FRESH, variant: 'rail' as const }),
    );
    const stats = Array.from(html.querySelectorAll('.xidig-aprivate__stat'));
    expect(stats.map((node) => node.textContent)).toEqual([
      '31Qoraal la daabacay',
      '7Codsi aad caawisay',
      '128Xiriir',
    ]);
  });
});

describe('a4 — a cached shell says so instead of implying freshness', () => {
  it('states the cache age above the numbers', async () => {
    const cachedAt = new Date(Date.now() - 3 * DAY).toISOString();
    const html = await mount(createElement(AnigaPrivateStats, { stats: { ...FRESH, cachedAt } }));

    const cache = html.querySelector('.xidig-aprivate__cache');
    // Frame-verbatim, and the age itself comes from the dictionary's time.*
    // helpers — Intl.RelativeTimeFormat would have emitted English here.
    expect(cache?.textContent).toBe('Kayd: 3 maalmood ka hor');
    expect(cache?.querySelector('time')?.getAttribute('datetime')).toBe(cachedAt);

    // Above, so it is read before the figures are trusted.
    const nodes = Array.from(
      html.querySelectorAll('.xidig-aprivate__cache, .xidig-aprivate__grid'),
    );
    expect(nodes[0]?.className).toContain('xidig-aprivate__cache');
  });

  it('says nothing about caching on a fresh server render', async () => {
    const html = await mount(createElement(AnigaPrivateStats, { stats: FRESH }));
    expect(html.querySelector('.xidig-aprivate__cache')).toBeNull();
  });
});
