// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { PeopleDirectory } from './people-directory';

/**
 * Visitor chip-row contract (11 Aug ruling): the card renders SKILLS only.
 * Lanes are owner-only — they stay discovery metadata (the lane filter above
 * the results is untouched) but never a visitor display surface, because a
 * `.xidig-tag` pill is this product's attested-evidence typography and a
 * ticked sector checkbox wearing it reads as a stranger's vouch.
 */

const profile = {
  user_id: 'U1',
  display_name: 'Faadumo Cali',
  handle: 'faadumo_builds',
  bio: 'Site engineer.',
  location_city: 'Hargeisa',
  location_country: 'Somaliland',
  // 'halal-finance' is held ONLY as a lane, so its absence proves lanes are
  // dropped as lanes; 'construction' is held as both, so its single chip
  // proves the rule is not a word blacklist.
  lanes: ['halal-finance', 'construction'],
  skills: ['construction', 'civil engineering', 'costing', 'tendering', 'safety', 'surveying'],
  verification_status: 'verified',
  created_at: '2026-07-01T00:00:00Z',
  avatar_thumb_url: null,
  avatar_blurhash: null,
};

function stubPage(row: typeof profile) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { profiles: [row], nextCursor: null } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

async function render() {
  const host = document.createElement('div');
  document.body.append(host);
  await act(async () => {
    createRoot(host).render(
      <LocaleProvider initialLocale="en">
        <PeopleDirectory />
      </LocaleProvider>,
    );
  });
  return host;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('PeopleDirectory chip row', () => {
  it('renders skills and never a lane', async () => {
    stubPage(profile);
    const host = await render();

    const card = host.querySelector('.xidig-card-grid li');
    expect(card).not.toBeNull();
    const chips = [...card!.querySelectorAll('.xidig-tag')].map((el) => el.textContent);
    expect(chips).toEqual(profile.skills);
    // Nowhere in the card, not merely absent from the chip row.
    expect(card!.textContent).not.toContain('halal-finance');
    // A word that is both stays — once, on its skill footing.
    expect(chips.filter((c) => c === 'construction')).toHaveLength(1);
    // Lanes remain a filter: the same slug is still an option in the toolbar.
    const laneOptions = [...host.querySelectorAll('#people-lane option')].map(
      (el) => el.textContent,
    );
    expect(laneOptions).toContain('halal-finance');
  });

  it('dedupes repeated skills before the 6-chip cap', async () => {
    // profiles.skills is normalized distinct on write only since migration
    // 20260718200000, which never backfilled — a legacy row can still repeat.
    stubPage({
      ...profile,
      skills: [
        'construction',
        'construction',
        'civil engineering',
        'costing',
        'tendering',
        'safety',
        'surveying',
      ],
    });
    const consoleError = vi.spyOn(console, 'error');
    const host = await render();

    const chips = [...host.querySelectorAll('.xidig-tag')].map((el) => el.textContent);
    expect(chips).toHaveLength(6);
    // Dedupe runs BEFORE the cap: the repeat must not cost 'surveying' (raw
    // position 7) its slot.
    expect(chips).toContain('surveying');
    // And React never saw colliding keys.
    const keyComplaints = consoleError.mock.calls.filter((call) =>
      String(call[0]).includes('same key'),
    );
    expect(keyComplaints).toHaveLength(0);
  });
});
