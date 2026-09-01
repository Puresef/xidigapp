import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

/**
 * Server-side event slug allocation: pretty, shareable, collision-safe.
 * Members never pick slugs (unlike Labs) — hosts type a title, we mint the
 * permalink. Bare slug first, then numbered suffixes, then a random tail so
 * the insert can never spin forever.
 */

const SLUG_MAX = 80;

/**
 * Slugs shadowed by next.config.ts permanent redirects (the OLD site's four
 * fabricated /events/* marketing paths → /waitlist). Config redirects run
 * BEFORE filesystem routing, so a real event minted onto one of these slugs
 * would 308 to the waitlist — page, share links and .ics all unreachable, and
 * permanent redirects cache indefinitely in browsers. Treated as taken here
 * (the -2 suffix mints instead), which keeps the old links' equity without
 * ever shadowing a real event. Retire an entry only together with its
 * redirect line in next.config.ts.
 */
export const RESERVED_EVENT_SLUGS: ReadonlySet<string> = new Set([
  'future-of-somali-energy',
  'early-members-connect-london',
  'mogadishu-launch-party',
  'agritech-summit-minneapolis',
]);

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
    if (RESERVED_EVENT_SLUGS.has(candidate)) continue; // redirect-shadowed
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
