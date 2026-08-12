import { prerender } from 'react-dom/static';
import { describe, expect, it, vi } from 'vitest';

import { createTranslator } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import type { AnigaSkill } from '@/lib/aniga/view';

import { SkillsModule, type SkillsModuleProps } from './skills-module';

/**
 * Xirfadaha acceptance (spec §3.2, §14, A8). What the assertions defend:
 *
 *  - the count is **distinct endorsers**, so it stays on the visitor view. A1
 *    bans popularity counters; suppressing attested evidence to satisfy it
 *    would delete the only number this profile is built to show;
 *  - depth reads as SIZE across three steps and nothing else — no rank digit,
 *    no ladder word, no progress. Members are never ordered against members;
 *  - "×12" is decoration for AT; the sentence behind it is the real name.
 */

vi.mock('@/lib/locale', () => ({
  getLocale: async () => 'so',
  getT: async () => createTranslator('so'),
}));

async function render(props: SkillsModuleProps): Promise<string> {
  const { prelude } = await prerender(
    <LocaleProvider initialLocale="so">
      <SkillsModule {...props} />
    </LocaleProvider>,
  );
  return await new Response(prelude).text();
}

function skill(
  name: string,
  endorsers: number,
  rank: number,
  endorsedByViewer = false,
): AnigaSkill {
  return { skill: name, endorsers, rank, endorsedByViewer };
}

/** One ramp step per rank band, in DOM order. */
function steps(html: string): string[] {
  return [...html.matchAll(/xidig-askills__chip xidig-askills__chip--(\w+)/g)].map((m) => m[1]!);
}

const SKILLS = [
  skill('Canshuuraha ganacsiga', 23, 1),
  skill('Diiwaangelin shirkadeed', 17, 2),
  skill('Qorshe ganacsi', 11, 3),
  skill('VAT / HMRC', 8, 4),
  skill('Tababar', 5, 5),
];

const BASE = { addHref: '/profile#xirfado' } satisfies Partial<SkillsModuleProps>;

describe('depth ramp (§3.2)', () => {
  it('sizes by rank across exactly three steps, in the given order', async () => {
    const html = await render({ ...BASE, viewer: 'member', skills: SKILLS });
    expect(steps(html)).toEqual(['lead', 'mid', 'mid', 'tail', 'tail']);
  });

  it('renders the array as given — the module never reorders by depth', async () => {
    // rank is a size input, not a sort key: a view layer that hands over an
    // alphabetical list must get an alphabetical list back.
    const html = await render({
      ...BASE,
      viewer: 'member',
      skills: [skill('Zaad', 4, 3), skill('Alif', 40, 1)],
    });
    expect(html.indexOf('Zaad')).toBeLessThan(html.indexOf('Alif'));
    expect(steps(html)).toEqual(['mid', 'lead']);
  });

  it('carries no rank, ladder or progress vocabulary at all (A11 grammar)', async () => {
    const html = await render({ ...BASE, viewer: 'member', skills: SKILLS });
    expect(html.toLowerCase()).not.toMatch(/rank|level|progress|top|#1|bronze|silver|gold/);
    // Depth is not a trust moment — orange stays reserved.
    expect(html).not.toContain('xidig-tag--trust');
    expect(html).not.toContain('trust');
  });
});

describe('the count is attested evidence, not popularity (A8)', () => {
  it('shows ×N to VISITORS and names it properly for assistive tech', async () => {
    const html = await render({ ...BASE, viewer: 'anon', skills: [skill('Stripe / API', 12, 1)] });

    // The glyph is decoration; the sentence beside it is the accessible truth.
    expect(html).toMatch(/<b class="xidig-askills__count" aria-hidden="true">×12<\/b>/);
    expect(html).toContain('12 qof ayaa marag-furay');
  });

  it('tells the owner what the number is and is not', async () => {
    const html = await render({ ...BASE, viewer: 'owner', skills: SKILLS });
    expect(html).toContain('waa caddayn, ma aha caan-nimo');
    expect(html).toContain('Xajmiga ayaa qoto-dheeraanta muujiya');
  });
});

describe('header meta', () => {
  it('tells the owner whose endorsements these are', async () => {
    const html = await render({ ...BASE, viewer: 'owner', skills: SKILLS });
    expect(html).toContain('Marag-furka asxaabta');
    expect(html).not.toContain('adiguna waad marag-furi kartaa');
  });

  it('tells a visitor they can add to them', async () => {
    const html = await render({ ...BASE, viewer: 'member', skills: SKILLS });
    expect(html).toContain('Marag-furka asxaabta · adiguna waad marag-furi kartaa');
  });
});

describe('actions', () => {
  const ENDORSE = <button type="button">{'MARAG-FUR'}</button>;

  it('gives the owner the add link and no endorse control', async () => {
    const html = await render({
      ...BASE,
      viewer: 'owner',
      skills: SKILLS,
      endorseAction: ENDORSE,
    });
    expect(html).toContain('href="/profile#xirfado"');
    expect(html).toContain('Ku dar');
    expect(html).not.toContain('MARAG-FUR');
  });

  it('gives a visitor the endorse control and no add link', async () => {
    const html = await render({
      ...BASE,
      viewer: 'member',
      skills: SKILLS,
      endorseAction: ENDORSE,
    });
    expect(html).toContain('MARAG-FUR');
    expect(html).not.toContain('href="/profile#xirfado"');
  });

  it('drops the endorse control once the viewer has endorsed everything', async () => {
    // Otherwise the action leads to a picker with nothing left in it.
    const html = await render({
      ...BASE,
      viewer: 'member',
      skills: [skill('Stripe / API', 12, 1, true), skill('TypeScript', 9, 2, true)],
      endorseAction: ENDORSE,
    });
    expect(html).not.toContain('MARAG-FUR');
    // The chips still say so, quietly and only where it is asked for.
    expect(html).toContain('Waad marag-furtay');
    expect(html).toContain('xidig-askills__chip--endorsed');
  });
});

describe('empty and chrome', () => {
  it('renders nothing for a visitor when nothing has been endorsed', async () => {
    for (const viewer of ['member', 'anon'] as const) {
      expect(await render({ ...BASE, viewer, skills: [] }), viewer).toBe('');
    }
  });

  it('keeps the card for the owner so the skill can be added', async () => {
    const html = await render({ ...BASE, viewer: 'owner', skills: [] });
    expect(html).toContain('data-module="skills"');
    expect(html).toContain('href="/profile#xirfado"');
    // No zeroed counter stands in for the absent chips (state a2).
    expect(html).not.toContain('×0');
  });

  it('leaves no owner chrome in the visitor DOM', async () => {
    const html = await render({ ...BASE, viewer: 'member', skills: SKILLS });
    expect(html).not.toContain('xidig-amodule__grip');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('Tirada waa dadka kuu marag-furay');
  });
});
