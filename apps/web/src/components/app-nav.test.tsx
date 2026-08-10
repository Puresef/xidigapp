import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { BadgeProvider } from './nav/badge-provider';
import { AppNav } from './app-nav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/plaza',
}));

/**
 * Nav contract for the bottom-bar era: every primary tab carries a decorative
 * stroke icon plus a label span — the mobile bottom bar stacks icon over
 * label; desktop shows the label row. Active state stays aria-current.
 */

function render(): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(BadgeProvider, {
        initialSignedIn: true,
        children: createElement(AppNav),
      }),
    }),
  );
}

describe('AppNav', () => {
  it('gives all five tabs an icon and a label span', () => {
    const html = render();
    expect(html.match(/xidig-nav__icon/g)?.length).toBe(5);
    expect(html.match(/xidig-nav__label/g)?.length).toBe(5);
    // icons are decorative — labels carry the name
    const icons = html.match(/<svg [^>]*class="[^"]*xidig-nav__icon[^"]*"[^>]*>/g) ?? [];
    expect(icons.length).toBe(5);
    for (const icon of icons) expect(icon).toContain('aria-hidden="true"');
  });

  it('keeps aria-current on the active tab', () => {
    expect(render().match(/aria-current="page"/g)?.length).toBe(1);
  });

  it('renders the brand link outside the tab nav so only the tabs relocate to the bottom bar', () => {
    // The mobile bottom bar is the tab <nav>, moved to the end of <body> via a
    // portal so keyboard focus is header -> content -> bar. The brand must sit
    // OUTSIDE that nav or it would ride along to the bottom and leave the
    // header logo-less. Observable at SSR: the brand precedes the <nav>.
    const html = render();
    const brandIdx = html.indexOf('xidig-brand');
    const navIdx = html.indexOf('<nav');
    expect(brandIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(-1);
    expect(brandIdx).toBeLessThan(navIdx);
  });

  it('names the relocatable tab nav so it stays a navigation landmark after the portal move', () => {
    // aria-label lives on the tab <nav> (not an outer wrapper), so the landmark
    // survives being portaled out of the header on mobile.
    expect(render()).toMatch(/<nav[^>]*aria-label="[^"]+"[^>]*class="[^"]*xidig-nav--app/);
  });

  it('marks the Messages tab for the mobile hide — the dock stays clean (ruling 3)', () => {
    // Ruling 3 as amended (platform split): desktop keeps the per-destination
    // count on the Messages tab; the mobile bottom bar holds no Fariimo slot.
    // The DOM stays identical across breakpoints — a modifier class + the
    // mobile media block do the hiding, so there is no hydration flash.
    const html = render();
    expect(html.match(/xidig-nav__item--messages/g)?.length).toBe(1);
    const messagesItem = html.match(/<li[^>]*xidig-nav__item--messages[^>]*>[\s\S]*?<\/li>/)?.[0];
    expect(messagesItem).toBeDefined();
    expect(messagesItem).toContain('href="/messages"');
  });

  it('hides the Messages tab inside the mobile bar media block (CSS contract)', () => {
    const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
    const ruleIdx = css.indexOf('.xidig-nav--app .xidig-nav__item--messages');
    expect(ruleIdx).toBeGreaterThan(-1);
    const mediaIdx = css.lastIndexOf('@media', ruleIdx);
    expect(css.slice(mediaIdx, mediaIdx + 40)).toContain('max-width: 48rem');
    const ruleBody = css.slice(ruleIdx, css.indexOf('}', ruleIdx));
    expect(ruleBody).toContain('display: none');
  });

  it('opts the avatar badge in on mobile with enough specificity to beat the base hide', () => {
    // The base .xidig-user-menu__badge rule hides the chip (desktop default);
    // the mobile media block must re-enable it with a TWO-class selector —
    // a single-class opt-in loses to the later base rule at equal specificity
    // (caught live, 9 Aug).
    const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
    const optInIdx = css.indexOf('.xidig-user-menu__trigger .xidig-user-menu__badge');
    expect(optInIdx).toBeGreaterThan(-1);
    const mediaIdx = css.lastIndexOf('@media', optInIdx);
    expect(css.slice(mediaIdx, mediaIdx + 40)).toContain('max-width: 48rem');
    const optInBody = css.slice(optInIdx, css.indexOf('}', optInIdx));
    expect(optInBody).toContain('display: inline-flex');
  });
});
