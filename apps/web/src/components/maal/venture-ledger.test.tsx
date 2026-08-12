// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { LITE_BUNDLES } from '@/lib/lite/prefs';
import type {
  LedgerEventView,
  LedgerMemberRow,
  VentureLedger as VentureLedgerModel,
} from '@/lib/maal/views';

import { VentureLedger } from './venture-ledger';

/**
 * The contribution ledger — frames 7d and 7g, rendered against the SOMALI
 * dictionary because the frames ARE the Somali copy.
 *
 * **RULING 1 IS THE POINT OF THIS FILE.** The mobile ledger is the FULL ledger:
 * same read model, same capability, responsive presentation. The tests below
 * are structural on purpose — they assert what is in the DOM from ONE render,
 * because that is the only claim that survives a stylesheet change:
 *
 *   - all seven desktop columns (Xubin / Saacado / Koodh / Naqshad / Xiriir /
 *     Halbeeg / Saami) come out of a single render, so there is no width at
 *     which one of them is missing from the document;
 *   - each metric carries its own label, so the card layout and the table
 *     layout read the same to a screen reader;
 *   - the CSS never sets `display: none` on a metric — the only thing a media
 *     query is allowed to hide is a LABEL, and only by clipping it (which keeps
 *     it in the accessibility tree);
 *   - the event trail, the CSV export and the filters are in the same DOM as
 *     the table. Nothing is "desktop only".
 *
 * The rest locks the honesty rules: the compliance notice sits at the TOP, a
 * reversal renders as itself rather than as a hole, and state m4 keeps the last
 * verified totals on screen when the detail read fails.
 */

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getLocale: async () => 'so', getT: async () => createTranslator('so') };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/labs/suuq-card',
}));

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'so', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const member = (overrides: Partial<LedgerMemberRow> = {}): LedgerMemberRow => ({
  userId: '22222222-2222-4222-8222-222222222222',
  member: {
    user_id: '22222222-2222-4222-8222-222222222222',
    display_name: 'Hodan Cabdi',
    handle: 'hodan',
    avatar_thumb_url: null,
    avatar_blurhash: null,
  },
  role: 'lead',
  hours: 128,
  codeCount: 18,
  designCount: 4,
  introCount: 3,
  moneyCents: 0,
  units: 1240,
  verifiedUnits: 1100,
  eventCount: 47,
  share: 0.41,
  ...overrides,
});

/**
 * A member whose hours are folded away. The read model withholds the per-TYPE
 * breakdown with them — units plus the published weights would otherwise invert
 * the hidden hours — so every count comes back null, not zero. Cast because the
 * component must tolerate the null shape whatever the model's declared type is:
 * a widened field would make this fixture typecheck, and a narrowed one must
 * not quietly delete the test.
 */
const withheld = (): LedgerMemberRow =>
  ({
    ...member(),
    hours: null,
    codeCount: null,
    designCount: null,
    introCount: null,
    moneyCents: null,
  }) as unknown as LedgerMemberRow;

const event = (overrides: Partial<LedgerEventView> = {}): LedgerEventView => ({
  id: 'e1',
  seq: 47,
  member: {
    user_id: '22222222-2222-4222-8222-222222222222',
    display_name: 'Cali',
    handle: 'cali',
    avatar_thumb_url: null,
    avatar_blurhash: null,
  },
  memberUserId: '22222222-2222-4222-8222-222222222222',
  type: 'hours',
  quantity: 9,
  unitWeight: 8,
  units: 72,
  note: null,
  task: { id: 't1', title: 'tababar' },
  occurredAt: '2026-08-12T09:00:00Z',
  attestationCount: 2,
  isReversal: false,
  reversesEventId: null,
  ...overrides,
});

const ledger = (overrides: Partial<VentureLedgerModel> = {}): VentureLedgerModel =>
  ({
    lab: { id: 'lab-1', name: 'Suuq-Card' },
    viewer: { canReadLedger: true, canReadHours: true },
    members: [member()],
    stats: {
      totalHours: 312,
      totalUnits: 3020,
      eventCount: 47,
      contributorCount: 6,
      moneyCents: 0,
    },
    weights: {
      weights: { hours: 8, code: 12, design: 10, intro: 25, money: 0 },
      effectiveFrom: null,
      decisionId: null,
    },
    trail: [event()],
    trailError: false,
    filters: { memberId: null, type: null, days: 90 },
    ...overrides,
  }) as unknown as VentureLedgerModel;

const render = (model: VentureLedgerModel) =>
  mount(
    createElement(VentureLedger, {
      ledger: model,
      slug: 'suuq-card',
      labId: 'lab-1',
      locale: 'so',
      prefs: LITE_BUNDLES.everything,
    }),
  );

describe('ruling 1 — the mobile ledger IS the ledger', () => {
  it('renders all seven columns from ONE render, with no per-viewport variant', async () => {
    const host = await render(ledger());

    // The table head names the seven columns…
    const head = host.querySelector('.xidig-ledger-head')?.textContent ?? '';
    for (const column of ['Xubin', 'Saacado', 'Koodh', 'Naqshad', 'Xiriir', 'Halbeeg', 'Saami']) {
      expect(head, `column "${column}" missing from the ledger head`).toContain(column);
    }

    // …and the row itself carries a node for every one of them.
    const row = host.querySelector('.xidig-ledger-row');
    expect(row).not.toBeNull();
    expect(row!.querySelector('.xidig-ledger-row__member')).not.toBeNull();
    expect(row!.querySelector('.xidig-ledger-cell--hours')).not.toBeNull();
    expect(row!.querySelector('.xidig-ledger-cell--code')).not.toBeNull();
    expect(row!.querySelector('.xidig-ledger-cell--design')).not.toBeNull();
    expect(row!.querySelector('.xidig-ledger-cell--intro')).not.toBeNull();
    expect(row!.querySelector('.xidig-ledger-row__units')).not.toBeNull();
    expect(row!.querySelector('.xidig-ledger-row__share')).not.toBeNull();

    // Exactly ONE row per member — no second, thinner mobile list alongside it.
    expect(host.querySelectorAll('.xidig-ledger-row')).toHaveLength(1);
  });

  it('gives every metric its own label, so both layouts read the same aloud', async () => {
    const host = await render(ledger());
    const labels = [...host.querySelectorAll('.xidig-ledger-cell__label')].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(['Saac', 'PR', 'Naqshad', 'Xiriir']);
  });

  it('ships the export, the filters and the event trail in the same DOM as the table', async () => {
    const host = await render(ledger());
    // CSV export — a capability, so it exists at every width.
    expect(host.querySelector('.xidig-ledger__export')?.textContent).toContain('Soo deji CSV');
    expect(host.querySelector('.xidig-ledger__filter-trigger')?.textContent).toContain('Shaandhee');
    expect(host.querySelector('.xidig-trail')).not.toBeNull();
  });

  it('no media query hides a metric — only labels are clipped, never removed', async () => {
    // Repo-root relative: this file runs under jsdom, where `import.meta.url`
    // is an http: URL and fileURLToPath cannot resolve it. The single vitest
    // config lives at the root, so cwd is the root.
    const css = readFileSync(resolve(process.cwd(), 'apps/web/src/app/globals.css'), 'utf8');
    // Every rule that mentions a ledger metric cell, its value, or the member /
    // share / units areas must not switch it off at any width.
    const metricSelectors = [
      '.xidig-ledger-cell ',
      '.xidig-ledger-cell__value',
      '.xidig-ledger-cell--hours',
      '.xidig-ledger-cell--code',
      '.xidig-ledger-cell--design',
      '.xidig-ledger-cell--intro',
      '.xidig-ledger-row__share',
      '.xidig-ledger-row__units',
      '.xidig-ledger-row__member',
    ];
    for (const selector of metricSelectors) {
      const pattern = new RegExp(
        `${selector.trim().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}[^,{]*\\{[^}]*display:\\s*none`,
      );
      expect(
        pattern.test(css),
        `${selector.trim()} is hidden by a CSS rule — ruling 1 forbids cutting a ledger column at any width`,
      ).toBe(false);
    }
    // The label IS allowed to leave the visual layout, but only by clipping —
    // display:none would drop it out of the accessibility tree too.
    expect(/\.xidig-ledger-cell__label[^,{]*\{[^}]*display:\s*none/.test(css)).toBe(false);
    expect(/\.xidig-ledger-cell__label \{[\s\S]*?clip-path: inset\(50%\)/.test(css)).toBe(true);
  });
});

describe('the compliance notice', () => {
  it('is the first block after the heading, not a footnote', async () => {
    const host = await render(ledger());
    const notice = host.querySelector('.xidig-system-notice');
    const table = host.querySelector('.xidig-ledger-table');
    expect(notice).not.toBeNull();
    expect(table).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING === 4: the table comes after the notice.
    expect(notice!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(4);
  });

  it('states append-only, hash-chained, no legal force, and one member one vote', async () => {
    const host = await render(ledger());
    const text = host.querySelector('.xidig-system-notice')?.textContent ?? '';
    expect(text).toContain('lifaaq-kaliya');
    expect(text).toContain('silsilad-hash');
    expect(text).toContain('xoog sharci ma leh');
    expect(text).toContain('xubin kasta oo la xaqiijiyay hal cod');
  });
});

describe('corrections are visible history', () => {
  it('renders a reversal as itself — muted, with the arrow and the reason', async () => {
    const host = await render(
      ledger({
        trail: [
          event(),
          event({
            id: 'e2',
            seq: 46,
            isReversal: true,
            reversesEventId: 'e1',
            quantity: -2,
            note: 'khalad qoraal',
            attestationCount: 0,
            member: {
              user_id: '33333333-3333-4333-8333-333333333333',
              display_name: 'Deeqa',
              handle: 'deeqa',
              avatar_thumb_url: null,
              avatar_blurhash: null,
            },
          }),
        ],
      }),
    );

    const rows = [...host.querySelectorAll('.xidig-trail__row')];
    expect(rows).toHaveLength(2);
    const reversal = host.querySelector('.xidig-trail__row--reversal');
    expect(reversal).not.toBeNull();
    // It says what it undid, and why — never a gap where the row used to be.
    expect(reversal!.textContent).toContain('Celin: Deeqa');
    expect(reversal!.textContent).toContain('khalad qoraal');
    expect(reversal!.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Celin');
    // And the row it corrects is still there, untouched.
    expect(rows[0]!.className).not.toContain('reversal');
  });
});

describe('state m4 — the ledger read failed, the ledger did not', () => {
  it('keeps the last verified totals on screen and explains, with one retry', async () => {
    const host = await render(ledger({ trail: null, trailError: true }));

    // The four stat cards are still there — they came from the tally, which
    // succeeded. A money-adjacent number must never blank.
    expect(host.querySelectorAll('.xidig-ledger-stat')).toHaveLength(4);
    expect(host.textContent).toContain('Saac wadar ah');
    // …and so is the member table.
    expect(host.querySelector('.xidig-ledger-row')).not.toBeNull();

    const notices = [...host.querySelectorAll('.xidig-system-notice')].map(
      (node) => node.textContent ?? '',
    );
    expect(notices.some((text) => text.includes('diiwaanka laftiisa waxba kama maqna'))).toBe(true);
    expect(host.textContent).toContain('Isku day mar kale');
    expect(host.textContent).toContain('khalad soo-rarid waligiis ma beddelo');
    // The trail is absent (it is what failed) — not faked, not zero-filled.
    expect(host.querySelector('.xidig-trail')).toBeNull();
  });

  it('an empty ledger and a failed read do not render the same', async () => {
    const host = await render(ledger({ trail: [], trailError: false }));
    // No events yet: the trail card is present and simply has no rows.
    expect(host.querySelector('.xidig-trail')).not.toBeNull();
    expect(host.querySelectorAll('.xidig-trail__row')).toHaveLength(0);
    expect(host.textContent).not.toContain('Isku day mar kale');
  });
});

describe('the money card and the weights', () => {
  it('renders the $0 money stat on a dashed card — recorded, never moved', async () => {
    const host = await render(ledger());
    const dashed = host.querySelector('.xidig-ledger-stat--dashed');
    expect(dashed).not.toBeNull();
    expect(dashed!.textContent).toContain('Lacag — weli lama furin');
    expect(dashed!.querySelector('.xidig-ledger-stat__value')?.textContent).toMatch(/0/);
  });

  it('reads the weights off the venture scheme, and says changing them is a member vote', async () => {
    const host = await render(
      ledger({
        weights: {
          weights: { hours: 9, code: 15, design: 10, intro: 25, money: 0 },
          effectiveFrom: '2026-08-01T00:00:00Z',
          decisionId: 'd1',
        },
      }),
    );
    const body = host.textContent ?? '';
    // The voted numbers, not the seeded defaults.
    expect(body).toContain('saac = 9 halbeeg');
    expect(body).toContain('PR la ansixiyay = 15');
    // Reputation carries no weight in that vote.
    expect(body).toContain('xubin kasta hal cod, saamigu codka ma miisaamo');
  });
});

describe('the hours fold', () => {
  it('shows a dash where a hidden member hour would be, and keeps units and share', async () => {
    const host = await render(ledger({ members: [member({ hours: null })] }));
    const hours = host.querySelector('.xidig-ledger-cell--hours .xidig-ledger-cell__value');
    expect(hours?.textContent).toBe('—');
    // Units and share are what the ledger is FOR — they stay.
    expect(host.querySelector('.xidig-ledger-row__units')?.textContent).toContain('halbeeg');
    expect(host.querySelector('.xidig-ledger-row__share')?.textContent).toMatch(/\d/);
  });

  it('dashes the whole per-type breakdown when hours are withheld — and cuts no column', async () => {
    // The fold takes the counts with it: a count plus its PUBLISHED weight plus
    // the member's units solves for the hidden hours, so the read model nulls
    // codeCount/designCount/introCount/moneyCents alongside `hours`.
    const host = await render(ledger({ members: [withheld()] }));

    for (const cell of ['hours', 'code', 'design', 'intro']) {
      const node = host.querySelector(`.xidig-ledger-cell--${cell}`);
      // Ruling 1: the column is still here — it is the VALUE that is withheld.
      expect(node, `the ${cell} column left the document`).not.toBeNull();
      expect(node!.querySelector('.xidig-ledger-cell__value')?.textContent).toBe('—');
      // …and it still carries its own label, so both layouts read the same.
      expect(node!.querySelector('.xidig-ledger-cell__label')?.textContent).toBeTruthy();
    }
    expect(host.querySelector('.xidig-ledger-row__units')?.textContent).toContain('halbeeg');
    expect(host.querySelector('.xidig-ledger-row__share')?.textContent).toMatch(/\d/);
  });
});

describe('a reversal names the type it corrects', () => {
  it('reads a reversed introduction as an introduction, never as hours', async () => {
    const host = await render(
      ledger({
        trail: [
          event({
            type: 'intro',
            isReversal: true,
            reversesEventId: 'e0',
            quantity: -1,
            note: 'macmiilkii waa laga noqday',
            attestationCount: 0,
          }),
        ],
      }),
    );

    // The sentence itself — not the row, whose relative time says "saacadood".
    const said = host.querySelector('.xidig-trail__row--reversal .xidig-trail__text')?.textContent;
    expect(said).toContain('Celin: Cali');
    expect(said).toContain('xiriir keenay ganacsi');
    expect(said).toContain('macmiilkii waa laga noqday');
    // The old single sentence described every correction as hours.
    expect(said).not.toContain('saac');
  });

  it('reads a reversed money entry as an amount, not as a count of hours', async () => {
    const host = await render(
      ledger({
        trail: [
          event({
            type: 'money',
            isReversal: true,
            reversesEventId: 'e0',
            // Cents, as the ledger stores money everywhere else.
            quantity: -50_000,
            note: 'laba jeer ayaa la geliyay',
            attestationCount: 0,
          }),
        ],
      }),
    );

    const said = host.querySelector('.xidig-trail__row--reversal .xidig-trail__text')?.textContent;
    expect(said).toContain('Celin: Cali');
    expect(said).toMatch(/500/);
    expect(said).not.toContain('saac');
  });

  it('still reads a reversed hours entry as hours', async () => {
    const host = await render(
      ledger({
        trail: [
          event({
            isReversal: true,
            reversesEventId: 'e0',
            quantity: -2,
            note: 'khalad qoraal',
            attestationCount: 0,
          }),
        ],
      }),
    );

    expect(
      host.querySelector('.xidig-trail__row--reversal .xidig-trail__text')?.textContent,
    ).toContain('2 saac');
  });
});

describe('a code event never invents a PR number', () => {
  it('renders the COUNT when no reference was given — "3 PRs", not "PR #3"', async () => {
    const host = await render(
      ledger({ trail: [event({ type: 'code', quantity: 3, note: null, attestationCount: 0 })] }),
    );

    const said = host.querySelector('.xidig-trail__row .xidig-trail__text')?.textContent;
    expect(said).toContain('3 PR la ansixiyay');
    expect(said).not.toContain('#');
  });

  it('uses the reference the member actually gave, when there is one', async () => {
    const host = await render(
      ledger({ trail: [event({ type: 'code', quantity: 1, note: '412', attestationCount: 0 })] }),
    );

    expect(host.querySelector('.xidig-trail__row .xidig-trail__text')?.textContent).toContain(
      'PR #412',
    );
  });
});

describe('the desktop grid', () => {
  it('gives the per-member events link its own track instead of overprinting the member cell', () => {
    const css = readFileSync(resolve(process.cwd(), 'apps/web/src/app/globals.css'), 'utf8');
    const desktopRow = /\.xidig-ledger-row \{\s*grid-template-areas:([^;]*);/.exec(css);
    expect(desktopRow, 'the desktop row template is gone').not.toBeNull();
    // Two rows: the member line, and the events link beneath it.
    expect(desktopRow![1]).toContain('member hours code design intro units share');
    expect(desktopRow![1]).toContain('events hours code design intro units share');
    // …and the link is placed in that track, not stacked into `member`.
    const link = /a\.xidig-ledger-row__events \{[^}]*grid-area:\s*(\w+)/.exec(
      css.slice(css.indexOf('@media (min-width: 62rem)')),
    );
    expect(link![1]).toBe('events');
  });
});
