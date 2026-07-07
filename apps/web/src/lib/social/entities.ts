import type { AuthContext } from '@/lib/auth/guards';

/**
 * Bookmark / mute target validation (Phase 4.5 §1f). Both tables reference
 * polymorphic (entity_type, entity_id) pairs with no FK, so the API layer is
 * the referential-integrity gate: a PUT must prove the entity exists AND is
 * readable by the caller — under the CALLER's RLS, so nobody can probe
 * private Spaces or hidden posts by bookmarking ids.
 */

export const BOOKMARK_ENTITY_TYPES = ['post', 'listing', 'lab', 'candidate'] as const;
export type BookmarkEntityType = (typeof BOOKMARK_ENTITY_TYPES)[number];

export const MUTE_ENTITY_TYPES = ['user', 'tag', 'lab'] as const;
export type MuteEntityType = (typeof MUTE_ENTITY_TYPES)[number];

/** True when the entity exists and the caller's RLS can see it. */
export async function entityReadable(
  ctx: AuthContext,
  entityType: BookmarkEntityType | MuteEntityType,
  entityId: string,
): Promise<boolean> {
  switch (entityType) {
    case 'post': {
      const { data, error } = await ctx.supabase
        .from('posts')
        .select('id')
        .eq('id', entityId)
        .maybeSingle();
      if (error) throw new Error(`post readability check failed: ${error.message}`);
      return Boolean(data);
    }
    case 'listing': {
      const { data, error } = await ctx.supabase
        .from('business_listings')
        .select('id')
        .eq('id', entityId)
        .maybeSingle();
      if (error) throw new Error(`listing readability check failed: ${error.message}`);
      return Boolean(data);
    }
    case 'lab': {
      const { data, error } = await ctx.supabase
        .from('labs')
        .select('id')
        .eq('id', entityId)
        .maybeSingle();
      if (error) throw new Error(`lab readability check failed: ${error.message}`);
      return Boolean(data);
    }
    case 'candidate': {
      const { data, error } = await ctx.supabase
        .from('venture_candidates')
        .select('id')
        .eq('id', entityId)
        .maybeSingle();
      if (error) throw new Error(`candidate readability check failed: ${error.message}`);
      return Boolean(data);
    }
    case 'user': {
      const { data, error } = await ctx.supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', entityId)
        .maybeSingle();
      if (error) throw new Error(`profile readability check failed: ${error.message}`);
      return Boolean(data);
    }
    case 'tag': {
      const { data, error } = await ctx.supabase
        .from('tags')
        .select('id')
        .eq('id', entityId)
        .maybeSingle();
      if (error) throw new Error(`tag readability check failed: ${error.message}`);
      return Boolean(data);
    }
  }
}
