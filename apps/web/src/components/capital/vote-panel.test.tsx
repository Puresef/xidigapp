import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { VotePanel } from './vote-panel';

vi.mock('@/lib/analytics/client', () => ({ trackClient: () => {} }));

/**
 * Owner ruling (12 Sep): the candidate vote is not a paid-tier benefit. The
 * panel is named "Candidate vote" (never "Supporter vote" or "Xidig Plus
 * vote"), and because mechanics still gate it on the paid tier, it states
 * that as a temporary eligibility constraint — not a perk.
 */

function render(locale: 'en' | 'so'): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: locale,
      children: createElement(VotePanel, {
        candidateId: 'c1',
        initialTally: { approve: 2, reject: 1, total: 3 },
        initialVote: null,
      }),
    }),
  );
}

describe('VotePanel naming', () => {
  it('is a "Candidate vote" with the eligibility constraint stated plainly', () => {
    const html = render('en');
    expect(html).toContain('Candidate vote');
    expect(html).toContain('Eligibility is under review. Current access requires Xidig Plus.');
    expect(html).not.toMatch(/Supporter|Xidig Plus vote/);
  });

  it('Somali: provisional heading, no "Taageere" tier noun', () => {
    const html = render('so');
    expect(html).toContain('Codka Musharaxa');
    expect(html).toContain('Xidig Plus');
    expect(html).not.toMatch(/Taageer(e|aha)\b/);
  });
});
