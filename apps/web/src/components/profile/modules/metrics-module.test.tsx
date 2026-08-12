// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import type { Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import type { AnigaMetrics } from '@/lib/aniga/view';

import { MetricsModule } from './metrics-module';

/**
 * Tirakoobka under a platform flag (spec §3.5, A3/A4).
 *
 * Two things are being locked, and both are about honesty rather than layout:
 *
 *  1. **Absence.** While the flag is off a visitor gets no node — not a dimmed
 *     card, not an empty wrapper. Counts that "exist but are hidden" are one
 *     CSS mistake away from being counts.
 *  2. **Copy law** (ruling 7, endorsed 9 Aug). The row states a system fact —
 *     off, platform decision — and is never promotional. "Coming soon" would
 *     turn a governance decision into a teaser, so the assertion is a
 *     vocabulary ban in BOTH locales, not a spot-check of one sentence.
 */

const state = vi.hoisted(() => ({ locale: 'so' as Locale }));

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return {
    getLocale: async () => state.locale,
    getT: async () => createTranslator(state.locale),
  };
});

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: state.locale, children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const METRICS: AnigaMetrics = { posts: 31, asksHelped: 7, connections: 128 };

describe('flag off — the owner sees an honest inert module', () => {
  it('renders dashed, chipped, and with an eye that is present but refused', async () => {
    const html = await mount(
      createElement(MetricsModule, {
        metrics: METRICS,
        viewer: 'owner' as const,
        lockedByFlag: true,
      }),
    );

    const card = html.querySelector('[data-module="metrics"]');
    expect(card?.className).toContain('xidig-amodule--locked');
    expect(html.querySelector('.xidig-amodule__flag')?.textContent).toBe('Booqdayaasha: damsan');

    // The control the owner expects is there — and visibly cannot act.
    const eye = html.querySelector<HTMLButtonElement>('.xidig-amodule__eye');
    expect(eye?.getAttribute('aria-pressed')).toBe('false');
    expect(eye?.hasAttribute('disabled')).toBe(true);
  });

  it('shows the three stats the frames name', async () => {
    const html = await mount(
      createElement(MetricsModule, {
        metrics: METRICS,
        viewer: 'owner' as const,
        lockedByFlag: true,
      }),
    );
    const stats = Array.from(html.querySelectorAll('.xidig-ametrics__stat'));
    expect(stats.map((node) => node.textContent)).toEqual([
      '31Qoraal',
      '7Codsi la caawiyay',
      '128Xiriir',
    ]);
  });
});

describe('A2/A3 — a flag-locked module is absent from the visitor DOM', () => {
  it('renders nothing at all for a member or an anon visitor', async () => {
    for (const viewer of ['member', 'anon'] as const) {
      const html = await mount(
        createElement(MetricsModule, { metrics: METRICS, viewer, lockedByFlag: true }),
      );
      expect(html.querySelector('[data-module="metrics"]'), viewer).toBeNull();
      // Not merely the card: no label, no chip, no count reaches the tree.
      expect(html.children, viewer).toHaveLength(0);
      expect(html.textContent, viewer).toBe('');
    }
  });

  it('renders nothing when the viewer was given no metrics to show', async () => {
    const html = await mount(
      createElement(MetricsModule, {
        metrics: null,
        viewer: 'owner' as const,
        lockedByFlag: true,
      }),
    );
    expect(html.children).toHaveLength(0);
  });

  it('drops the flag note once the platform turns the module on', async () => {
    // Left in place it would state something false — the flag is no longer off.
    const html = await mount(
      createElement(MetricsModule, {
        metrics: METRICS,
        viewer: 'member' as const,
        lockedByFlag: false,
      }),
    );
    expect(html.querySelector('[data-module="metrics"]')).not.toBeNull();
    expect(html.querySelector('.xidig-amodule__note')).toBeNull();
    expect(html.querySelector('.xidig-amodule--locked')).toBeNull();
  });
});

describe('A4 — the flag row reads as system state, never as a teaser', () => {
  /** Anything that turns "we decided this is off" into "wait for it". */
  const PROMOTIONAL =
    /coming soon|\bsoon\b|stay tuned|dhow?aan|sug|launch|beta|preview|new feature|cusub/i;

  it('states who decided, in both locales, without selling a future', async () => {
    const rendered: string[] = [];
    for (const locale of ['so', 'en'] as const) {
      state.locale = locale;
      const html = await mount(
        createElement(MetricsModule, {
          metrics: METRICS,
          viewer: 'owner' as const,
          lockedByFlag: true,
        }),
      );
      const copy = html.textContent ?? '';
      rendered.push(copy);

      expect(copy, locale).not.toMatch(PROMOTIONAL);
      // No countdown either: the only digits on the card are the stats.
      expect(copy.replace(/31|7|128/g, ''), locale).not.toMatch(/\d/);
      expect(copy, locale).not.toContain('!');
    }
    state.locale = 'so';

    // Both locales really rendered — otherwise the English pass above would be
    // asserting on Somali copy and proving nothing.
    expect(rendered[0]).not.toBe(rendered[1]);
    expect(rendered[1]).toContain('platform decision');
  });

  it('names the platform as the decider', async () => {
    const html = await mount(
      createElement(MetricsModule, {
        metrics: METRICS,
        viewer: 'owner' as const,
        lockedByFlag: true,
      }),
    );
    // "waa go'aan madal" — a platform decision, not a setting of yours.
    expect(html.querySelector('.xidig-amodule__note')?.textContent).toContain('go’aan madal');
  });
});
