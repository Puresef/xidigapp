import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { getCategories } from '@/lib/categories';
import { getLocale } from '@/lib/locale';

/**
 * Listing categories (§18/§26). API-first (§22): the Suuq category picker and
 * businesses filter render from here, so the v1.2 mobile client needs no
 * direct DB access. Localized to the caller's locale; member-visible.
 */
export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();
    const locale = await getLocale();
    const categories = await getCategories(ctx.supabase, locale);
    return apiOk({ categories });
  } catch (error) {
    return handleApiError(error);
  }
}
