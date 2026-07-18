import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { BackLink } from './back-link';

/**
 * Detail-page orientation contract: every detail surface carries a quiet
 * "← Section" link to its parent — works for deep-link visitors with no
 * browser history, uses the section's own nav label (no new copy).
 */

describe('BackLink', () => {
  it('renders the parent link with the section label', () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        initialLocale: 'en',
        children: createElement(BackLink, { href: '/plaza', labelKey: 'nav.plaza' }),
      }),
    );
    expect(html).toContain('xidig-backlink');
    expect(html).toContain('href="/plaza"');
    expect(html).toContain('←');
  });
});
