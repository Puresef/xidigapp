import type { SupabaseClient } from '@supabase/supabase-js';

import type { Locale } from '@xidig/i18n';
import type { Database } from '@xidig/db';

/**
 * Listing categories (§18/§26 — the admin-curated starter set). Shared by the
 * GET /api/categories route (mobile/API-first parity, §22) and the Suuq server
 * pages, so the localized picker is one code path. RLS grants authenticated
 * SELECT on listing_categories, so this runs under any signed-in client.
 */

export interface CategoryOption {
  id: string;
  slug: string;
  name: string;
}

interface CategoryRow {
  id: string;
  slug: string;
  name_en: string;
  name_so: string | null;
  position: number;
  is_active: boolean;
}

export async function getCategories(
  supabase: SupabaseClient<Database>,
  locale: Locale,
): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from('listing_categories')
    .select('id, slug, name_en, name_so, position, is_active')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) throw new Error(`categories read failed: ${error.message}`);

  return ((data ?? []) as CategoryRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: locale === 'so' ? (row.name_so ?? row.name_en) : row.name_en,
  }));
}
