// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { EventCheckinRow } from '@/lib/events/views';

import { CheckinList } from './checkin-list';

/**
 * Host door list (Munaasabado dispatch, Task 6 — brief item 9). Live-DOM
 * suite in the SOMALI dictionary (the frames ARE the Somali copy; harness
 * idiom from owner-controls.test.tsx because the rows are interactive).
 *
 * What the door list must hold:
 *  - every RSVP renders as a row: name + a labelled "Yimid" checkbox;
 *  - the checkbox reflects the SERVER's stamp (checked_in_at), never a local
 *    guess — attendance is the official record;
 *  - a change POSTs { userId, checkedIn } to the event's checkin route and
 *    refreshes, so the count on the page is always the recorded truth.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiPost = vi.fn();
const refresh = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiPost: (...args: unknown[]) => apiPost(...args),
  ApiRequestError: class extends Error {},
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => refresh() }),
  usePathname: () => '/events/shir-london',
}));

const rows: EventCheckinRow[] = [
  {
    userId: 'a0000000-0000-4000-8000-000000000001',
    displayName: 'Cali Maxamed',
    handle: 'cali',
    status: 'going',
    checkedInAt: null,
  },
  {
    userId: 'a0000000-0000-4000-8000-000000000002',
    displayName: 'Deeqa Axmed',
    handle: 'deeqa',
    status: 'interested',
    checkedInAt: '2026-08-15T13:05:00Z',
  },
];

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  apiPost.mockReset();
  apiPost.mockResolvedValue({ checkedIn: true });
  refresh.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

function mount(list: EventCheckinRow[] = rows) {
  root = createRoot(container);
  act(() =>
    root!.render(
      <LocaleProvider initialLocale="so">
        <CheckinList slug="shir-london" rows={list} />
      </LocaleProvider>,
    ),
  );
}

function checkboxes(): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

describe('CheckinList — the host door list', () => {
  it('renders the title, the hint, and one named row + Yimid checkbox per RSVP', () => {
    mount();

    expect(container.textContent).toContain('Diiwaangeli imaatinka');
    expect(container.textContent).toContain(
      'Calaamadee cidda timid — tiradu waxay noqotaa diiwaanka rasmiga ah.',
    );
    expect(container.textContent).toContain('Cali Maxamed');
    expect(container.textContent).toContain('Deeqa Axmed');
    expect(checkboxes()).toHaveLength(2);
    // The checkbox is labelled, not bare: the label text is the Yimid verb.
    expect(container.textContent).toContain('Yimid');
  });

  it('reflects checked_in_at: stamped rows are checked, unstamped rows are not', () => {
    mount();

    const [cali, deeqa] = checkboxes();
    expect(cali!.checked).toBe(false);
    expect(deeqa!.checked).toBe(true);
  });

  it('marking someone as came POSTs { userId, checkedIn: true } to the checkin route', async () => {
    mount();

    await act(async () => {
      checkboxes()[0]!.click();
    });

    expect(apiPost).toHaveBeenCalledWith('/api/events/shir-london/checkin', {
      userId: 'a0000000-0000-4000-8000-000000000001',
      checkedIn: true,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('unchecking a stamped row POSTs checkedIn: false (undo stays possible)', async () => {
    mount();

    await act(async () => {
      checkboxes()[1]!.click();
    });

    expect(apiPost).toHaveBeenCalledWith('/api/events/shir-london/checkin', {
      userId: 'a0000000-0000-4000-8000-000000000002',
      checkedIn: false,
    });
  });

  it('renders nothing at all when the door list is empty', () => {
    mount([]);
    expect(container.textContent).toBe('');
  });

  it('each checkbox carries a DISTINCT accessible name: the attendee + the Yimid verb (fix 7)', () => {
    mount();

    const names = checkboxes().map((box) => {
      const ids = box.getAttribute('aria-labelledby');
      expect(ids).not.toBeNull();
      return ids!
        .split(/\s+/)
        .map((id) => container.querySelector(`#${id}`)?.textContent?.trim() ?? '')
        .join(' ');
    });

    // Programmatically tied to ITS row — never twenty identical "Yimid"
    // checkboxes to a screen reader.
    expect(names).toEqual(['Cali Maxamed Yimid', 'Deeqa Axmed Yimid']);
    expect(new Set(names).size).toBe(2);
  });
});
