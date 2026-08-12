// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { CurrentMentor, MentorSlot } from '@/lib/mentor/current';

import { MentorResidenceCard } from './mentor-residence-card';

/**
 * Frame 9c "La-taliye joogto ah — Agoosto": the Munaasabado Task 9 rail card
 * for the mentor-in-residence booking flow. Self-fetching + quiet-when-empty,
 * same contract as the Home card (mentor-in-residence.tsx) it sits beside —
 * `getCurrentMentor`/`getMentorSlots` are mocked at the module boundary
 * rather than faking Supabase chains, since the read-side wiring already has
 * its own coverage (or will, in lib/mentor/current.ts).
 *
 * jsdom SSR mount idiom from aniga-facts.test.tsx: LocaleProvider +
 * renderToReadableStream + a plain host div, SO dictionary throughout so the
 * frame strings can be asserted verbatim.
 */

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getLocale: async () => 'so', getT: async () => createTranslator('so') };
});

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({ appUser: { id: 'viewer-1' } }),
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({}),
}));

vi.mock('@/lib/lite/server', async () => {
  const { LITE_BUNDLES } = await import('@/lib/lite/prefs');
  return { getLitePrefs: async () => LITE_BUNDLES.everything };
});

const mentorHolder = vi.hoisted(() => ({
  mentor: null as CurrentMentor | null,
  slots: [] as MentorSlot[],
}));

vi.mock('@/lib/mentor/current', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/mentor/current')>('@/lib/mentor/current');
  return {
    ...actual,
    getCurrentMentor: async () => mentorHolder.mentor,
    getMentorSlots: async () => mentorHolder.slots,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/plaza',
}));

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'so', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const ADVISOR = {
  userId: 'advisor-1',
  displayName: 'Cabdiraxmaan Siciid',
  handle: 'cabdiraxmaan',
  avatarPath: null,
  avatarBlurhash: null,
};

function mentor(overrides: Partial<CurrentMentor> = {}): CurrentMentor {
  return {
    residencyId: 'residency-1',
    period: '2026-08',
    focus: 'CPA · 12 sano canshuur ganacsi',
    startsOn: '2026-08-01',
    endsOn: '2026-08-31',
    advisor: ADVISOR,
    asksThisWeek: 3,
    labName: 'Ganacsi Yaryar 101',
    hoursNote: 'Khamiis 18:00–20:00',
    slotMinutes: 20,
    ...overrides,
  };
}

const OPEN_SLOT: MentorSlot = {
  id: 'slot-open',
  startsAt: '2099-08-20T18:00:00Z',
  endsAt: '2099-08-20T18:20:00Z',
  state: 'open',
};

describe('MentorResidenceCard — frame 9c', () => {
  it('renders nothing when there is no active residency (quiet-when-empty)', async () => {
    mentorHolder.mentor = null;
    mentorHolder.slots = [];

    const html = await mount(createElement(MentorResidenceCard));

    expect(html.innerHTML.trim()).toBe('');
  });

  it('carries the booking CTA, the free-note footer and the host lab name', async () => {
    mentorHolder.mentor = mentor();
    mentorHolder.slots = [OPEN_SLOT];

    const html = await mount(createElement(MentorResidenceCard));

    expect(html.textContent).toContain('Ballan qabso');
    expect(html.textContent).toContain('Bilaash — Warshadda ayaa martigelisa. 20 daqiiqo qofkii.');
    expect(html.textContent).toContain('Ganacsi Yaryar 101');
    expect(html.textContent).toContain('Cabdiraxmaan Siciid');
  });

  it('marks the booked-slot line as UTC explicitly (ruling 7 — no per-slot timezone column yet)', async () => {
    mentorHolder.mentor = mentor();
    // OPEN_SLOT starts 2099-08-20T18:00:00Z — a Thursday ("Khamiis"). Booked
    // state renders unconditionally (unlike the open-slot list, which lives
    // inside the closed-by-default Dialog and isn't reachable from this
    // SSR-only harness), so it's the marker's one directly assertable spot
    // here; the same `slotWhen` helper backs both.
    mentorHolder.slots = [{ ...OPEN_SLOT, id: 'slot-mine', state: 'yours' }];

    const html = await mount(createElement(MentorResidenceCard));

    expect(html.textContent).toContain('Ballankaaga: Khamiis 18:00 UTC');
  });

  it('renders no facts row for a field the residency never set', async () => {
    mentorHolder.mentor = mentor({ labName: null, hoursNote: null });
    mentorHolder.slots = [OPEN_SLOT];

    const html = await mount(createElement(MentorResidenceCard));

    expect(html.textContent).not.toContain('Martigeliye');
    expect(html.textContent).not.toContain('Saacadaha');
  });
});
