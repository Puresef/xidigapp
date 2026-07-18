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
});
