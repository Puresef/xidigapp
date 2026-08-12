import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { LITE_BUNDLES } from '@/lib/lite/prefs';
import { ListingRow, PersonRow, PostRow, SpaceRow } from './result-rows';
import type { SearchLab, SearchListing, SearchPerson, SearchPost } from './types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/search',
}));

/**
 * The result rows are the whole search screen. This locks the two things a
 * re-layout keeps breaking: that the member's term is marked in THEIR content
 * and never in ours, and that a row with sparse data renders short rather
 * than showing an empty label or an invented placeholder.
 */

/** Rich-by-default is the house default; Lite is the opt-in that strips. */
const prefs = LITE_BUNDLES.everything;

function render(element: ReactElement, locale: 'en' | 'so' = 'en'): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, { initialLocale: locale, children: element }),
  );
}

const person: SearchPerson = {
  userId: 'u1',
  displayName: 'Ayaan Warsame',
  handle: 'ayaan',
  bio: 'Editor of Toddobaadkan Xidig — the weekly community digest.',
  locationCity: 'Toronto',
  locationCountry: 'CA',
  verificationStatus: 'identity_verified',
  avatarThumbUrl: null,
  avatarBlurhash: null,
};

const listing: SearchListing = {
  id: 'l1',
  businessName: 'Xawaash House',
  categoryName: { en: 'Food & spices', so: 'Cunto iyo xawaash' },
  shortDescription: 'Spice blends delivered toddobaadkasta.',
  city: 'Minneapolis',
  country: 'US',
  priceRange: 2,
  verificationStatus: 'verified',
  photoUrl: null,
  photoThumbUrl: null,
  photoBlurhash: null,
  photoAlt: null,
};

const lab: SearchLab = {
  id: 'lab1',
  name: 'Toddobaadkan Xidig newsroom',
  slug: 'newsroom',
  spaceMode: 'lab',
  shortDescription: 'Planning Lab for the weekly digest.',
  stage: 'building',
  memberCount: 8,
};

const post: SearchPost = {
  id: 'p1',
  title: 'Toddobaadkan Xidig / This week in Xidig',
  type: 'update',
  createdAt: '2026-08-10T18:00:00Z',
  body: 'Wararkii ugu waaweynaa ee toddobaadkan: saddex Lab oo cusub iyo laba guul.',
  author: {
    displayName: 'Ayaan Warsame',
    handle: 'ayaan',
    locationCity: 'Toronto',
    avatarThumbUrl: null,
    avatarBlurhash: null,
    verificationStatus: 'identity_verified',
  },
  tags: [{ id: 't1', name: 'warbixin' }],
  replyCount: 3,
};

describe('PersonRow', () => {
  it('marks the term inside the bio and leaves the rest of the line alone', () => {
    const html = render(createElement(PersonRow, { person, query: 'toddobaad', prefs }));
    expect(html).toContain('<mark class="xidig-search-mark">Toddobaad</mark>kan Xidig');
    expect(html).toContain('@ayaan · Toronto · CA');
  });

  it('shows the verified ring and check for a verified member', () => {
    const html = render(createElement(PersonRow, { person, query: '', prefs }));
    expect(html).toContain('xidig-byline__avatar--verified');
    expect(html).toContain('xidig-byline__check');
  });

  it('drops the ring for an unverified member', () => {
    const html = render(
      createElement(PersonRow, {
        person: { ...person, verificationStatus: 'unverified' },
        query: '',
        prefs,
      }),
    );
    expect(html).not.toContain('xidig-byline__avatar--verified');
  });

  it('omits the snippet line entirely when there is no bio', () => {
    const html = render(
      createElement(PersonRow, { person: { ...person, bio: null }, query: '', prefs }),
    );
    expect(html).not.toContain('xidig-search-row__snippet');
  });

  it('does not mark a term that only appears in our own copy', () => {
    // "Toronto" is member data and may be marked; the surrounding UI never is.
    const html = render(createElement(PersonRow, { person, query: 'search', prefs }));
    expect(html).not.toContain('<mark');
  });
});

describe('ListingRow', () => {
  it('carries the Verified trust chip only when the listing is verified', () => {
    expect(render(createElement(ListingRow, { listing, query: '', prefs }))).toContain(
      'xidig-tag--trust',
    );
    expect(
      render(
        createElement(ListingRow, {
          listing: { ...listing, verificationStatus: 'unverified' },
          query: '',
          prefs,
        }),
      ),
    ).not.toContain('xidig-tag--trust');
  });

  it('builds the meta line from category, place and price', () => {
    const html = render(createElement(ListingRow, { listing, query: '', prefs }));
    expect(html).toContain('Food &amp; spices · Minneapolis · US · $$');
  });

  it('uses the Somali category name in the Somali locale', () => {
    const html = render(createElement(ListingRow, { listing, query: '', prefs }), 'so');
    expect(html).toContain('Cunto iyo xawaash');
  });

  it('falls back to the English category when Somali is missing', () => {
    const html = render(
      createElement(ListingRow, {
        listing: { ...listing, categoryName: { en: 'Retail', so: null } },
        query: '',
        prefs,
      }),
      'so',
    );
    expect(html).toContain('Retail');
  });

  it('leaves no dangling separator when a listing has no category or place', () => {
    const html = render(
      createElement(ListingRow, {
        listing: { ...listing, categoryName: null, city: null, country: null, priceRange: null },
        query: '',
        prefs,
      }),
    );
    expect(html).not.toContain('·');
  });
});

describe('SpaceRow', () => {
  it('shows the Space chrome word and a pluralised member count', () => {
    const html = render(createElement(SpaceRow, { lab, query: 'toddobaad' }));
    expect(html).toContain('Lab');
    expect(html).toContain('8 members');
    expect(html).toContain('<mark class="xidig-search-mark">Toddobaad</mark>');
  });

  it('says "1 member" for a Space of one', () => {
    const html = render(createElement(SpaceRow, { lab: { ...lab, memberCount: 1 }, query: '' }));
    expect(html).toContain('1 member');
    expect(html).not.toContain('1 members');
  });

  it('uses the Somali chrome word Warshad for a Lab', () => {
    const html = render(createElement(SpaceRow, { lab, query: '' }), 'so');
    expect(html).toContain('Warshad');
  });
});

describe('PostRow', () => {
  it('renders byline, type chip, marked title, excerpt, tag and reply count', () => {
    const html = render(createElement(PostRow, { post, query: 'toddobaad', prefs }));
    expect(html).toContain('Ayaan Warsame');
    expect(html).toContain('@ayaan · Toronto');
    expect(html).toContain('Update');
    expect(html).toContain('<mark class="xidig-search-mark">Toddobaad</mark>kan Xidig');
    expect(html).toContain('#warbixin');
    expect(html).toContain('aria-label="3 comments"');
  });

  it('marks the term inside the body excerpt too', () => {
    const html = render(createElement(PostRow, { post, query: 'toddobaad', prefs }));
    const excerpt = html.slice(html.indexOf('xidig-search-post__excerpt'));
    expect(excerpt).toContain('<mark class="xidig-search-mark">toddobaad</mark>kan');
  });

  it('renders a post whose author, tags and replies are all missing', () => {
    const html = render(
      createElement(PostRow, {
        post: { ...post, author: null, tags: [], replyCount: 0 },
        query: '',
        prefs,
      }),
    );
    expect(html).toContain('This week in Xidig');
    expect(html).not.toContain('xidig-search-post__foot');
    expect(html).not.toContain('xidig-byline__name');
  });

  it('hides the reply affordance at zero rather than showing a 0', () => {
    const html = render(
      createElement(PostRow, { post: { ...post, replyCount: 0 }, query: '', prefs }),
    );
    expect(html).not.toContain('xidig-search-post__replies');
  });

  it('formats the byline time through the dictionary, never as a raw date', () => {
    const html = render(createElement(PostRow, { post, query: '', prefs }));
    expect(html).not.toContain('2026-08-10T18:00:00Z');
    expect(html).toMatch(/ago|now/);
  });
});
