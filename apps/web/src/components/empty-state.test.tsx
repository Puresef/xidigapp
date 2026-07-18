import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { EmptyState } from './empty-state';

/**
 * Shared empty-state contract (rich-by-default): every empty surface gets the
 * mark (decorative, hidden from AT), the message, and — when the surface has
 * an obvious next step — a CTA. The message arrives as a MessageKey (resolved
 * internally), so the no-hardcoded-copy rule holds at the type level; the CTA
 * stays caller-built so link vs button vs nothing is their call.
 */

function render(props: Parameters<typeof EmptyState>[0]): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(EmptyState, props),
    }),
  );
}

describe('EmptyState', () => {
  it('renders the decorative mark and the resolved message', () => {
    const html = render({ messageKey: 'state.emptyFeed' });
    expect(html).toContain('xidig-empty');
    expect(html).toContain('the Plaza is open');
    // the mark is decorative — present, but hidden from the tree
    expect(html).toContain('xidig-animark');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders the action when given, and nothing extra when not', () => {
    const withCta = render({
      messageKey: 'lab.emptyList',
      action: createElement('a', { href: '/labs/new' }, 'Start a Space'),
    });
    expect(withCta).toContain('href="/labs/new"');

    expect(render({ messageKey: 'notif.empty' })).not.toContain('<a');
  });

  it('merges an extra className onto the box (e.g. the notifications sky)', () => {
    const html = render({ messageKey: 'notif.empty', className: 'xidig-empty-sky' });
    expect(html).toMatch(/class="[^"]*xidig-empty[^"]*xidig-empty-sky/);
  });
});
