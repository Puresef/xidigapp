import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import { SystemNotice } from './system-notice';

/**
 * SystemNotice contract (DESIGN.md §4): the system voice is a DESIGNED
 * element — tone class + icon + status role — never bare text in the user
 * flow, and the optional appeal link composes into the message through the
 * `{link}` placeholder (bracketed-sentinel pattern, docs/i18n.md) so each
 * locale's sentence keeps its own word order.
 */

function render(props: Parameters<typeof SystemNotice>[0], locale: Locale = 'en'): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: locale,
      children: createElement(SystemNotice, props),
    }),
  );
}

describe('SystemNotice', () => {
  it('renders the resolved message with the tone class, icon and status role', () => {
    const html = render({ tone: 'info', messageKey: 'plaza.hiddenOwn' });
    expect(html).toContain('xidig-system-notice--info');
    expect(html).toContain('role="status"');
    expect(html).toContain('waiting for a quick moderation check');
    // Icon is decorative — present but hidden from the tree.
    expect(html).toContain('xidig-system-notice__icon');
    expect(html).toContain('aria-hidden="true"');
  });

  it('composes the appeal link into the {link} placeholder (no sentinel leaks)', () => {
    const html = render({
      tone: 'moderation',
      messageKey: 'plaza.removedOwn',
      link: { href: '/support/appeal', textKey: 'plaza.removedOwnLinkText' },
    });
    expect(html).toContain('xidig-system-notice--moderation');
    expect(html).toContain('href="/support/appeal"');
    expect(html).toContain('>appeal the decision</a>');
    // The sentence text around the link survives the split…
    expect(html).toContain('This post was removed.');
    // …and the sentinel itself never reaches the DOM.
    expect(html).not.toContain('[[link]]');
    expect(html).not.toContain('{link}');
  });

  it('keeps Somali word order — the template owns the sentence, not the code', () => {
    const html = render(
      {
        tone: 'moderation',
        messageKey: 'plaza.removedOwn',
        link: { href: '/support/appeal', textKey: 'plaza.removedOwnLinkText' },
      },
      'so',
    );
    expect(html).toContain('Qoraalkan waa la saaray.');
    expect(html).toContain('>racfaan ka codso</a>');
    expect(html).not.toContain('[[link]]');
  });
});
