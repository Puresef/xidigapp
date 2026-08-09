import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { AuthorRef } from '@/lib/plaza/views';

import { CodsiDetails } from './codsi-details';
import { CodsiTimeline } from './codsi-timeline';
import { FulfilledBanner } from './fulfilled-banner';
import { GarabButton } from './garab-button';
import { GuulPrompt } from './guul-prompt';
import { HelperCard, HelperStrip } from './helper-strip';
import { OfferCta } from './offer-cta';
import { OffersCard } from './offers-card';
import { OwnerControls } from './owner-controls';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/',
}));

/**
 * Codsi detail family (P1 frames 1a–3b + DESIGN.md §4). The acceptance rules
 * these lock: asker-only lifecycle controls, offer = private DM (privacy note
 * always beside the CTA), the helper strip as the only public offer artifact,
 * Garab existing only post-fulfilled with its count hidden pre-interaction,
 * and zero trust-orange before fulfilment.
 */

const helper: AuthorRef = {
  display_name: 'Deeqa Axmed',
  handle: 'deeqa',
  location_city: 'London',
  avatar_thumb_url: null,
  avatar_blurhash: null,
  verification_status: 'identity_verified',
};

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, { initialLocale: 'en', children: element }),
  );
}

describe('FulfilledBanner', () => {
  it('celebrates with the guul star and names the helper', () => {
    const html = render(
      createElement(FulfilledBanner, {
        helper,
        createdAt: '2026-07-30T00:00:00Z',
        fulfilledAt: '2026-08-07T00:00:00Z',
      }),
    );
    expect(html).toContain('This ask is solved');
    expect(html).toContain('Deeqa Axmed');
    expect(html).toContain('xidig-codsi-banner');
  });

  it('solved without a named helper still celebrates — just nobody to credit', () => {
    const html = render(
      createElement(FulfilledBanner, {
        helper: null,
        createdAt: '2026-07-30T00:00:00Z',
        fulfilledAt: '2026-08-01T00:00:00Z',
      }),
    );
    expect(html).toContain('This ask is solved');
    expect(html).toContain('Solved after');
    expect(html).not.toContain('Deeqa');
  });
});

describe('HelperStrip (in progress — system chrome, cold accent)', () => {
  it('tells visitors who is helping — and that the ASKER accepted (never the helper)', () => {
    const html = render(
      createElement(HelperStrip, {
        helper,
        askerName: 'Cali',
        isAsker: false,
        helpedAt: '2026-08-01T00:00:00Z',
      }),
    );
    expect(html).toContain('Deeqa Axmed is helping');
    expect(html).toContain('Cali accepted');
    expect(html).not.toContain('Deeqa Axmed accepted');
    expect(html).toContain('xidig-codsi-strip');
    expect(html).not.toContain('trust');
  });

  it("gives the asker their own grammar and the door to the DM", () => {
    const html = render(
      createElement(HelperStrip, {
        helper,
        askerName: 'Cali',
        isAsker: true,
        helpedAt: '2026-08-01T00:00:00Z',
        conversationId: 'c0ffee00-0000-4000-8000-000000000000',
      }),
    );
    expect(html).toContain('is helping you');
    expect(html).toContain('You accepted');
    expect(html).toContain('Open the message');
    expect(html).toContain('/messages/c0ffee00-0000-4000-8000-000000000000');
  });
});

describe('GarabButton — exists only post-fulfilled, count hidden pre-interaction', () => {
  const base: ComponentProps<typeof GarabButton> = {
    postId: 'p1',
    fulfilled: true,
    initialCount: 9,
    initialMine: false,
  };

  it('renders nothing at all before fulfilment', () => {
    expect(render(createElement(GarabButton, { ...base, fulfilled: false }))).toBe('');
  });

  it('shows no number to a viewer who has not taken part', () => {
    const html = render(createElement(GarabButton, base));
    expect(html).toContain('Co-sign');
    expect(html).not.toContain('9 co-signs');
    expect(html).toContain('aria-pressed="false"');
  });

  it('lights up (lit dabqaad, Somali Blue) and reveals the count once the viewer took part', () => {
    const html = render(createElement(GarabButton, { ...base, initialMine: true }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('9 co-signs');
  });
});

describe('HelperCard (fulfilled rail)', () => {
  it('credits the helper and carries the Garab action', () => {
    const html = render(
      createElement(HelperCard, {
        helper,
        garab: createElement(GarabButton, {
          postId: 'p1',
          fulfilled: true,
          initialCount: 9,
          initialMine: true,
        }),
      }),
    );
    expect(html).toContain('Helper');
    expect(html).toContain('Deeqa Axmed helped');
    expect(html).toContain('You stood with them');
  });
});

describe('OfferCta — offer is a private DM', () => {
  it('never renders for the asker', () => {
    expect(
      render(
        createElement(OfferCta, {
          postId: 'p1',
          askStatus: 'open',
          isAsker: true,
          askerName: 'Cali',
        }),
      ),
    ).toBe('');
  });

  it('open ask: primary CTA with the privacy promise', () => {
    const html = render(
      createElement(OfferCta, { postId: 'p1', askStatus: 'open', isAsker: false, askerName: 'Cali' }),
    );
    expect(html).toContain('I can help');
    expect(html).toContain('A private message goes to Cali');
    expect(html).toContain('xidig-button--primary');
  });

  it('being-helped ask: demoted to secondary, still possible', () => {
    const html = render(
      createElement(OfferCta, {
        postId: 'p1',
        askStatus: 'in_progress',
        isAsker: false,
        askerName: 'Cali',
      }),
    );
    expect(html).toContain('I can help too');
    expect(html).toContain('still hear from other helpers');
    expect(html).not.toContain('xidig-button--primary');
  });

  it('gone after fulfilment', () => {
    expect(
      render(
        createElement(OfferCta, {
          postId: 'p1',
          askStatus: 'fulfilled',
          isAsker: false,
          askerName: 'Cali',
        }),
      ),
    ).toBe('');
  });
});

describe('OwnerControls — the lifecycle lives here and nowhere else', () => {
  it('renders nothing for non-askers', () => {
    expect(
      render(createElement(OwnerControls, { postId: 'p1', askStatus: 'open', isAsker: false })),
    ).toBe('');
  });

  it('open: mark-solved only, with the Xidig-never-decides promise', () => {
    const html = render(
      createElement(OwnerControls, { postId: 'p1', askStatus: 'open', isAsker: true }),
    );
    expect(html).toContain('This ask is yours');
    expect(html).toContain('Mark as solved');
    expect(html).not.toContain('Reopen it');
    expect(html).toContain('Xidig never changes it on its own');
  });

  it('being helped: mark-solved plus the walk-back', () => {
    const html = render(
      createElement(OwnerControls, { postId: 'p1', askStatus: 'in_progress', isAsker: true }),
    );
    expect(html).toContain('Mark as solved');
    expect(html).toContain('Reopen it');
  });

  it('fulfilled is terminal — the card yields to the celebration', () => {
    expect(
      render(createElement(OwnerControls, { postId: 'p1', askStatus: 'fulfilled', isAsker: true })),
    ).toBe('');
  });
});

describe('OffersCard — the asker sees offers privately', () => {
  it('lists pending offers with an accept per row', () => {
    const html = render(
      createElement(OffersCard, {
        postId: 'p1',
        offers: [
          {
            id: 'o1',
            helper,
            conversationId: 'c1',
            createdAt: '2026-08-01T00:00:00Z',
          },
        ],
      }),
    );
    expect(html).toContain('Offers to help');
    expect(html).toContain('Deeqa Axmed');
    expect(html).toContain('Accept');
  });

  it('renders nothing when nobody has offered', () => {
    expect(render(createElement(OffersCard, { postId: 'p1', offers: [] }))).toBe('');
  });
});

describe('CodsiTimeline — the Guul step lights only when earned', () => {
  it('open: one lit step, the fulfilled step stays hollow and neutral', () => {
    const html = render(
      createElement(CodsiTimeline, {
        askStatus: 'open',
        createdAt: '2026-07-30T00:00:00Z',
        helper: null,
        helpedAt: null,
        fulfilledAt: null,
      }),
    );
    expect(html).toContain('Ask timeline');
    const trustDots = html.match(/xidig-codsi-step--trust/g) ?? [];
    expect(trustDots).toHaveLength(0);
  });

  it('fulfilled: the final step earns the trust treatment', () => {
    const html = render(
      createElement(CodsiTimeline, {
        askStatus: 'fulfilled',
        createdAt: '2026-07-30T00:00:00Z',
        helper,
        helpedAt: '2026-08-01T00:00:00Z',
        fulfilledAt: '2026-08-07T00:00:00Z',
      }),
    );
    expect(html).toContain('xidig-codsi-step--trust');
    expect(html).toContain('Deeqa Axmed');
  });
});

describe('CodsiDetails', () => {
  it('renders only the facts it has — category, location, duration', () => {
    const html = render(
      createElement(CodsiDetails, {
        category: 'ganacsi',
        location: 'Minneapolis, MN',
        durationDays: 8,
      }),
    );
    expect(html).toContain('Category');
    expect(html).toContain('ganacsi');
    expect(html).toContain('Location');
    expect(html).toContain('Minneapolis, MN');
    expect(html).toContain('Duration');
    expect(html).toContain('8 days');
  });

  it('vanishes entirely with nothing to say', () => {
    expect(
      render(createElement(CodsiDetails, { category: null, location: null, durationDays: null })),
    ).toBe('');
  });
});

describe('GuulPrompt — dismissible, never auto-posted', () => {
  it('offers Qor Guul as a link into the composer, plus a decline', () => {
    const html = render(createElement(GuulPrompt, { postId: 'p1' }));
    expect(html).toContain('Make it a Guul?');
    expect(html).toContain('You write it');
    expect(html).toContain('/plaza?compose=1');
    expect(html).toContain('No, thanks');
  });
});
