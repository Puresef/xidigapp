import { describe, expect, it } from 'vitest';

import type { DigestCandidates } from './candidates';
import { digestWindow, isoWeekKey } from './period';
import { renderDigestEmail, renderDigestPost } from './render';

/**
 * Weekly digest period keying + rendering (PRD §21). The period key is the
 * idempotency guarantee; the renderer is deterministic + escapes content.
 */

describe('isoWeekKey', () => {
  it('produces a stable YYYY-Www key', () => {
    // 2026-07-09 (Thursday) is ISO week 28 of 2026.
    expect(isoWeekKey(new Date('2026-07-09T12:00:00Z'))).toBe('2026-W28');
    // Format is always zero-padded.
    expect(isoWeekKey(new Date('2026-01-05T00:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('digestWindow spans exactly 7 days ending at now', () => {
    const w = digestWindow(new Date('2026-07-09T00:00:00Z'));
    expect(w.periodKey).toBe('2026-W28');
    expect(w.since).toBe('2026-07-02T00:00:00.000Z');
    expect(w.until).toBe('2026-07-09T00:00:00.000Z');
  });
});

function candidates(overrides: Partial<DigestCandidates> = {}): DigestCandidates {
  return {
    periodKey: '2026-W28',
    window: { since: 's', until: 'u' },
    wins: [],
    openAsks: [],
    newLabs: [],
    newListings: [],
    mentor: null,
    counts: { wins: 0, openAsks: 0, newLabs: 0, newListings: 0 },
    ...overrides,
  };
}

describe('renderDigestPost', () => {
  it('titles by period and notes AI authorship', () => {
    const { title, body } = renderDigestPost(candidates());
    expect(title).toContain('2026-W28');
    expect(body).toContain('AI-assisted');
  });

  it('lists wins when present, and a quiet-week line when empty', () => {
    const withWins = renderDigestPost(
      candidates({ wins: [{ id: 'p1', title: 'First 100 users' }], counts: { wins: 1, openAsks: 0, newLabs: 0, newListings: 0 } }),
    );
    expect(withWins.body).toContain('First 100 users');

    const empty = renderDigestPost(candidates());
    expect(empty.body).toContain('quiet week');
  });

  it('renders the upcoming-events slot (extras item 8) and counts it against the quiet week', () => {
    const withEvent = renderDigestPost(
      candidates({
        upcomingEvents: [
          { slug: 'demo-day', title: 'Demo day', startsAt: '2026-07-18T16:00:00Z' },
        ],
      }),
    );
    expect(withEvent.body).toContain('Upcoming events');
    expect(withEvent.body).toContain('Demo day — 2026-07-18');
    expect(withEvent.body).not.toContain('quiet week');

    // Snapshots stored before the slot existed (no upcomingEvents key) still render.
    const legacy = renderDigestPost(candidates());
    expect(legacy.body).not.toContain('Upcoming events');
  });
});

describe('renderDigestEmail', () => {
  it('shares the post title as the subject and escapes html content', () => {
    const email = renderDigestEmail(
      candidates({ wins: [{ id: 'p1', title: '<script>x</script>' }] }),
      'https://app.xidig.net',
    );
    expect(email.subject).toContain('2026-W28');
    expect(email.html).not.toContain('<script>x</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('always carries the manage-preferences link in text AND html', () => {
    // Trailing slash on APP_URL must not produce a double-slash link.
    const email = renderDigestEmail(candidates(), 'https://app.xidig.net/');
    expect(email.text).toContain('https://app.xidig.net/settings/notifications');
    expect(email.html).toContain('href="https://app.xidig.net/settings/notifications"');
  });
});
