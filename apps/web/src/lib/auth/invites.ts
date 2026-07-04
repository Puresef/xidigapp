import { randomInt } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@xidig/db';

/**
 * Invite codes (§20: invite system — codes + tracked referrals).
 * Crockford-style alphabet: no I/L/O/U/0/1, so codes survive handwriting and
 * WhatsApp forwards. Format: XIDIG-XXXX-XXXX (~41 bits of entropy — plenty
 * for rate-limited, single-use codes).
 */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

function randomBlock(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export function generateInviteCode(): string {
  return `XIDIG-${randomBlock(4)}-${randomBlock(4)}`;
}

/** Uppercase + strip spacing/dash variance before lookup. */
export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export type InviteValidation =
  | { ok: true; invite: Tables<'invites'> }
  | { ok: false; code: 'invite_invalid' | 'invite_used' };

/** Service-role lookup: invite codes are secrets, never queried client-side. */
export async function validateInviteCode(
  admin: SupabaseClient<Database>,
  rawCode: string,
): Promise<InviteValidation> {
  const code = normalizeInviteCode(rawCode);
  if (!/^XIDIG-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
    return { ok: false, code: 'invite_invalid' };
  }

  const { data: invite } = await admin.from('invites').select('*').eq('code', code).maybeSingle();

  if (!invite) return { ok: false, code: 'invite_invalid' };
  if (invite.revoked_at) return { ok: false, code: 'invite_invalid' };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, code: 'invite_invalid' };
  }
  if (invite.redeemed_by_user_id) return { ok: false, code: 'invite_used' };

  return { ok: true, invite };
}
