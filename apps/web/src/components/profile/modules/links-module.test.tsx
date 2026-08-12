// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { AnigaLink } from '@/lib/aniga/view';
import { LITE_BUNDLES } from '@/lib/lite/prefs';

import { LinksModule, type LinksModuleProps } from './links-module';

/**
 * Bogagga dibadda — the Xaqiiq ladder, tier by tier (spec §3.3, state v6).
 *
 * The load-bearing suite here is A6: **an OG fetch that failed leaves no trace
 * in the DOM.** Asserting the card is invisible would pass on a `display:none`
 * box still holding 96px of layout open, which is the precise regression the
 * criterion exists to catch — so the assertions are structural (no node, no
 * element reserving height) and, stronger still, byte-equality with a link
 * that never had a preview. Failure must be indistinguishable from absence.
 *
 * jsdom rather than string matching: "reserves no space" is a question about
 * the element tree, and a substring check cannot answer it.
 */

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getLocale: async () => 'so', getT: async () => createTranslator('so') };
});

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'so', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

function link(over: Partial<AnigaLink> = {}): AnigaLink {
  return {
    label: 'GitHub',
    url: 'https://github.com/hodan-c',
    urlKey: 'github.com/hodan-c',
    verificationStatus: 'unverified',
    ogStatus: 'failed',
    ogTitle: null,
    ogSiteName: null,
    ogImageUrl: null,
    verificationToken: null,
    ...over,
  };
}

const WITH_PREVIEW = link({
  label: 'hodan.dev',
  url: 'https://hodan.dev/suuq-card',
  urlKey: 'hodan.dev/suuq-card',
  ogStatus: 'ok',
  ogTitle: 'Sida aan u dhisnay lacag-bixinta Suuq-Card',
  ogSiteName: 'hodan.dev',
  ogImageUrl: 'https://cdn.test/og-suuq-card.webp',
});

function render(over: Partial<LinksModuleProps> & Pick<LinksModuleProps, 'links'>) {
  const props: LinksModuleProps = {
    viewer: 'member',
    addHref: '/settings/profile',
    prefs: LITE_BUNDLES.everything,
    ...over,
  };
  return mount(createElement(LinksModule, props));
}

describe('tier 1 — the chip always stands', () => {
  it('gives visitors a real destination and the owner a label', async () => {
    const visitor = await render({ links: [link()] });
    const anchor = visitor.querySelector<HTMLAnchorElement>('a.xidig-alinks__chip');
    expect(anchor?.getAttribute('href')).toBe('https://github.com/hodan-c');
    // Member-supplied outbound link on a public page.
    expect(anchor?.getAttribute('rel')).toContain('nofollow');
    expect(anchor?.getAttribute('rel')).toContain('ugc');

    const owner = await render({ links: [link()], viewer: 'owner' });
    expect(owner.querySelector('a.xidig-alinks__chip')).toBeNull();
    expect(owner.querySelector('span.xidig-alinks__chip')).not.toBeNull();
    // …and the one control that edits them.
    expect(owner.querySelector('.xidig-alinks__add')?.textContent).toContain('Ku dar');
  });

  it('renders no module for a visitor when the member has no links', async () => {
    const visitor = await render({ links: [] });
    expect(visitor.querySelector('[data-module="links"]')).toBeNull();
    expect(visitor.children).toHaveLength(0);
  });
});

describe('tier 3 — the check is granted, never claimed', () => {
  it('marks a verified link and nothing else', async () => {
    const html = await render({
      links: [link({ verificationStatus: 'verified' }), link({ urlKey: 'linkedin.com/in/hodan' })],
    });
    const checks = html.querySelectorAll('.xidig-alinks__check');
    expect(checks).toHaveLength(1);
    expect(checks[0]?.getAttribute('title')).toBe('La xaqiijiyay');
    // The disc carries the claim alone, so it names itself for AT.
    expect(checks[0]?.getAttribute('aria-label')).toBe('La xaqiijiyay');
  });

  it('shows a pending check as waiting — not as verified', async () => {
    const html = await render({ links: [link({ verificationStatus: 'pending' })] });
    expect(html.querySelector('.xidig-alinks__check')).toBeNull();
    expect(html.querySelector('.xidig-alinks__pending')?.textContent).toBe('Sugaya');
    expect(html.querySelector('.xidig-alinks__chip--pending')).not.toBeNull();
  });

  it('only names a verified site in the visitor note when one exists', async () => {
    const none = await render({ links: [link()] });
    expect(none.querySelector('.xidig-amodule__note')).toBeNull();

    const some = await render({ links: [link({ verificationStatus: 'verified' })] });
    expect(some.querySelector('.xidig-amodule__note')?.textContent).toContain('GitHub');
  });
});

describe('tier 2 — the preview card', () => {
  it('renders title and source when the fetch succeeded', async () => {
    const html = await render({ links: [WITH_PREVIEW] });
    const card = html.querySelector('.xidig-alinks__preview');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Sida aan u dhisnay lacag-bixinta Suuq-Card');
    expect(card?.textContent).toContain('hodan.dev');
    // The thumb is media like any other — Lite defers it, nothing else does.
    expect(card?.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/og-suuq-card.webp',
    );
  });

  it('defers the thumb in Lite without dropping the card', async () => {
    const html = await render({ links: [WITH_PREVIEW], prefs: LITE_BUNDLES.essentials });
    const card = html.querySelector('.xidig-alinks__preview');
    expect(card?.textContent).toContain('Sida aan u dhisnay lacag-bixinta Suuq-Card');
    expect(card?.querySelector('img')).toBeNull();
    expect(card?.querySelector('.xidig-media-slot__show')?.textContent).toBe('Muuji');
  });
});

describe('A6 — a failed fetch degrades to the chip with no layout shift', () => {
  it('renders no card and reserves no space', async () => {
    const html = await render({ links: [link({ ogStatus: 'failed' })] });

    expect(html.querySelector('.xidig-alinks__preview')).toBeNull();
    // The slot frame is what holds an aspect-ratio box open; not one may exist.
    expect(html.querySelector('.xidig-media-slot')).toBeNull();

    // Structural, not stylistic: the module body holds the chip row and
    // nothing else — no wrapper mapped over an empty list, no placeholder.
    const body = html.querySelector('.xidig-amodule__body');
    expect(body?.children).toHaveLength(1);
    expect(body?.children[0]?.className).toContain('xidig-alinks__chips');

    // And nothing in the tree is quietly holding height open.
    for (const node of Array.from(html.querySelectorAll<HTMLElement>('*'))) {
      expect(node.style.height, node.className).toBe('');
      expect(node.style.minHeight, node.className).toBe('');
      expect(node.style.aspectRatio, node.className).toBe('');
      expect(node.style.paddingTop, node.className).toBe('');
    }
  });

  it('detects reserved space when there IS some (control)', async () => {
    // Proves the sweep above can fail: a Lite-deferred thumb legitimately
    // holds its box open, and the same sweep finds it.
    const html = await render({ links: [WITH_PREVIEW], prefs: LITE_BUNDLES.essentials });
    const reserved = Array.from(html.querySelectorAll<HTMLElement>('*')).filter(
      (node) => node.style.aspectRatio !== '',
    );
    expect(reserved.length).toBeGreaterThan(0);
  });

  it('is byte-identical to a link that never had a preview', async () => {
    // Stale OG columns from an earlier successful fetch must not resurface:
    // og_status is the only field that decides tier 2.
    const stale = await render({
      links: [
        link({
          ogStatus: 'failed',
          ogTitle: 'Sida aan u dhisnay lacag-bixinta Suuq-Card',
          ogSiteName: 'hodan.dev',
          ogImageUrl: 'https://cdn.test/og-suuq-card.webp',
        }),
      ],
    });
    const never = await render({ links: [link()] });
    expect(stale.innerHTML).toBe(never.innerHTML);
  });

  it('holds no skeleton open while a fetch is still pending', async () => {
    // A skeleton that later collapses IS the layout shift, one frame late.
    const pending = await render({ links: [link({ ogStatus: 'pending' })] });
    const never = await render({ links: [link()] });
    expect(pending.innerHTML).toBe(never.innerHTML);
  });

  it('keeps every other preview when one link fails', async () => {
    const html = await render({ links: [link({ ogStatus: 'failed' }), WITH_PREVIEW] });
    expect(html.querySelectorAll('.xidig-alinks__chip')).toHaveLength(2);
    expect(html.querySelectorAll('.xidig-alinks__preview')).toHaveLength(1);
  });
});

describe('placement', () => {
  it('explains the ladder in the visitor rail, not in the main column', async () => {
    const rail = await render({
      links: [link({ verificationStatus: 'verified' })],
      placement: 'rail',
    });
    expect(rail.querySelector('.xidig-alinks__ladder-title')?.textContent).toBe(
      'Jaranjarada xaqiijinta',
    );
    expect(rail.querySelector('.xidig-amodule__note')?.textContent).toContain('jaranjarada Xaqiiq');

    const column = await render({ links: [link({ verificationStatus: 'verified' })] });
    expect(column.querySelector('.xidig-alinks__ladder')).toBeNull();
  });

  it('never shows the owner the visitor-facing ladder explainer', async () => {
    const owner = await render({
      links: [link({ verificationStatus: 'verified' })],
      viewer: 'owner',
      placement: 'rail',
    });
    expect(owner.querySelector('.xidig-alinks__ladder')).toBeNull();
  });
});
