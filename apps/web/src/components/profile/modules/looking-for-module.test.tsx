// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { AnigaMatch } from '@/lib/aniga/view';

import { LookingForModule, type LookingForModuleProps } from './looking-for-module';

/**
 * Waxaan raadinayaa (spec §3.4). One rule carries the module: **no reason, no
 * row.** The footnote promises the matcher uses only what the member wrote and
 * that every reason is shown, so a row that appears without one silently turns
 * the promise into a lie — and a reason-less match is exactly what a black-box
 * recommender emits. Dropping it is the cheaper failure.
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

function match(over: Partial<AnigaMatch> = {}): AnigaMatch {
  return {
    href: '/labs/suuq-card',
    title: 'Suuq-Card waxay raadinaysaa “amniga xogta”',
    reason: 'Ku habboon xirfaddaada',
    memberCount: 6,
    ...over,
  };
}

function render(over: Partial<LookingForModuleProps> = {}) {
  const props: LookingForModuleProps = {
    slugs: ['cofounding'],
    matches: [match()],
    viewer: 'owner',
    ...over,
  };
  return mount(createElement(LookingForModule, props));
}

describe('every match states why it is there', () => {
  it('renders the reason beside the title, with the member count', async () => {
    const html = await render();
    const row = html.querySelector('.xidig-alooking__match');
    expect(row?.querySelector('.xidig-alooking__match-title')?.textContent).toBe(
      'Suuq-Card waxay raadinaysaa “amniga xogta”',
    );
    expect(row?.querySelector('.xidig-alooking__match-reason')?.textContent).toBe(
      'Ku habboon xirfaddaada · 6 xubnood',
    );
    expect(row?.querySelector('a')?.getAttribute('href')).toBe('/labs/suuq-card');
  });

  it('drops a match with no reason instead of showing it bare', async () => {
    const html = await render({
      matches: [match({ reason: '', href: '/labs/silent' }), match()],
    });
    const rows = html.querySelectorAll('.xidig-alooking__match');
    expect(rows).toHaveLength(1);
    expect(html.innerHTML).not.toContain('/labs/silent');
  });

  it('treats a whitespace reason as no reason', async () => {
    const html = await render({ matches: [match({ reason: '   ' })] });
    expect(html.querySelector('.xidig-alooking__match')).toBeNull();
  });

  it('renders the row without a count when the Space has none', async () => {
    const html = await render({ matches: [match({ memberCount: null })] });
    expect(html.querySelector('.xidig-alooking__match-reason')?.textContent).toBe(
      'Ku habboon xirfaddaada',
    );
  });
});

describe('matches are the owner half of the module', () => {
  it('shows visitors the published tags and none of the suggestions', async () => {
    const html = await render({ viewer: 'member' });
    expect(html.querySelector('[data-module="looking_for"]')).not.toBeNull();
    expect(html.querySelector('.xidig-alooking__tags')).not.toBeNull();
    expect(html.querySelector('.xidig-alooking__match')).toBeNull();
    // The footnote is second-person too — it belongs with the matches.
    expect(html.querySelector('.xidig-amodule__note')).toBeNull();
  });

  it('renders nothing at all when there is neither a tag nor an explained match', async () => {
    const bare = await render({ slugs: [], matches: [] });
    expect(bare.children).toHaveLength(0);

    // A visitor with tags-only data still gets the module; a visitor whose
    // only content would have been owner-side matches gets no node.
    const visitor = await render({ slugs: [], viewer: 'member' });
    expect(visitor.children).toHaveLength(0);
  });
});

describe('open-to tags', () => {
  it('labels known slugs and falls back to the raw slug for unknown ones', async () => {
    const html = await render({ slugs: ['cofounding', 'some_future_kind'] });
    const tags = Array.from(html.querySelectorAll('.xidig-alooking__tags .xidig-tag'));
    expect(tags).toHaveLength(2);
    expect(tags[0]?.textContent).not.toBe('cofounding');
    expect(tags[1]?.textContent).toBe('some_future_kind');
  });
});
