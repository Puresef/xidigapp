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
 * Community-Award result card (Task 8, design frame 9c). The award anatomy
 * REPLACES the author byline: the system account never presents as a member
 * ("NO author byline" is structural, not stylistic), the trust chip is the
 * sanctioned vote-earned orange, and the `[data-award-provenance]` footer node
 * is MANDATORY — it is what keeps every award card honest about one-member-
 * one-vote system provenance.
 */

const SYSTEM_AUTHOR = {
  display_name: 'Xidig AI',
  handle: 'xidig_ai',
  location_city: null,
  avatar_thumb_url: null,
  avatar_blurhash: null,
  verification_status: 'unverified' as const,
};

function fakeView(overrides: Partial<PostView> = {}): PostView {
  return {
    post: {
      id: 'p1',
      author_user_id: 'ai-user',
      lab_id: null,
      type: 'update',
      title: null,
      body: 'fallback body line',
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
      created_at: '2026-08-01T00:00:00Z',
    },
    author: SYSTEM_AUTHOR,
    imageUrls: [],
    images: [],
    link: null,
    tags: [],
    commentCount: 0,
    latestComment: null,
    reactions: { fire: 0, strong: 0, mashallah: 0, idea: 0, watching: 0 },
    myReactions: [],
    poll: null,
    bookmarked: false,
    askHelper: null,
    ...overrides,
  };
}

function awardView(): PostView {
  const base = fakeView();
  return fakeView({
    post: { ...base.post, source: 'system' },
    award: {
      category: 'most_helpful',
      quarter: '2026-Q2',
      votes: 3,
      winner: {
        displayName: 'Deeqa Axmed',
        handle: 'deeqa',
        href: '/u/deeqa',
        avatarThumbUrl: null,
        avatarBlurhash: null,
      },
      evidence: { asksResolved: 7 },
      winnerDeleted: false,
    },
  });
}

function render(view: PostView, detail = false): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'so',
      children: createElement(PostCard, {
        view,
        viewerId: 'viewer',
        lowBandwidth: false,
        detail,
      }),
    }),
  );
}

describe('PostCard award presentation (frame 9c)', () => {
  it('renders the mandatory [data-award-provenance] node with the SO provenance sentence', () => {
    const html = render(awardView());
    expect(html).toContain('data-award-provenance');
    expect(html).toContain('Waxaa daabacay nidaamka Xidig — codbixin xubneed, xubin kasta hal cod');
  });

  it('wears the trust chip (vote-earned orange) with the Awards name', () => {
    const html = render(awardView());
    expect(html).toContain('xidig-tag--trust');
    expect(html).toContain('Abaalmarinta Bulshada');
  });

  it('dates the card with the DICTIONARY month, never the runtime ICU form (fix 9)', () => {
    // created_at 2026-08-01T00:00:00Z → "1 Agoosto" (time.month8, the locked
    // project vocabulary). The runtime's ICU 'so' data says 'Agosto' — that
    // divergent form must never render.
    const html = render(awardView());
    expect(html).toContain('1 Agoosto');
    expect(html).not.toContain('Agosto'); // not a substring of 'Agoosto'
  });

  it('composes the winner title from awards.resultTitle and shows the asker-confirmed evidence line', () => {
    const html = render(awardView());
    expect(html).toContain('Kan Ugu Caawiya — 2026-Q2: Deeqa Axmed');
    expect(html).toContain('7 Codsi oo la xaliyay · qoraaga codsiga ayaa mid kasta xaqiijiyay');
  });

  it('a test-account winner is named as a test account, with no vote/evidence count and no link', () => {
    const base = awardView();
    const view = fakeView({
      post: { ...base.post, body: '' },
      award: { ...base.award!, winner: null, winnerIsTest: true },
    });
    const html = render(view);
    // Title names the result as a test account (SO provisional label), never a blank line.
    expect(html).toContain('Kan Ugu Caawiya — 2026-Q2: Akoon tijaabo ah');
    // No asker-confirmed evidence, no vote count, no winner link or avatar ring.
    expect(html).not.toContain('Codsi oo la xaliyay');
    expect(html).not.toContain('xidig-award-ring');
    expect(html).not.toContain('Deeqa Axmed');
    expect(html).toContain('Akoon tijaabo ah oo la sameeyay ka hor furitaanka');
  });

  it('suppresses the author byline entirely — no link to the system account, no byline block', () => {
    const html = render(awardView());
    expect(html).not.toContain('/u/xidig_ai');
    expect(html).not.toContain('xidig-byline');
  });

  it('falls back to the member-vote evidence line when there is no asksResolved count', () => {
    const view = awardView();
    view.award = {
      ...view.award!,
      category: 'best_lab',
      winner: {
        displayName: 'Hooyo Meals',
        handle: null,
        href: '/labs/hooyo-meals',
        avatarThumbUrl: null,
        avatarBlurhash: null,
      },
      evidence: {},
    };
    const html = render(view);
    expect(html).toContain('3 cod xubneed');
  });

  it('still renders the ReactionBar (garab lives on award cards too)', () => {
    const html = render(awardView());
    expect(html).toContain('xidig-reaction');
  });

  it('regression: a non-award post keeps its author byline exactly as before', () => {
    const html = render(fakeView());
    expect(html).toContain('xidig-byline');
    expect(html).toContain('/u/xidig_ai');
    expect(html).not.toContain('data-award-provenance');
  });

  it('ContentSourceBadge "system" case: a system-source post without award anatomy wears the neutral tag, not seeded-violet', () => {
    // The award anatomy (`view.award`) structurally suppresses the whole
    // `xidig-chip-row` — including ContentSourceBadge — on a true 9c result
    // card (see the `!award` gate in post-card.tsx), so the 'system' branch
    // of content-source-badge.tsx is only reachable through a system-source
    // post that ISN'T carrying award anatomy (no matching award_results row
    // hydrated yet, or a future non-award system record). That's the real
    // integration point for the case content-source-badge.tsx has no
    // dedicated test file for: a neutral `xidig-tag`, never the seeded-violet
    // `xidig-tag--seeded` treatment, on the platform's own voice.
    const base = fakeView();
    const html = render(fakeView({ post: { ...base.post, source: 'system' } }));
    expect(html).toContain('Nidaamka Xidig');
    expect(html).not.toContain('xidig-tag--seeded');
  });
});

/**
 * Ruling 6 (Warya, 12 Aug): award cards must have a report/moderation path
 * somewhere. The 9c frame stays overflow-free on the feed (PostOverflowMenu
 * never renders for `view.award`), so the report control lives on the detail
 * surface instead, and the feed card gets a quiet link into that detail page.
 */
describe('PostCard award report path (Ruling 6)', () => {
  it('detail surface renders the standard post report control', () => {
    const html = render(awardView(), true);
    expect(html).toContain('xidig-report-control');
    expect(html).toContain('Soo sheeg'); // action.report (SO)
  });

  it('feed surface has no overflow menu (frame lock preserved) but links to the post detail', () => {
    const html = render(awardView(), false);
    // PostOverflowMenu never mounts for award cards (no byline row at all) —
    // its "⋯" trigger is the only element carrying this label.
    expect(html).not.toContain('Doorashooyinka qoraalka'); // social.postOptions
    expect(html).not.toContain('xidig-report-control');
    expect(html).toContain('xidig-award-view');
    expect(html).toContain('href="/p/p1"');
    expect(html).toContain('Fiiri'); // action.view (SO)
  });

  it('detail surface skips the feed-only "view" link (already on the post)', () => {
    const html = render(awardView(), true);
    expect(html).not.toContain('xidig-award-view');
  });

  it('a non-award post never gains the award-only report control on detail (regression)', () => {
    const html = render(fakeView(), true);
    expect(html).not.toContain('xidig-report-control');
  });
});
