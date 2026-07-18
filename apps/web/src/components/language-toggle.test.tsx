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
    const so = html.indexOf('aria-label="Somali"');
    const en = html.indexOf('aria-label="English"');
    expect(so).toBeGreaterThan(-1);
    expect(en).toBeGreaterThan(-1);
    expect(so).toBeLessThan(en);
  });

  it('shows the short code visibly with the full language name as the accessible label', () => {
    const html = render();
    // compact visible labels — the code stands in for the name
    expect(html).toContain('>so</span>');
    expect(html).toContain('>en</span>');
    // screen readers still hear the full language name
    expect(html).toContain('aria-label="Somali"');
    expect(html).toContain('aria-label="English"');
  });

  it('shows a decorative flag on each option', () => {
    const html = render();
    expect(html.match(/xidig-flag/g)?.length).toBeGreaterThanOrEqual(2);
    // flags are decoration; the aria-label carries the name
    expect(html.match(/<svg [^>]*aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
