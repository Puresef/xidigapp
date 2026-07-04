import { z } from 'zod';

/**
 * Identifier normalisation shared by every auth flow. One canonical account
 * per person (§9) starts with canonical identifiers: e-mails compared
 * lowercase, phones stored E.164 with '+'.
 */

export const E164_REGEX = /^\+[1-9][0-9]{6,14}$/;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email());

/**
 * Accepts human-typed phone numbers ("+252 61 234 5678", "00252-61…") and
 * normalises to strict E.164. Returns null when it can't be a valid number.
 */
export function normalizePhone(input: string): string | null {
  let candidate = input.trim().replace(/[\s\-().]/g, '');
  if (candidate.startsWith('00')) candidate = `+${candidate.slice(2)}`;
  if (!candidate.startsWith('+')) return null;
  return E164_REGEX.test(candidate) ? candidate : null;
}

/** GoTrue stores phones without the '+'; its APIs accept either. */
export function phoneForGoTrue(e164: string): string {
  return e164.replace(/^\+/, '');
}
