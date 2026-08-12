// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import type { Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import { AnigaFacts } from '@/components/profile/aniga-facts';
import { resolveModuleStates } from '@/lib/aniga/modules';
import type { AnigaOwnerFacts, AnigaView } from '@/lib/aniga/view';
import { LITE_BUNDLES } from '@/lib/lite/prefs';
import { applyLocationGranularity, type ProfileView } from '@/lib/profile-view';

import { AnigaProfile } from './aniga-profile';

/**
 * The fold state is itself an unpublished fact (docs/aniga-modules.md, ruled
 * 11 Aug): `hidden` and *never entered* must be BYTE-IDENTICAL in a visitor's
 * DOM. A visitor who can tell those apart has learned that this member
 * deliberately hid something, which is exactly what hiding was for.
 *
 * This is a whole-chain test rather than a component one, because neither half
 * is sufficient alone and the leak lives in the seam:
 *
 *   * `applyLocationGranularity` is what a visitor's projection runs, so the
 *     test folds a REAL city rather than hand-writing the nulls it produces —
 *     a fold that starts leaving a residue (a kept country, a surviving
 *     timezone, a coordinate) has to fail here;
 *   * `AnigaProfile` is what actually ships on /u/[handle], so a renderer that
 *     grows a "location not shared" placeholder, a muted dash, or an empty
 *     `<span>` where the subtitle used to be has to fail here too.
 *
 * Byte-identity is asserted on the serialized HTML, not on a queried subset.
 * A leak that reaches an `aria-label`, a `data-` attribute or a class name is
 * the same leak wearing a different hat, and a `querySelector` assertion is
 * exactly how it would get through.
 *
 * The owner pass at the bottom is the control. Without it a renderer that
 * dropped the location for EVERYONE would pass this file, and the test would
 * be guarding an accident instead of a property.
 */

const state = vi.hoisted(() => ({ locale: 'so' as Locale }));

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return {
    getLocale: async () => state.locale,
    getT: async () => createTranslator(state.locale),
  };
});

async function html(element: ReactElement): Promise<string> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: state.locale, children: element }),
  );
  return new Response(stream).text();
}

/** Everything except location is fixed, so any diff is the location's fault. */
function profileRow(location: { city: string | null; country: string | null }) {
  return {
    user_id: '11111111-1111-4111-8111-111111111111',
    display_name: 'Hodan Cabdi',
    handle: 'hodan',
    bio: 'Injineer software',
    location_city: location.city,
    location_country: location.country,
    skills: [],
    lanes: [],
    links: [],
    contact_options: {},
    verification_status: 'unverified',
    created_at: '2024-03-04T00:00:00Z',
  };
}

function anigaView(
  profile: ReturnType<typeof profileRow>,
  ownerFacts: AnigaOwnerFacts | null,
): AnigaView {
  return {
    base: {
      profile,
      badges: [],
      counts: { followers: 128, vouches: 37 },
      reputation: { contribution: 0, helper: 0 },
      media: {
        avatarUrl: null,
        avatarThumbUrl: null,
        avatarBlurhash: null,
        coverUrl: null,
        coverThumbUrl: null,
        coverBlurhash: null,
      },
      openTo: [],
      pins: [],
      isAi: false,
    } as unknown as ProfileView,
    headline: 'Injineer software',
    modules: resolveModuleStates([], {}),
    showcase: [],
    skills: [],
    links: [],
    lookingFor: { slugs: [], matches: [] },
    helper: [],
    mutuals: null,
    suuq: null,
    metrics: null,
    privateStats: null,
    ownerFacts,
  };
}

/** The row a visitor's projection hands the renderer, for one granularity. */
function asVisitorSees(
  location: { city: string | null; country: string | null },
  granularity: string,
) {
  return applyLocationGranularity(profileRow(location), granularity);
}

const LONDON = { city: 'London', country: 'UK' };
const NEVER_ENTERED = { city: null, country: null };

describe('a visitor cannot tell a hidden location from one that was never entered', () => {
  it('renders byte-identical HTML for both members', async () => {
    // A member who typed London and chose `hidden`…
    const hidden = await html(
      createElement(AnigaProfile, {
        view: anigaView(asVisitorSees(LONDON, 'hidden'), null),
        viewer: 'member',
        prefs: LITE_BUNDLES.everything,
      }),
    );
    // …and a member who never typed one at all.
    const absent = await html(
      createElement(AnigaProfile, {
        view: anigaView(asVisitorSees(NEVER_ENTERED, 'city'), null),
        viewer: 'member',
        prefs: LITE_BUNDLES.everything,
      }),
    );

    expect(hidden).toBe(absent);
    // Guarding the guard: the city must not have survived the fold into either
    // render, or `toBe` above would be comparing two leaks.
    expect(hidden).not.toContain('London');
    expect(hidden).not.toContain('UK');
  });

  it('holds for an anonymous reader too', async () => {
    const hidden = await html(
      createElement(AnigaProfile, {
        view: anigaView(asVisitorSees(LONDON, 'hidden'), null),
        viewer: 'anon',
        prefs: LITE_BUNDLES.everything,
      }),
    );
    const absent = await html(
      createElement(AnigaProfile, {
        view: anigaView(asVisitorSees(NEVER_ENTERED, 'city'), null),
        viewer: 'anon',
        prefs: LITE_BUNDLES.everything,
      }),
    );

    expect(hidden).toBe(absent);
  });

  it('stays identical when a region fold leaves the country standing', async () => {
    // `region` is the fold that keeps something, so it is the one that could
    // leak a DIFFERENT residue than `hidden` does. A member folded to `region`
    // must look like a member who only ever entered a country.
    const folded = await html(
      createElement(AnigaProfile, {
        view: anigaView(asVisitorSees(LONDON, 'region'), null),
        viewer: 'member',
        prefs: LITE_BUNDLES.everything,
      }),
    );
    const countryOnly = await html(
      createElement(AnigaProfile, {
        view: anigaView(asVisitorSees({ city: null, country: 'UK' }, 'city'), null),
        viewer: 'member',
        prefs: LITE_BUNDLES.everything,
      }),
    );

    expect(folded).toBe(countryOnly);
    expect(folded).not.toContain('London');
  });
});

describe('the control: the OWNER is told, which is the whole point of the card', () => {
  it('says the location is hidden — the fact the visitor renders cannot carry', async () => {
    const facts: AnigaOwnerFacts = { lanes: [], fold: 'hidden', place: null };
    const owner = await html(createElement(AnigaFacts, { facts }));

    // If this ever renders nothing, the byte-identity above becomes vacuous:
    // the app would simply have stopped telling anyone anything.
    expect(owner).toContain('Xogta');
    expect(owner).toContain('Goobtaada booqdayaasha lagama muujiyo');
  });

  it('is absent for the visitor, so there is no node to un-hide', async () => {
    expect(await html(createElement(AnigaFacts, { facts: null }))).toBe('');
  });
});
