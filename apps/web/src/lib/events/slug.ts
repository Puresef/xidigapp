import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

/**
 * Server-side event slug allocation: pretty, shareable, collision-safe.
 * Members never pick slugs (unlike Labs) — hosts type a title, we mint the
 * permalink. Bare slug first, then numbered suffixes, then a random tail so
 * the insert can never spin forever.
 */

const SLUG_MAX = 80;

export function slugifyEventTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return base || 'event';
}

export async function allocateEventSlug(
  admin: SupabaseClient<Database>,
  title: string,
): Promise<string> {
  const base = slugifyEventTitle(title).slice(0, SLUG_MAX - 8);
  const candidates = [base, `${base}-2`, `${base}-3`, `${base}-4`];
  for (const candidate of candidates) {
    const { data, error } = await admin
      .from('events')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (error) throw new Error(`slug check failed: ${error.message}`);
    if (!data) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
