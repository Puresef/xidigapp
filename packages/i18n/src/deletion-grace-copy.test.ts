import { describe, expect, it } from 'vitest';

import { en } from './dictionaries/en';
import { so } from './dictionaries/so';

/**
 * The deletion-grace banner (settings.deletionPending) states the model the
 * owner ruled on 11 Sep: the account is scheduled for deletion, it stays
 * active and works as normal until then, the member can cancel to keep it,
 * and after the grace it is deleted.
 *
 * Truthfulness rule (A3b): claim nothing about WHAT is removed — Xidig
 * anonymises rather than erases, and the exact deletion wording is with the
 * legal lane. So this key must not promise erasure ("permanently",
 * "everything", "all your data").
 */

const EN = en['settings.deletionPending'];
const SO = so['settings.deletionPending'];

describe('settings.deletionPending', () => {
  it('keeps the {days} placeholder in both locales', () => {
    expect(EN).toContain('{days}');
    expect(SO).toContain('{days}');
  });

  it('says the account stays active until then, can be cancelled, and is then deleted (EN)', () => {
    expect(EN).toMatch(/scheduled for deletion/i);
    expect(EN).toMatch(/stays active/i);
    expect(EN).toMatch(/cancel/i);
    expect(EN).toMatch(/after that, it is deleted/i);
  });

  it('makes no erasure promise', () => {
    expect(EN).not.toMatch(/permanent|everything|all (of )?your data|erase/i);
    expect(SO).not.toMatch(/si joogto ah|wax walba/i);
  });
});
