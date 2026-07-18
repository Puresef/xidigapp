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
});
