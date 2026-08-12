// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * CommunityRail quiet-when-empty contract (final-review fix 5). globals.css
 * hides `.xidig-plaza-modules:empty` and collapses the seats around it (the
 * inline feed <li>, the desktop rail column) — which only works if a render
 * where BOTH modules are quiet leaves the wrapper with NO child nodes at
 * all, including whitespace text nodes. JSX strips newline-only whitespace
 * between elements, so the wrapper stays `:empty`; this suite locks that so
 * a future edit (a stray `{' '}`, a conditional heading) can't silently
 * bring back the blank 306px column / phantom feed row.
 */

vi.mock('@/components/mentor/mentor-residence-card', () => ({
  MentorResidenceCard: () => null,
}));
vi.mock('@/components/profile/suggested-follows', () => ({
  SuggestedFollows: ({ variant }: { variant: string }) =>
    variant === 'module' ? null : <div>never</div>,
}));

import { CommunityRail } from './community-rail';

describe('CommunityRail — quiet-when-empty leaves the wrapper truly :empty', () => {
  it('renders a wrapper with zero child nodes when both modules are quiet', () => {
    const html = renderToStaticMarkup(createElement(CommunityRail, { placement: 'rail' }));

    // Byte-exact: any whitespace between the tags would defeat the CSS
    // :empty selector that hides the wrapper.
    expect(html).toBe('<div class="xidig-plaza-modules" data-placement="rail"></div>');

    const host = document.createElement('div');
    host.innerHTML = html;
    const wrapper = host.querySelector('.xidig-plaza-modules');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.childNodes).toHaveLength(0);
    expect(wrapper!.matches(':empty')).toBe(true);
  });

  it('keeps the inline placement stamped on the wrapper (CSS targets it too)', () => {
    const html = renderToStaticMarkup(createElement(CommunityRail, { placement: 'inline' }));
    expect(html).toBe('<div class="xidig-plaza-modules" data-placement="inline"></div>');
  });
});
