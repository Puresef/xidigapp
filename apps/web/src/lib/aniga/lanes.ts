import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';
import type { Locale } from '@xidig/i18n';

import { LANES } from '@/lib/lanes';

/**
 * The lanes catalog, localized once for every surface that shows a lane.
 *
 * The DB lookup table (migration 20260718100000) is the runtime source so ops
 * can add a sector without a deploy; `LANES` is the fallback so an empty or
 * failed fetch degrades to the shipped set rather than to a blank picker.
 *
 * This lives here rather than inline in the profile editor because there are
 * now two readers — the editor's picker and the Aniga owner facts card — and a
 * second copy of the query is a second place a label can drift from the seed.
 */

export interface LaneOption {
  slug: string;
  label: string;
}

export async function loadLaneCatalog(
  client: SupabaseClient<Database>,
  locale: Locale,
): Promise<LaneOption[]> {
  const { data } = await client
    .from('lanes')
    .select('slug, name_en, name_so')
    .eq('is_active', true)
    .order('position');
  if (!data || data.length === 0) {
    // Slug-as-label: ugly, but it is the member's own taxonomy token and it
    // still filters correctly. A blank option cannot be picked at all.
    return LANES.map((slug) => ({ slug, label: slug }));
  }
  return data.map((row) => ({
    slug: row.slug,
    label: locale === 'so' ? row.name_so : row.name_en,
  }));
}

/**
 * Label the slugs a member has stored, in the order they stored them.
 *
 * A slug the catalog no longer carries — deactivated, or renamed under it —
 * renders as itself. Dropping it would silently delete a value the member
 * entered from the one screen whose whole job is to show them what they stored.
 */
export function resolveLaneLabels(
  catalog: readonly LaneOption[],
  slugs: readonly string[],
): LaneOption[] {
  const labelBySlug = new Map(catalog.map((lane) => [lane.slug, lane.label]));
  return slugs.map((slug) => ({ slug, label: labelBySlug.get(slug) ?? slug }));
}
