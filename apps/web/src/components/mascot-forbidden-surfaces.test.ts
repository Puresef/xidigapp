import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The 🦋 interim mascot marker is warm-surface only. This gate locks the
 * FORBIDDEN (cold/sensitive) surfaces mascot-free by construction, so no future
 * edit can slip the mark back onto them via a shared component (docs
 * brand-direction: mascot never on Report/Block/moderation/security/legal/
 * money-critical Maal/fraud-risk surfaces).
 *
 * The marker reaches a surface three ways — a direct <AnimatedMark>, the
 * mark-bearing shared components <LoadingFlap> / <EmptyState>, or the raw 🦋
 * emoji. None may appear in a forbidden file. (SystemNotice's shield/info SVGs
 * are the sanctioned mark-free system voice — it's on the list to stay that way.)
 */

// Repo-relative to this test (apps/web/src/components/).
const FORBIDDEN = [
  // Money-critical Maal / §17 compliance funnel.
  'capital/maalgeli-cta.tsx',
  'capital/attestation-modal.tsx',
  'capital/venture-fund-modal.tsx',
  'capital/review-form.tsx',
  'capital/decision-controls.tsx',
  // Maal venture workspace (F2 §5, frames 7c–7g + m3/m5). The ledger is an
  // agreement between members about who owns what, the capital tab is a
  // refusal to hold anyone's money yet, the board feeds the ledger, and the
  // offline queue holds unsent claims about someone's work. All cold: the
  // system voice speaks on these, with no character attached. m3 dormancy is
  // on the list too — it is one step from a stage change on a money-critical
  // space, and a mascot would make a warning read as a nudge.
  'maal/venture-ledger.tsx',
  'maal/ledger-controls.tsx',
  'maal/venture-capital.tsx',
  'maal/venture-board.tsx',
  'maal/task-actions.tsx',
  'maal/task-create.tsx',
  'maal/contribution-logger.tsx',
  'maal/venture-overview.tsx',
  'maal/visibility-toggles.tsx',
  'maal/application-actions.tsx',
  'maal/seat-request.tsx',
  'maal/dormant-notice.tsx',
  // Report / Block / mute (boundary + safety).
  'report-control.tsx',
  'settings/blocked-list.tsx',
  'social/muted-list.tsx',
  // Moderation / appeals / verification tooling + the system voice.
  'support/appeal-form.tsx',
  'admin/reports-queue.tsx',
  'admin/moderation-queue.tsx',
  'admin/appeals-queue.tsx',
  'admin/verifications-queue.tsx',
  'system-notice.tsx',
  // Account / security / legal-consent.
  'settings/account-settings.tsx',
  'auth/reset-password-form.tsx',
  'consent/consent-banner.tsx',
] as const;

const MARKERS: { needle: string; label: string }[] = [
  { needle: '<AnimatedMark', label: 'direct brand mark' },
  { needle: '<LoadingFlap', label: 'LoadingFlap (mounts the flap mark)' },
  { needle: '<EmptyState', label: 'EmptyState (mounts the static mark)' },
  { needle: '🦋', label: 'raw butterfly emoji' },
];

describe('forbidden surfaces stay mascot-free', () => {
  it.each(FORBIDDEN)('%s renders no mascot marker', (rel) => {
    const src = readFileSync(fileURLToPath(new URL(`./${rel}`, import.meta.url)), 'utf8');
    for (const { needle, label } of MARKERS) {
      expect(
        src.includes(needle),
        `${rel} contains ${label} (${needle}) — the mascot marker is forbidden on this cold/sensitive surface`,
      ).toBe(false);
    }
  });
});
