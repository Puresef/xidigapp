import { describe, expect, it } from 'vitest';

import { en } from './dictionaries/en';
import { so } from './dictionaries/so';

/**
 * Promises the product cannot keep must not appear in member-facing copy.
 *
 * Nothing else in the repo can catch this. The i18n coverage gate compares
 * `{placeholder}` tokens, so a hardcoded numeral like "48 hours" is invisible
 * to it, and an EN rewrite that leaves the Somali promise standing passes CI
 * silently. These are the absence tests the truthfulness pass installs so the
 * removed promises cannot drift back in.
 *
 * Each block states the system fact that makes the old wording false, so a
 * future contributor who BUILDS the missing capability knows exactly which
 * assertion to retire.
 */

const memberFacingModerationKeys = [
  'messages.reportSubmitted',
  'messages.appealSubmitted',
  'settings.appealIntro',
  'error.appealAlreadySubmitted',
] as const;

describe('moderation and appeal copy makes no timing promise', () => {
  /*
   * System fact: Xidig has no staffed rota, no escalation path, and nothing
   * that acts on an overdue report — the queue targets (24h/72h) drive one
   * operator badge and are member-invisible. "We review all reports within 48
   * hours" was a guarantee nothing could keep.
   */
  const TIMING =
    /\b(\d+|one|two|three|hal|laba|saddex)[\s-]*(hour|hours|saac|saacad|saacadood|day|days|maalin|maalmood|minute|minutes|daqiiqad)\b/i;

  it.each(memberFacingModerationKeys)('EN %s promises no response time', (key) => {
    expect(en[key]).not.toMatch(TIMING);
  });

  it.each(memberFacingModerationKeys)('SO %s promises no response time', (key) => {
    expect(so[key]).not.toMatch(TIMING);
  });

  it.each(memberFacingModerationKeys)('%s has a Somali twin (no half-corrected promise)', (key) => {
    // These sit in launch-floor namespaces. An EN-only rewrite would leave a
    // Somali reader looking at a promise the English no longer makes.
    expect(so[key]).toBeTruthy();
  });

  it('claims no "senior moderator" tier, because none exists', () => {
    // Roles are member | mod | admin, and the appeal decision route calls
    // requireRole('mod') — any mod or admin qualifies. There is no senior rung.
    for (const key of memberFacingModerationKeys) {
      expect(String(en[key]).toLowerCase()).not.toContain('senior moderator');
      expect(String(so[key]).toLowerCase()).not.toContain('habmaamule sare');
    }
  });

  it('still says a person reviews, and that an appeal goes to a different moderator', () => {
    // De-advertising must not become silence. Both halves ARE implemented:
    // reports reach a human queue, and recusal is enforced server-side in
    // api/admin/appeals/[id]/route.ts (a reviewer cannot decide an appeal of
    // their own action).
    expect(String(en['messages.reportSubmitted']).toLowerCase()).toContain('a person reviews');
    expect(String(en['settings.appealIntro']).toLowerCase()).toContain('different moderator');
    expect(String(en['messages.appealSubmitted']).toLowerCase()).toContain('not involved');
  });
});

describe('policy-change notices promise only what exists', () => {
  /*
   * System fact: there is no policy/announcement NotificationType and no
   * broadcast email path, so "members are notified before any material change
   * takes effect" was undeliverable — stated on the two legal surfaces that
   * most need to be accurate. Truthful versioning survives: the document is
   * dated and the published copy is the current one.
   *
   * If a notification mechanism is ever built AND an operating process exists
   * to use it, retire these two assertions along with the copy change.
   */
  const noticeKeys = ['marketing.privacyUpdatedNotice', 'marketing.termsUpdatedNotice'] as const;

  it.each(noticeKeys)('EN %s does not promise advance notification', (key) => {
    const value = String(en[key]).toLowerCase();
    expect(value).not.toContain('notified');
    expect(value).not.toContain('before any material change');
  });

  it.each(noticeKeys)('SO %s does not promise advance notification', (key) => {
    expect(String(so[key]).toLowerCase()).not.toContain('loo sheegaa');
  });

  it.each(noticeKeys)('%s keeps its date and points at the published version', (key) => {
    expect(en[key]).toContain('Last updated');
    expect(String(en[key]).toLowerCase()).toContain('published here');
    expect(so[key]).toContain('2026');
  });
});
