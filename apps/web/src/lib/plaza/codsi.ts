import type { Enums } from '@xidig/db';

/**
 * Codsi (Ask) lifecycle rules — HANDOFF-P1 "Codsi detail" row.
 *
 * open → in_progress → fulfilled. The asker is the only member who moves the
 * lifecycle ("Adiga kaliya ayaa beddeli kara heerka codsiga"); fulfilled is
 * terminal; in_progress is entered ONLY by accepting a concrete offer (the
 * helper strip is a claim about a person, never an anonymous state); reopen
 * walks an in-progress ask back and clears the helper seat.
 *
 * Pure verdicts so the state machine is unit-testable; the API route owns
 * loading the row and executing the mutation through the service role
 * (posts have no client write grants — RLS enforces "API-only" wholesale).
 */

export type CodsiLifecycleAction = 'fulfill' | 'reopen' | 'accept_offer';

export interface CodsiPostShape {
  type: Enums<'post_type'>;
  author_user_id: string;
  ask_status: Enums<'ask_status'> | null;
}

export type CodsiVerdict =
  | { ok: true }
  | {
      ok: false;
      code: 'invalid_request' | 'forbidden' | 'ask_not_open' | 'ask_already_fulfilled';
      status: 400 | 403 | 409;
    };

const OK: CodsiVerdict = { ok: true };

function refuse(code: 'invalid_request' | 'forbidden' | 'ask_not_open' | 'ask_already_fulfilled'): CodsiVerdict {
  const status = code === 'invalid_request' ? 400 : code === 'forbidden' ? 403 : 409;
  return { ok: false, code, status };
}

export function checkCodsiTransition(
  post: CodsiPostShape,
  viewerId: string,
  action: CodsiLifecycleAction,
): CodsiVerdict {
  if (post.type !== 'ask' || post.ask_status === null) return refuse('invalid_request');
  if (post.author_user_id !== viewerId) return refuse('forbidden');
  if (post.ask_status === 'fulfilled') return refuse('ask_already_fulfilled');

  switch (action) {
    case 'fulfill':
      // From open (solved without a named helper) or in_progress (helper
      // takes the §14 credit). Legacy answered/closed rows stay read-only.
      return post.ask_status === 'open' || post.ask_status === 'in_progress'
        ? OK
        : refuse('ask_not_open');
    case 'reopen':
      return post.ask_status === 'in_progress' ? OK : refuse('ask_not_open');
    case 'accept_offer':
      // One helper at a time: switching means reopen first, then accept.
      return post.ask_status === 'open' ? OK : refuse('ask_not_open');
  }
}

/** Whole days between two stamps, floored at 1 — "8 maalmood ka dib" is a
 *  story beat, so a same-day fulfilment reads as one day, never zero. */
export function askDurationDays(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms)) return 1;
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** "Waan caawin karaa" — anyone but the asker, while there is still helping to do. */
export function checkCodsiOffer(post: CodsiPostShape, viewerId: string): CodsiVerdict {
  if (post.type !== 'ask' || post.ask_status === null) return refuse('invalid_request');
  if (post.author_user_id === viewerId) return refuse('invalid_request');
  if (post.ask_status === 'fulfilled') return refuse('ask_already_fulfilled');
  return post.ask_status === 'open' || post.ask_status === 'in_progress'
    ? OK
    : refuse('ask_not_open');
}
