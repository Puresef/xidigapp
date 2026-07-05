/**
 * Somali/English transliteration-tolerant name normalization (§18 fuzzy
 * search, Phase 1 acceptance: Maxamed ↔ Mohamed/Mohammed).
 *
 * This is the LIGHTWEIGHT Phase 1 layer: both the stored value (generated
 * `search_norm` columns, migration 20260705010000) and the query term are
 * folded to a canonical skeleton, then matched by substring. §24's
 * Meilisearch replaces this for ranking/typo-tolerance later; the column and
 * this helper stay useful as the exact-recall baseline.
 *
 * MUST stay byte-for-byte equivalent to `public.xidig_name_norm` in
 * packages/db/supabase/migrations/20260705010000_member_search.sql — the
 * query side (this file) and the stored side (Postgres) fold independently,
 * so any divergence silently breaks matching. Folding rules:
 *   lower → dh→d, kh→k (Somali digraphs) → x→h (Maxamed/Mohamed) →
 *   non-alphanumerics→space → c dropped (ayn: Cali/Ali) → q→k →
 *   vowels e,i,o,u→a (Mohamed/Maxamed first-vowel) → collapse repeated
 *   chars (Mohammed/Mohamed, Khadiija/Khadija) → trim.
 */
export function normalizeSearchName(input: string): string {
  return input
    .toLowerCase()
    .replaceAll('dh', 'd')
    .replaceAll('kh', 'k')
    .replaceAll('x', 'h')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/c/g, ' ')
    .replace(/[eiou]/g, 'a')
    .replace(/q/g, 'k')
    .replace(/(.)\1+/g, '$1')
    .trim();
}
