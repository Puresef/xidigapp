import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { BadgeProvider } from './badge-provider';
import { NotificationsMenu } from './notifications-menu';

/**
 * Bell dropdown contract: the bell is a menu trigger (aria-haspopup, closed by
 * default), not a bare link — the badge stays wired to BadgeProvider, and the
 * full /notifications page remains reachable from inside the panel.
 */

function render(): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(BadgeProvider, {
        initialSignedIn: true,
        children: createElement(NotificationsMenu),
      }),
    }),
  );
}

describe('NotificationsMenu', () => {
  it('renders a closed menu trigger with the bell icon and no badge at zero', () => {
    const html = render();
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
    // unread badge only renders when the count is positive
    expect(html).not.toContain('xidig-icon-button__badge');
  });
});
