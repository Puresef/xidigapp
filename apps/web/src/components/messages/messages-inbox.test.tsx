import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { MessagesInbox } from './messages-inbox';

/**
 * Inbox tab contract: the Chats/Requests switcher is a real tablist — the
 * active-tab styling in globals.css targets `.xidig-tabs__tab[aria-selected]`,
 * so button tabs marked any other way (aria-current) render with NO visible
 * active state. This locks the markup to the selector the CSS actually uses.
 */

function render(): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(MessagesInbox, {
        meId: 'user-1',
        initial: { conversations: [], nextCursor: null },
      }),
    }),
  );
}

describe('MessagesInbox tabs', () => {
  it('renders a tablist with exactly one aria-selected tab (the CSS active-state hook)', () => {
    const html = render();
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)?.length).toBe(2);
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
    expect(html.match(/aria-selected="false"/g)?.length).toBe(1);
    // aria-current is for links; on buttons it misses the CSS entirely.
    expect(html).not.toContain('aria-current');
  });

  it('empty Chats tab offers a way to find people (Directory CTA)', () => {
    const html = render();
    expect(html).toContain('href="/suuq"');
  });
});
