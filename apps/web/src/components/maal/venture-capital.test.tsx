// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { VentureCapital as VentureCapitalModel } from '@/lib/maal/views';

import { VentureCapital } from './venture-capital';

/**
 * The capital tab — frame 7f, in Somali because the frames are the Somali copy.
 *
 * Two claims, and they pull in opposite directions on purpose:
 *
 *  1. **the controls EXIST.** The pledge input and the pledge button are in the
 *     DOM. A member is entitled to see the shape of the thing they will one day
 *     use, and to see exactly where it stops. Deleting them would make the page
 *     honest by making it empty;
 *  2. **and they are DISABLED, with the reason next to them.** Not behind a
 *     tooltip, not on a page you have to go and find: the escrow does not exist
 *     and Xidig refused to hold anyone's money before it does.
 *
 * And the negative claim, which is the one most likely to erode later: there is
 * **no date, no countdown, no waitlist, no "coming soon"** anywhere on this
 * surface. The footer is the whole promise. A future edit that adds "launching
 * soon" or an email capture to this page fails the last test in this file.
 */

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getLocale: async () => 'so', getT: async () => createTranslator('so') };
});

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'so', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const capital = (overrides: Partial<VentureCapitalModel> = {}): VentureCapitalModel =>
  ({
    need: {
      id: 'n1',
      lab_id: 'lab-1',
      amount_cents: 1_800_000,
      currency: 'USD',
      purpose: 'Tijaabo 4aad',
      decision_id: 'd1',
      declared_at: '2026-07-01T00:00:00Z',
      created_at: '2026-07-01T00:00:00Z',
    },
    decision: {
      id: 'd1',
      title: '6 xubin oo raacay',
      decision: 'Waa la ansixiyay',
      decidedAt: '2026-07-01T00:00:00Z',
    },
    viewer: {},
    ...overrides,
  }) as unknown as VentureCapitalModel;

const render = (model: VentureCapitalModel) =>
  mount(createElement(VentureCapital, { capital: model, locale: 'so' }));

describe('the pledge control is built and inert', () => {
  it('puts the amount field in the DOM, disabled', async () => {
    const host = await render(capital());
    const input = host.querySelector<HTMLInputElement>('.xidig-pledge input');
    expect(input, 'the pledge amount field must be present, not removed').not.toBeNull();
    expect(input!.hasAttribute('disabled')).toBe(true);
    expect(input!.getAttribute('aria-label')).toBe('Qaddarka ballanqaadka');
  });

  it('puts the pledge button in the DOM, disabled', async () => {
    const host = await render(capital());
    const button = host.querySelector<HTMLButtonElement>('.xidig-pledge button');
    expect(button, 'the pledge button must be present, not removed').not.toBeNull();
    expect(button!.hasAttribute('disabled')).toBe(true);
    expect(button!.textContent).toBe('Ballanqaad');
  });

  it('states the real reason beside the control, not behind it', async () => {
    const host = await render(capital());
    const card = host.querySelector('.xidig-pledge')?.closest('.xidig-venture__card');
    // A3 claims containment: the lock copy states the truthful status
    // ("pledging is not currently offered") with no escrow promise…
    expect(card!.textContent).toContain('ballanqaad hadda laguma bixiyo Xidig');
    // …and money never goes straight to a founder.
    expect(card!.textContent).toContain('uma tagto akoonka aasaasaha');
  });

  it('leads with the no-money-moves status as a system notice', async () => {
    const host = await render(capital());
    const notice = host.querySelector('.xidig-system-notice')?.textContent ?? '';
    expect(notice).toContain('Lacag halkan kuma dhaqaaqdo');
    expect(notice).toContain('cidna lacagteeda ma hayo');
  });
});

describe('the declared need and what works today', () => {
  it('shows the amount, the purpose and the decision behind it', async () => {
    const host = await render(capital());
    const need = host.querySelector('.xidig-need')?.textContent ?? '';
    expect(need).toContain('Qaddarka');
    expect(need).toContain('Ujeeddada');
    expect(need).toContain("Go'aankii");
    expect(need).toContain('18,000');
  });

  it('marks the paused and locked rungs as pending, never as failures', async () => {
    const host = await render(capital());
    const rows = [...host.querySelectorAll('.xidig-works__row')];
    expect(rows).toHaveLength(5);
    const pending = rows.filter((row) => row.className.includes('--pending'));
    // Declaring a new capital need is paused (owner ruling, 12 Sep): the row no
    // longer claims it works, and says why without a date or a CTA.
    expect(pending.map((row) => row.textContent)).toEqual([
      'Sheegista baahi raasamaal oo cusub — waa la hakiyay inta habka raasamaalka dib loo eegayo',
      'Ballanqaad lacageed — xiran',
      'Amaan (escrow) — lama bixiyo',
    ]);
  });

  it('a need recorded before the pause stays readable, and nothing invites a new one', async () => {
    const host = await render(capital());
    expect(host.querySelector('.xidig-need')).not.toBeNull();
    // The only form control on the tab is the disabled pledge pair — there is
    // no declare-a-need input or button, enabled or otherwise.
    const controls = [...host.querySelectorAll('input, button, textarea, select, form')];
    expect(controls.every((el) => (el as HTMLInputElement).disabled === true)).toBe(true);
    expect(host.querySelector('form')).toBeNull();
  });
});

describe('no date is promised anywhere', () => {
  it('carries the footer promise and nothing warmer', async () => {
    const host = await render(capital());
    const text = host.textContent ?? '';
    // The footer promises NOTHING — no escrow, no date ("when the escrow is
    // ready" is gone with the rest of the when/until promises).
    expect(text).toContain('Ma ballanqaadno amaan (escrow) iyo taariikh midna');
    expect(text).toContain('shaqada ayaa muhiim');
  });

  it('has no countdown, no waitlist and no coming-soon language', async () => {
    const host = await render(capital());
    const text = (host.textContent ?? '').toLowerCase();
    // SO and EN both: nothing here may imply a schedule or collect an intent.
    for (const banned of [
      'safka sugitaanka', // waitlist
      'dhawaan', // soon
      'coming soon',
      'waitlist',
      'notify me',
      'launching',
    ]) {
      expect(text.includes(banned), `"${banned}" appeared on the capital tab`).toBe(false);
    }
    // No countdown element, and no progress meter toward a launch.
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(host.querySelector('.xidig-goal__track')).toBeNull();
  });
});
