import { describe, expect, it } from 'vitest';

import { checkCodsiOffer, checkCodsiTransition } from './codsi';

/**
 * Codsi lifecycle state machine (HANDOFF-P1 "Codsi detail" row):
 * open → in_progress → fulfilled, asker-only transitions, fulfilled terminal.
 * The route wraps this pure check so the rules are testable without a DB.
 */

const ASKER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HELPER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VISITOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function ask(askStatus: 'open' | 'in_progress' | 'fulfilled' | 'answered' | 'closed') {
  return { type: 'ask' as const, author_user_id: ASKER, ask_status: askStatus };
}

describe('checkCodsiTransition', () => {
  it('rejects non-ask posts outright', () => {
    const verdict = checkCodsiTransition(
      { type: 'win', author_user_id: ASKER, ask_status: null },
      ASKER,
      'fulfill',
    );
    expect(verdict).toEqual({ ok: false, code: 'invalid_request', status: 400 });
  });

  it('rejects every non-asker, whatever the action (asker-only transitions)', () => {
    for (const action of ['fulfill', 'reopen', 'accept_offer'] as const) {
      expect(checkCodsiTransition(ask('open'), VISITOR, action)).toEqual({
        ok: false,
        code: 'forbidden',
        status: 403,
      });
      expect(checkCodsiTransition(ask('in_progress'), HELPER, action)).toEqual({
        ok: false,
        code: 'forbidden',
        status: 403,
      });
    }
  });

  it('fulfill works from open (solved without a named helper) and from in_progress', () => {
    expect(checkCodsiTransition(ask('open'), ASKER, 'fulfill')).toEqual({ ok: true });
    expect(checkCodsiTransition(ask('in_progress'), ASKER, 'fulfill')).toEqual({ ok: true });
  });

  it('fulfilled is terminal — no re-fulfill, no reopen, no late acceptance', () => {
    for (const action of ['fulfill', 'reopen', 'accept_offer'] as const) {
      expect(checkCodsiTransition(ask('fulfilled'), ASKER, action)).toEqual({
        ok: false,
        code: 'ask_already_fulfilled',
        status: 409,
      });
    }
  });

  it('reopen only walks back an in-progress ask', () => {
    expect(checkCodsiTransition(ask('in_progress'), ASKER, 'reopen')).toEqual({ ok: true });
    expect(checkCodsiTransition(ask('open'), ASKER, 'reopen')).toEqual({
      ok: false,
      code: 'ask_not_open',
      status: 409,
    });
  });

  it('accepting an offer needs an open ask — revert first to switch helpers', () => {
    expect(checkCodsiTransition(ask('open'), ASKER, 'accept_offer')).toEqual({ ok: true });
    expect(checkCodsiTransition(ask('in_progress'), ASKER, 'accept_offer')).toEqual({
      ok: false,
      code: 'ask_not_open',
      status: 409,
    });
  });

  it('legacy closed asks are read-only', () => {
    for (const action of ['fulfill', 'reopen', 'accept_offer'] as const) {
      expect(checkCodsiTransition(ask('closed'), ASKER, action)).toEqual({
        ok: false,
        code: 'ask_not_open',
        status: 409,
      });
    }
  });
});

describe('checkCodsiOffer', () => {
  it('members can offer while the ask is open or being helped ("Anigana waan caawin karaa")', () => {
    expect(checkCodsiOffer(ask('open'), HELPER)).toEqual({ ok: true });
    expect(checkCodsiOffer(ask('in_progress'), VISITOR)).toEqual({ ok: true });
  });

  it('never on your own ask, never on a non-ask', () => {
    expect(checkCodsiOffer(ask('open'), ASKER)).toEqual({
      ok: false,
      code: 'invalid_request',
      status: 400,
    });
    expect(
      checkCodsiOffer({ type: 'update', author_user_id: ASKER, ask_status: null }, HELPER),
    ).toEqual({ ok: false, code: 'invalid_request', status: 400 });
  });

  it('a resolved or closed ask takes no more offers', () => {
    expect(checkCodsiOffer(ask('fulfilled'), HELPER)).toEqual({
      ok: false,
      code: 'ask_already_fulfilled',
      status: 409,
    });
    expect(checkCodsiOffer(ask('closed'), HELPER)).toEqual({
      ok: false,
      code: 'ask_not_open',
      status: 409,
    });
  });
});
