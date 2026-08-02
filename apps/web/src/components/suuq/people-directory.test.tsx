// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { PeopleDirectory } from './people-directory';

/**
 * Chip-row dedupe contract: lanes + skills render as ONE undifferentiated
 * chip row, and a member can legitimately hold the same word in both (the
 * seeded persona with lane AND skill "construction" surfaced this as a
 * React duplicate-key error on /suuq). The row must dedupe exact repeats
 * BEFORE the 6-chip cap — one chip per word, no duplicate-key warning, and
 * a repeated word never costs a unique one its slot.
 */

const profile = {
  user_id: 'U1',
  display_name: 'Faadumo Cali',
  handle: 'faadumo_builds',
  bio: 'Site engineer.',
  location_city: 'Hargeisa',
  location_country: 'Somaliland',
  // "construction" appears as BOTH a lane and a skill; raw merge is 7 long,
  // so pre-dedupe slicing would also push "surveying" off the cap.
  lanes: ['construction'],
  skills: ['construction', 'civil engineering', 'costing', 'tendering', 'safety', 'surveying'],
  verification_status: 'verified',
  created_at: '2026-07-01T00:00:00Z',
  avatar_thumb_url: null,
  avatar_blurhash: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('PeopleDirectory chip row', () => {
  it('dedupes a word held as both lane and skill — one chip, no duplicate keys, cap not wasted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { profiles: [profile], nextCursor: null } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    // The regression tripwire: React reports key collisions via console.error.
    const consoleError = vi.spyOn(console, 'error');

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <LocaleProvider initialLocale="en">
          <PeopleDirectory />
        </LocaleProvider>,
      );
    });

    const chips = [...host.querySelectorAll('.xidig-tag')].map((el) => el.textContent);
    // One chip per word — "construction" exactly once.
    expect(chips.filter((c) => c === 'construction')).toHaveLength(1);
    // Dedupe happens BEFORE the 6-chip cap: the duplicate must not have cost
    // "surveying" (raw-merge position 7) its slot.
    expect(chips).toContain('surveying');
    expect(chips).toHaveLength(6);
    // And React never saw colliding keys.
    const keyComplaints = consoleError.mock.calls.filter((call) =>
      String(call[0]).includes('same key'),
    );
    expect(keyComplaints).toHaveLength(0);
  });
});
