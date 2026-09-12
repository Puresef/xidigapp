import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { CandidateVotePaused } from './vote-paused';

/**
 * The candidate vote is PAUSED (Xidig Plus doctrine, owner 12 Sep). Every
 * signed-in member sees the same neutral state:
 *   - "Candidate vote" (never "Supporter vote" or "Xidig Plus vote");
 *   - "paused while eligibility is under review";
 *   - no ballot button, no upgrade prompt, no tally.
 */

function render(locale: 'en' | 'so', hasBallot = false): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: locale,
      children: createElement(CandidateVotePaused, { candidateId: 'c1', hasBallot }),
    }),
  );
}

describe('CandidateVotePaused', () => {
  it('EN: neutral paused state, no ballot, no tally, no paid tier', () => {
    const html = render('en');
    expect(html).toContain('Candidate vote');
    expect(html).toContain('Candidate voting is paused while eligibility is under review.');
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/Supporter|Xidig Plus|upgrade|\bapprove\b.*\breject\b/i);
    expect(html).not.toMatch(/\d+\s*(approve|reject)/i);
  });

  it('SO: provisional heading and paused note, no "Taageere" tier noun', () => {
    const html = render('so');
    expect(html).toContain('Codka Musharaxa');
    expect(html).toContain('waa la hakiyay');
    expect(html).not.toMatch(/Xidig Plus|Taageer(e|aha)\b/);
    expect(html).not.toContain('<button');
  });

  it('a member who voted before the pause can withdraw it (data control) — still no tally', () => {
    const html = render('en', true);
    expect(html).toContain('You voted before the pause.');
    expect(html).toContain('Retract vote');
    expect(html.match(/<button/g)?.length).toBe(1); // withdraw only — no ballot
    expect(html).not.toMatch(/\d+\s*(approve|reject)|total/i);
  });
});
