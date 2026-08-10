import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { HeaderViewer } from '@/lib/auth/header-viewer';

import { BadgeProvider } from './badge-provider';
import { RailNav } from './rail-nav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/plaza',
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

/**
 * RailNav canon contract (RailNav.dc.html, Codsi fidelity pass): brand +
 * five destinations in canon order, Abuur + search, quiet Fariimo/Digniino
 * rows, account row at the foot. The rail is CSS-flipped against the header
 * at 64rem — the media contract is asserted against globals.css directly.
 */

const viewer: HeaderViewer = {
  signedIn: true,
  userId: 'u1',
  displayName: 'Hodan Cabdi',
  handle: 'hodan',
  avatarThumbUrl: null,
  avatarBlurhash: null,
};

function render(): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(BadgeProvider, {
        initialSignedIn: true,
        children: createElement(RailNav, { viewer }),
      }),
    }),
  );
}

describe('RailNav', () => {
  it('carries the five canon destinations in canon order, Maal included', () => {
    const html = render();
    const hrefs = [...html.matchAll(/<a[^>]*class="xidig-rail__item[^"]*"[^>]*>/g)]
      .map((m) => m[0].match(/href="([^"]+)"/)?.[1])
      .filter((href): href is string => typeof href === 'string');
    expect(hrefs).toEqual(['/', '/plaza', '/suuq', '/labs', '/capital', '/messages', '/notifications']);
  });

  it('marks the active destination with aria-current', () => {
    expect(render().match(/aria-current="page"/g)?.length).toBe(1);
  });

  it('keeps brand, create, search and the account row in the rail', () => {
    const html = render();
    expect(html).toContain('xidig-rail__brand');
    expect(html).toContain('xidig-rail__create');
    expect(html).toMatch(/xidig-rail__search[\s\S]*role="search"/);
    expect(html).toContain('xidig-user-menu__railtrigger');
    expect(html).toContain('Hodan Cabdi');
  });

  it('flips shells at 64rem — rail on, header off, content shifted (CSS contract)', () => {
    const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');
    const mediaIdx = css.indexOf('@media (min-width: 64rem)');
    expect(mediaIdx).toBeGreaterThan(-1);
    const block = css.slice(mediaIdx, css.indexOf('.xidig-rail__brand', mediaIdx));
    expect(block).toContain('body:has(.xidig-rail) .xidig-rail');
    expect(block).toMatch(/body:has\(\.xidig-rail\) \.xidig-header \{\s*display: none/);
    expect(block).toMatch(/body:has\(\.xidig-rail\) main \{\s*margin-inline-start: 232px/);
  });
});
