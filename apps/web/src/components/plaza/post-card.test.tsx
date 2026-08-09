import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { PostView } from '@/lib/plaza/views';

import { PostCard } from './post-card';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/',
}));

/**
 * Feed-vs-detail card contract (Task 7): feed cards clamp the body (4 lines,
 * CSS) with a "Read more" permalink and show the newest-comment teaser;
 * detail pages NEVER clamp, never tease — the full post is the point.
 */

function fakeView(overrides: Partial<PostView> = {}): PostView {
  return {
    post: {
      id: 'p1',
      author_user_id: 'u1',
      lab_id: null,
      type: 'update',
      title: null,
      body: 'long '.repeat(80),
      link_url: null,
      image_urls: [],
      ask_status: null,
      ask_nudged_at: null,
      ask_helper_user_id: null,
      ask_helped_at: null,
      ask_fulfilled_at: null,
      poll_status: null,
      poll_closes_at: null,
      status: 'published',
      source: 'member',
      pinned_at: null,
      edited_at: null,
      created_at: '2026-07-30T00:00:00Z',
    },
    author: null,
    imageUrls: [],
    images: [],
    link: null,
    tags: [],
    commentCount: 1,
    latestComment: {
      author: null,
      snippet: 'a fresh comment snippet',
      created_at: '2026-07-31T00:00:00Z',
    },
    reactions: { fire: 0, strong: 0, mashallah: 0, idea: 0, watching: 0 },
    myReactions: [],
    poll: null,
    bookmarked: false,
    askHelper: null,
    ...overrides,
  };
}

function fakeAsk(
  askStatus: 'open' | 'in_progress' | 'fulfilled' | 'closed',
  overrides: Partial<PostView> = {},
): PostView {
  const base = fakeView();
  return fakeView({
    post: {
      ...base.post,
      type: 'ask',
      body: 'short ask body',
      ask_status: askStatus,
      ask_helper_user_id: askStatus === 'in_progress' || askStatus === 'fulfilled' ? 'u2' : null,
      ask_helped_at: askStatus === 'in_progress' || askStatus === 'fulfilled' ? '2026-08-01T00:00:00Z' : null,
      ask_fulfilled_at: askStatus === 'fulfilled' ? '2026-08-07T00:00:00Z' : null,
    },
    ...overrides,
  });
}

function render(view: PostView, detail: boolean): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(PostCard, {
        view,
        viewerId: 'viewer',
        lowBandwidth: false,
        detail,
      }),
    }),
  );
}

describe('PostCard feed vs detail', () => {
  it('feed cards clamp long bodies, link Read more, and tease the newest comment', () => {
    const html = render(fakeView(), false);
    expect(html).toContain('xidig-post-body--clamp');
    expect(html).toContain('Read more');
    expect(html).toContain('a fresh comment snippet');
  });

  it('detail pages never clamp and never render the teaser', () => {
    const html = render(fakeView(), true);
    expect(html).not.toContain('xidig-post-body--clamp');
    expect(html).not.toContain('Read more');
    expect(html).not.toContain('a fresh comment snippet');
  });

  it('short bodies on feed cards skip the Read more escape hatch', () => {
    const html = render(fakeView({ post: { ...fakeView().post, body: 'short body' } }), false);
    expect(html).not.toContain('Read more');
  });
});

/**
 * Codsi lifecycle chips (P1 frames 1a–3b): the stage must be legible from
 * the chip alone — plain tag while open, accent tint while being helped,
 * trust (the earned state) once solved. Never orange before fulfilment.
 */
describe('PostCard Codsi status chip', () => {
  it('open asks wear a plain Furan-style tag beside the Codsi type chip', () => {
    const html = render(fakeAsk('open'), false);
    expect(html).toContain('>Ask<');
    expect(html).toContain('>Open<');
    expect(html).not.toContain('xidig-tag--trust');
    expect(html).not.toContain('xidig-tag--accent');
  });

  it('being-helped asks wear the accent tint — zero orange pre-fulfilment', () => {
    const html = render(fakeAsk('in_progress'), false);
    expect(html).toContain('xidig-tag--accent');
    expect(html).toContain('>Being helped<');
    expect(html).not.toContain('xidig-tag--trust');
  });

  it('fulfilled asks wear the trust chip — the one earned state', () => {
    const html = render(fakeAsk('fulfilled'), false);
    expect(html).toContain('xidig-tag--trust');
    expect(html).toContain('>Solved<');
  });

  it('legacy answered rows read as solved (backfill parity)', () => {
    const base = fakeView();
    const html = render(
      fakeView({ post: { ...base.post, type: 'ask', ask_status: 'answered' } }),
      false,
    );
    expect(html).toContain('>Solved<');
  });
});
