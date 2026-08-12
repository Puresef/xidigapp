// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { PostView } from '@/lib/plaza/views';

/**
 * Task 10 inline-module slot: on mobile the 9c community modules run INSIDE
 * the feed (the desktop rail is CSS-hidden <64rem, this <li> is CSS-hidden
 * ≥64rem — both always in the tree, nav-shells precedent). Placement contract:
 * rendered ONCE as `li.xidig-plaza-inline` after the 2nd item (after the last
 * when the page has fewer), inside the items list ONLY — never the pinned
 * strip, never the empty state.
 *
 * PostCard is stubbed at the module boundary: this test is about WHERE the
 * slot lands, not what a post looks like (post-card.test.tsx owns that).
 */

const apiGet = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPost: vi.fn().mockResolvedValue({}),
  ApiRequestError: class MockApiRequestError extends Error {
    plain = { code: 'server_error', message: '' };
  },
}));

vi.mock('./post-card', () => ({
  PostCard: ({ view }: { view: PostView }) => <article>{view.post.id}</article>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/plaza',
}));

import { PlazaFeed } from './plaza-feed';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  apiGet.mockReset();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

function fakeView(id: string): PostView {
  return { post: { id } } as unknown as PostView;
}

function mockFeed({ items, pinned = [] }: { items: PostView[]; pinned?: PostView[] }) {
  apiGet.mockImplementation((url: string) => {
    if (url.includes('pinned=1')) return Promise.resolve({ items: pinned });
    return Promise.resolve({ items, nextCursor: null });
  });
}

async function mount() {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <LocaleProvider initialLocale="so">
        <PlazaFeed
          viewerId="viewer-1"
          lowBandwidth={false}
          inlineModule={<div data-modules="1">community modules</div>}
        />
      </LocaleProvider>,
    );
  });
}

describe('PlazaFeed inlineModule placement (Task 10)', () => {
  it('lands once after the 2nd item, in the items list — never the pinned strip', async () => {
    mockFeed({
      items: [fakeView('p1'), fakeView('p2'), fakeView('p3')],
      pinned: [fakeView('pin1')],
    });

    await mount();

    const inline = container.querySelectorAll('li.xidig-plaza-inline');
    expect(inline).toHaveLength(1);
    expect(inline[0]!.querySelector('[data-modules]')).not.toBeNull();

    const lists = container.querySelectorAll('ul.xidig-post-list');
    expect(lists).toHaveLength(2); // pinned strip + items list
    expect(lists[0]!.querySelector('.xidig-plaza-inline')).toBeNull();

    const itemsList = lists[1]!;
    expect(itemsList.children).toHaveLength(4);
    expect(itemsList.children[2]!.className).toBe('xidig-plaza-inline');
    expect(itemsList.children[3]!.textContent).toBe('p3');
  });

  it('falls back to after-the-last when the page has fewer than 2 items', async () => {
    mockFeed({ items: [fakeView('p1')] });

    await mount();

    const list = container.querySelector('ul.xidig-post-list')!;
    expect(list.children).toHaveLength(2);
    expect(list.children[0]!.textContent).toBe('p1');
    expect(list.children[1]!.className).toBe('xidig-plaza-inline');
  });

  it('never renders on the empty state', async () => {
    mockFeed({ items: [] });

    await mount();

    expect(container.querySelector('.xidig-plaza-inline')).toBeNull();
  });
});
