import { describe, expect, it } from 'vitest';

import { en } from './dictionaries/en';
import { so } from './dictionaries/so';

/**
 * CANDIDATE WORDING — NOT APPROVED FOR MERGE OR DEPLOYMENT.
 *
 * The account-deletion copy this file guards is drafted for legal review. It
 * is deliberately shaped so that it is true BOTH of the system as it stands
 * today AND of the system after the deletion process is corrected, because
 * the process is currently incomplete (the profile scrub covers 12 of 27
 * columns, and several public projections do not gate on account status).
 *
 * The design rule that produced it, and that these tests enforce:
 *
 *   Say what is KEPT. Claim nothing about what is REMOVED.
 *
 * Xidig implements anonymise-not-erase: no account row is ever hard-deleted,
 * every write in the deletion path targets two tables, and content the member
 * posted survives verbatim. So "everything is permanently removed" and "your
 * personal data is removed rather than archived" were not shading — they were
 * the opposite of what the code does, said on the two surfaces a member reads
 * at the moment they exercise a deletion right.
 *
 * These are absence tests plus a positive floor. They do not assert that
 * deletion works; they assert that the copy does not claim more than the
 * evidence supports. Retire an assertion only when the corresponding
 * capability is built and verified — not when the wording is reworded.
 */

const deletionKeys = [
  'settings.accountStatusBody',
  'settings.accountStatusHelp',
  'settings.requestDeletionConfirm',
  'marketing.privacyRetentionBody',
  'marketing.termsContentBody',
] as const;

describe('deletion copy claims no erasure', () => {
  // Verified behaviour: anonymiseUser writes users (status/email/phone/
  // anonymised_at) and profiles (12 of 27 columns) and nothing else in the
  // system. Posts, comments, DMs, listings, events, media rows and the stored
  // objects themselves all survive.
  const ABSOLUTE_ERASURE =
    /(permanently removed|everything is (permanently )?removed|removed rather than archived|all your (personal )?data is (removed|deleted|erased)|si joogto ah ayaa loo tirtiraa|wax walba si joogto ah loo tirtirin|waa la saaraa halkii la kaydin lahaa)/i;

  it.each(deletionKeys)('EN %s makes no absolute erasure promise', (key) => {
    expect(en[key]).not.toMatch(ABSOLUTE_ERASURE);
  });

  it.each(deletionKeys)('SO %s makes no absolute erasure promise', (key) => {
    expect(so[key]).not.toMatch(ABSOLUTE_ERASURE);
  });

  it('invents no retention duration', () => {
    // "copies we must retain briefly" quantified a period nobody had set.
    // Backup and restore behaviour is not established anywhere in this repo,
    // and the retention schedule is still an open owner/legal decision, so no
    // adjective may stand in for one.
    for (const key of deletionKeys) {
      expect(String(en[key])).not.toMatch(/\bbriefly\b/i);
      expect(String(en[key])).not.toMatch(/for as long as that purpose lasts/i);
      expect(String(so[key])).not.toMatch(/si gaaban u hayno/i);
    }
  });
});

describe('deletion copy states what is kept', () => {
  it('tells the member their content is not deleted with the account', () => {
    // The single most consequential fact a member needs before deciding, and
    // the one the previous copy denied outright.
    expect(String(en['settings.accountStatusHelp'])).toContain('is not deleted with it');
    expect(String(en['settings.requestDeletionConfirm'])).toContain('stays on Xidig');
    expect(String(en['marketing.privacyRetentionBody'])).toContain(
      'is not deleted with the account',
    );
  });

  it('says records exist that cannot be altered once written', () => {
    // audit_logs, mod_actions, report_snapshots and work_events carry
    // forbid_mutation triggers. A member cannot have those removed on request,
    // so the privacy copy must not imply otherwise.
    expect(String(en['marketing.privacyRetentionBody']).toLowerCase()).toContain(
      'cannot be altered once written',
    );
  });

  it('admits the retention schedule is unfinished rather than implying one exists', () => {
    expect(String(en['marketing.privacyRetentionBody']).toLowerCase()).toContain(
      'have not finished setting a retention period',
    );
  });

  it('does not claim closing the account removes posted content in the licence terms', () => {
    expect(String(en['marketing.termsContentBody'])).toContain(
      'does not by itself remove what you posted',
    );
  });

  it('keeps the irreversibility statement, which IS verified', () => {
    // There is no restore path once the grace sweep runs — that part of the
    // old copy was true and survives, separated from the erasure claim it was
    // bundled with.
    expect(String(en['settings.accountStatusBody']).toLowerCase()).toContain('cannot be undone');
    expect(String(en['settings.accountStatusHelp']).toLowerCase()).toContain('cannot be reopened');
  });
});
