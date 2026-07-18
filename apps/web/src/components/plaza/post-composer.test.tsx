import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { PostComposer } from './post-composer';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

/**
 * Composer collapse contract: the Plaza leads with the feed, not a form. The
 * composer boots as a one-line prompt button and only shows the full form —
 * type tablist, fields, Post — once engaged. Draft restore and the feed's
 * empty-state CTA re-expand it (interactive paths, covered by the expand
 * flag these tests pin at both values).
 */

function render(props: Parameters<typeof PostComposer>[0]): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(PostComposer, props),
    }),
  );
}

describe('PostComposer', () => {
  it('boots collapsed: a prompt button, no form', () => {
    const html = render({ lowBandwidth: false });
    expect(html).toContain('xidig-composer-prompt');
    expect(html).not.toContain('id="composer-title"');
    expect(html).not.toContain('role="tablist"');
  });

  it('renders the full form when expanded', () => {
    const html = render({ lowBandwidth: false, defaultExpanded: true });
    expect(html).not.toContain('xidig-composer-prompt');
    expect(html).toContain('id="composer-title"');
    expect(html).toContain('role="tablist"');
  });
});
