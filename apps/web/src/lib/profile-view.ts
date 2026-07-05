import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Shared profile-display fetch (§13 permalinks, §14 badges, §28 public share
 * pages). One code path feeds three consumers: GET /api/profiles/[handle]
 * (mobile parity), the signed-in /u/[handle] page, and the login-free public
 * variant of the same page.
 *
 * Column rules (see 20260704210000_phase1_api_surface.sql header):
 * - Signed-in reads go through the caller's RLS client with the granted
 *   column whitelist (a `select *` on profiles fails on revoked columns).
 * - Anonymous reads are service-role with an explicitly NARROWER projection:
 *   no contact_options, no links, no lat/lng/timezone. The member picked
 *   their contact channels for members (§13); logged-out visitors get a
 *   sign-in CTA instead — the share page is a top-of-funnel entry (§28).
 * - Counts always use the service role: follows/vouches RLS is party-scoped,
 *   but aggregate counts carry no PII.
 */

/** Columns any signed-in member may read (matches the RLS column grant). */
export const PROFILE_MEMBER_COLUMNS =
  'user_id, display_name, handle, bio, location_city, location_country, latitude, longitude, timezone, skills, lanes, links, contact_options, verification_status, created_at';

/** Narrower public projection for logged-out share pages (§28). */
export const PROFILE_PUBLIC_COLUMNS =
  'user_id, display_name, handle, bio, location_city, location_country, skills, lanes, verification_status, created_at';

export interface ProfileBadge {
  badge_id: string;
  awarded_at: string;
  context: string | null;
  badge_definitions: { slug: string; name: string; description: string | null } | null;
}

export interface ProfileCounts {
  followers: number;
  vouches: number;
}

interface ProfileViewRow {
  user_id: string;
  display_name: string;
  handle: string;
  bio: string | null;
  location_city: string | null;
  location_country: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  skills: string[];
  lanes: string[];
  links?: unknown;
  contact_options?: unknown;
  verification_status: string;
  created_at: string;
}

export interface ProfileView {
  profile: ProfileViewRow;
  badges: ProfileBadge[];
  counts: ProfileCounts;
}

async function loadCounts(userId: string): Promise<ProfileCounts> {
  const admin = getSupabaseAdmin();
  const [{ count: followers }, { count: vouches }] = await Promise.all([
    admin
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', 'user')
      .eq('target_id', userId),
    admin
      .from('vouches')
      .select('*', { count: 'exact', head: true })
      .eq('vouchee_user_id', userId),
  ]);
  return { followers: followers ?? 0, vouches: vouches ?? 0 };
}

/**
 * Signed-in view: profile + badges under the caller's RLS, counts via
 * service role. Returns null when the handle doesn't resolve.
 */
export async function getMemberProfileView(
  supabase: SupabaseClient<Database>,
  handle: string,
): Promise<ProfileView | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(PROFILE_MEMBER_COLUMNS)
    .eq('handle', handle)
    .maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  if (!profile) return null;

  const { data: badges } = await supabase
    .from('user_badges')
    .select('badge_id, awarded_at, context, badge_definitions(slug, name, description)')
    .eq('user_id', profile.user_id)
    .is('revoked_at', null)
    .order('awarded_at', { ascending: false });

  return {
    profile: profile as unknown as ProfileViewRow,
    badges: (badges ?? []) as unknown as ProfileBadge[],
    counts: await loadCounts(profile.user_id),
  };
}

/**
 * Login-free view (§28 share pages): service role with the narrow public
 * projection. Badges are public trust signals; active awards only.
 */
export async function getPublicProfileView(handle: string): Promise<ProfileView | null> {
  const admin = getSupabaseAdmin();
  const { data: profile, error } = await admin
    .from('profiles')
    .select(PROFILE_PUBLIC_COLUMNS)
    .eq('handle', handle)
    .maybeSingle();
  if (error) throw new Error(`public profile lookup failed: ${error.message}`);
  if (!profile) return null;

  const { data: badges } = await admin
    .from('user_badges')
    .select('badge_id, awarded_at, context, badge_definitions(slug, name, description)')
    .eq('user_id', profile.user_id)
    .is('revoked_at', null)
    .order('awarded_at', { ascending: false });

  return {
    profile: profile as unknown as ProfileViewRow,
    badges: (badges ?? []) as unknown as ProfileBadge[],
    counts: await loadCounts(profile.user_id),
  };
}
