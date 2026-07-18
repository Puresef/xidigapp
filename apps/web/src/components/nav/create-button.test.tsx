import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { CreateButton } from './create-button';

let pathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: () => {} }),
}));

/**
 * Contextual Create contract in markup: link targets render as real links
 * (middle-click/new-tab work), compose contexts render a button. The label
 * stays the stable "Create"; the contextual action is exposed via title.
 */

function render(): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, { initialLocale: 'en', children: createElement(CreateButton) }),
  );
}

describe('CreateButton', () => {
  it('renders a link to the section create form on Labs', () => {
    pathname = '/labs';
    const html = render();
    expect(html).toContain('href="/labs/new"');
    expect(html).toContain('Create');
  });

  it('renders a compose button on the Plaza', () => {
    pathname = '/plaza';
    const html = render();
    expect(html).not.toContain('href=');
    expect(html).toContain('<button');
  });
});
