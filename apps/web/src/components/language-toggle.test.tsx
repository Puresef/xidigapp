import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { LanguageToggle } from './language-toggle';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

/**
 * Toggle contract (18 Jul): Somali leads (the home language comes first),
 * each option carries its flag as a decorative inline SVG, and the endonyms
 * stay untranslated so a member can always find their own language.
 */

function render(): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(LanguageToggle),
    }),
  );
}

describe('LanguageToggle', () => {
  it('renders Somali first, then English', () => {
    const html = render();
    const so = html.indexOf('lang="so"');
    const en = html.indexOf('lang="en"');
    expect(so).toBeGreaterThan(-1);
    expect(en).toBeGreaterThan(-1);
    expect(so).toBeLessThan(en);
  });

  it('shows a decorative flag on each option, endonyms intact', () => {
    const html = render();
    expect(html.match(/xidig-flag/g)?.length).toBeGreaterThanOrEqual(2);
    // flags are decoration; the endonym is the accessible label
    expect(html.match(/<svg [^>]*aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Somali');
    expect(html).toContain('English');
  });
});
