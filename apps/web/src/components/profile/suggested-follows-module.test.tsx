// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

/**
 * Frame 9c "Kula talin" module variant (Munaasabado Task 10): the compact
 * ONE-person follow-suggestion card for the Madal rail / mobile-inline slot.
 * Locks the HANDOFF acceptance criteria:
 *   - uppercase module title + the privacy sentence + a visible reason;
 *   - a suggestion with ZERO reasons renders NOTHING (mandatory-reason rule —
 *     the API already drops them, this is the client-side belt);
 *   - the module is QUIET while loading (no LoadingFlap in the rail);
 *   - the default grid variant is untouched (smoke).
 *
 * Client component with a useEffect fetch → createRoot + act idiom from
 * notifications-inbox.test.tsx, SO dictionary so frame strings assert
 * verbatim.
 */

const apiGet = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPut: vi.fn().mockResolvedValue({}),
  apiDelete: vi.fn().mockResolvedValue({}),
  apiPost: vi.fn().mockResolvedValue({}),
  ApiRequestError: class MockApiRequestError extends Error {
    plain = { code: 'server_error', message: '' };
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/plaza',
}));

import { SuggestedFollows } from './suggested-follows';

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

async function mount(element: React.ReactElement) {
  root = createRoot(container);
  await act(async () => {
    root!.render(<LocaleProvider initialLocale="so">{element}</LocaleProvider>);
  });
}

function faysal(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'u-faysal',
    display_name: 'Faysal Hirsi',
    handle: 'faysal',
    location_city: 'Nairobi',
    location_country: 'Kenya',
    avatar_thumb_url: null,
    avatar_blurhash: null,
    reasons: [{ kind: 'shares_lane', value: 'Fintech' }, { kind: 'same_city' }],
    ...overrides,
  };
}

const PRIVACY = 'Kaliya xogtaada bogga ayaa la isticmaalay — sabab kasta waa la muujiyaa.';

describe('SuggestedFollows module variant (frame 9c "Kula talin")', () => {
  it('renders the module title, one person with reasons, and the privacy note', async () => {
    apiGet.mockResolvedValue({ people: [faysal()], labs: [] });

    await mount(<SuggestedFollows variant="module" />);

    expect(container.textContent).toContain('Kula talin');
    expect(container.textContent).toContain('Faysal Hirsi');
    expect(container.textContent).toContain('Sababta:');
    // The visible "why" keeps the existing reasonCopy() chips.
    const chips = [...container.querySelectorAll('.xidig-tag')].map((el) => el.textContent);
    expect(chips).toContain('Waxaad wadaagtaan waddada Fintech');
    expect(container.textContent).toContain(PRIVACY);
    // Follow (Raac) and Skip both survive the compaction.
    expect(container.textContent).toContain('Raac');
    expect(container.textContent).toContain('Iska dhaaf');
  });

  it('renders NOTHING for a suggestion with zero reasons (mandatory-reason rule)', async () => {
    apiGet.mockResolvedValue({ people: [faysal({ reasons: [] })], labs: [] });

    await mount(<SuggestedFollows variant="module" />);

    expect(container.innerHTML).toBe('');
  });

  it('stays quiet while loading — no LoadingFlap in the rail', async () => {
    apiGet.mockReturnValue(new Promise(() => {})); // never settles

    await mount(<SuggestedFollows variant="module" />);

    expect(container.innerHTML).toBe('');
  });

  it('grid variant (default) still renders the existing card grid, not the module', async () => {
    apiGet.mockResolvedValue({ people: [faysal()], labs: [] });

    await mount(<SuggestedFollows />);

    expect(container.textContent).toContain('Dad aad raacdo');
    expect(container.textContent).not.toContain('Kula talin');
    expect(container.textContent).not.toContain(PRIVACY);
  });
});
