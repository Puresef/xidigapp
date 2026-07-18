import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { Toaster } from './toaster';

/**
 * Toast contract: one polite live region mounted with the chrome; components
 * anywhere raise toasts via the xidig:toast window event (same pattern as
 * xidig:badges), so no context threading through page trees.
 */

describe('Toaster', () => {
  it('renders an empty polite live region', () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, { initialLocale: 'en', children: createElement(Toaster) }),
    );
    expect(html).toContain('xidig-toaster');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
