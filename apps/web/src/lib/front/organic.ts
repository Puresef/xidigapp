import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { FOUNDING_MEMBER_CAP } from '@/lib/auth/constants';

/**
 * Organic-proof invariant helpers (docs/front-door-plan.md §4, extras plan
 * item 7). NON-NEGOTIABLE: every front-door count and projection excludes
 * seeded/AI content — seed data is never laundered into social proof. In-app,
 * seeded content is fine (it wears ContentSourceBadge); on the front door,
 * presenting it as organic proof is fabrication.
 *
 * Every front-door query module MUST route its filters through this module.
 * That is not a convention — `organic.test.ts` source-scans the front-door
 * surfaces (`lib/front`, `components/front`, `app/(front)`, the home and
 * waitlist pages) and FAILS the suite if a query touches `users` or a
 * `source`-carrying table without the organic filter.
 *
 * This module is deliberately pure (no `@/env`, no `next/headers`): callers
 * construct the service client; helpers only shape queries and math, so unit
 * tests can drive them with a fake client.
 */

/** The only content `source` allowed to surface as front-door proof. */
export const ORGANIC_CONTENT_SOURCE = 'member';

/**
 * Tables carrying a `content_source` column (schema 20260704000000). Any
 * front-door query against one of these must apply
 * `applyOrganicContentFilter` — the guard test keys off this list.
 */
export const SOURCE_COLUMN_TABLES = [
  'tags',
  'posts',
  'comments',
  'business_listings',
  'lab_playbooks',
  'labs',
  'lab_updates',
] as const;

/** Minimal structural slice of a PostgREST filter builder. */
interface Filterable<Q> {
  eq(column: string, value: string): Q;
}

/**
 * Restrict a content query to organic (member-authored) rows. Use on every
 * front-door projection over a `SOURCE_COLUMN_TABLES` table.
 */
export function applyOrganicContentFilter<Q extends Filterable<Q>>(query: Q): Q {
  return query.eq('source', ORGANIC_CONTENT_SOURCE);
}

/**
 * The founding-member count query: real people only — AI/system accounts
 * (`users.is_ai`) never occupy a founding spot.
 */
export function foundingMembersCountQuery(admin: SupabaseClient<Database>) {
  return admin.from('users').select('id', { count: 'exact', head: true }).eq('is_ai', false);
}

/**
 * Founding spots remaining out of `FOUNDING_MEMBER_CAP` — the one live number
 * on the front door. Shared by `/waitlist` and the signed-out home so the two
 * counters can never disagree or drop the `is_ai` exclusion independently.
 *
 * Resilience rule (front-door-plan §4): a failed count returns `null` (render
 * no counter), never an error.
 */
export async function countFoundingSpotsLeft(
  admin: SupabaseClient<Database>,
): Promise<number | null> {
  try {
    const { count, error } = await foundingMembersCountQuery(admin);
    if (error) return null;
    return Math.max(0, FOUNDING_MEMBER_CAP - (count ?? 0));
  } catch {
    return null;
  }
}
