import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { applyLocationGranularity } from '@/lib/profile-view';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/me/suggested-follows (Phase 4.5 §3): up to 10 members worth
 * following — shared lanes/skills overlap, same-city boost, verified boost.
 * Excludes self, already-followed members, and anyone who opted out of the
 * directory (user_settings.discoverable_directory = false; absent row =
 * discoverable).
 *
 * Cheap by construction: a handful of bounded index-friendly candidate
 * queries (lanes/skills overlap, same city, recent joiners as fill), scored
 * in TS. No PII beyond the §13 member-visible directory projection.
 */

const CANDIDATE_SELECT =
  'user_id, display_name, handle, bio, location_city, location_country, lanes, skills, verification_status, avatar_path, avatar_blurhash, created_at';

interface CandidateRow {
  user_id: string;
  display_name: string;
  handle: string;
  bio: string | null;
  location_city: string | null;
  location_country: string | null;
  lanes: string[];
  skills: string[];
  verification_status: string;
  avatar_path: string | null;
  avatar_blurhash: string | null;
  created_at: string;
}

const LIMIT = 10;
const POOL_PER_QUERY = 60;

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();
    const admin = getSupabaseAdmin();

    const [{ data: me }, { data: followRows }] = await Promise.all([
      ctx.supabase
        .from('profiles')
        .select('lanes, skills, location_city')
        .eq('user_id', ctx.appUser.id)
        .maybeSingle(),
      ctx.supabase
        .from('follows')
        .select('target_id')
        .eq('follower_user_id', ctx.appUser.id)
        .eq('target_type', 'user')
        .limit(1000),
    ]);

    const myLanes = (me?.lanes ?? []) as string[];
    const mySkills = (me?.skills ?? []) as string[];
    const myCity = (me?.location_city ?? '').trim();
    const excluded = new Set<string>([ctx.appUser.id]);
    for (const row of followRows ?? []) excluded.add(row.target_id);

    // Bounded candidate pool. Overlap filters use array params (no string
    // interpolation); each leg is optional when the member has no such data.
    const base = () =>
      admin
        .from('profiles')
        .select(CANDIDATE_SELECT)
        .neq('user_id', ctx.appUser.id)
        .order('created_at', { ascending: false })
        .limit(POOL_PER_QUERY);

    const legs: PromiseLike<{ data: unknown[] | null }>[] = [];
    if (myLanes.length > 0) legs.push(base().overlaps('lanes', myLanes));
    if (mySkills.length > 0) legs.push(base().overlaps('skills', mySkills));
    if (myCity) legs.push(base().ilike('location_city', myCity));
    legs.push(base()); // recent joiners — fill so new networks still see people

    const results = await Promise.all(legs);
    const pool = new Map<string, CandidateRow>();
    for (const result of results) {
      for (const raw of result.data ?? []) {
        const row = raw as CandidateRow;
        if (!excluded.has(row.user_id) && !pool.has(row.user_id)) pool.set(row.user_id, row);
      }
    }
    if (pool.size === 0) return apiOk({ suggestions: [] });

    // One settings read covers both concerns: directory opt-outs (absent row =
    // discoverable) and each survivor's location_granularity (absent = 'city').
    const ids = [...pool.keys()];
    const { data: settingsRows } = await admin
      .from('user_settings')
      .select('user_id, discoverable_directory, location_granularity')
      .in('user_id', ids);
    const granularities = new Map<string, string>();
    for (const row of settingsRows ?? []) {
      if (row.discoverable_directory === false) pool.delete(row.user_id);
      else granularities.set(row.user_id, row.location_granularity);
    }

    const laneSet = new Set(myLanes);
    const skillSet = new Set(mySkills);
    const cityFold = myCity.toLowerCase();

    const scored = [...pool.values()].map((row) => {
      const sharedLanes = row.lanes.filter((lane) => laneSet.has(lane));
      const sharedSkills = row.skills.filter((skill) => skillSet.has(skill));
      const sameCity = Boolean(cityFold) && (row.location_city ?? '').toLowerCase() === cityFold;
      // "Verified" = a real §11 tier (community or identity). `pending` is
      // awaiting review, not yet verified — mirror lib/dm/service.ts.
      const verified =
        row.verification_status === 'community_verified' ||
        row.verification_status === 'identity_verified';
      const score =
        sharedLanes.length * 3 +
        Math.min(sharedSkills.length, 5) * 2 +
        (sameCity ? 4 : 0) +
        (verified ? 2 : 0);
      return { row, score, sharedLanes, sharedSkills, sameCity };
    });

    scored.sort(
      (a, b) => b.score - a.score || b.row.created_at.localeCompare(a.row.created_at),
    );

    const suggestions = scored.slice(0, LIMIT).map(({ row, sharedLanes, sameCity }) => {
      // Round the displayed city/country to the member's granularity (scoring
      // above used the real values; only the output is folded). same_city
      // stays truthful as a "why suggested" signal without revealing the city.
      const loc = applyLocationGranularity(
        { location_city: row.location_city, location_country: row.location_country },
        granularities.get(row.user_id) ?? 'city',
      );
      return {
        user_id: row.user_id,
        display_name: row.display_name,
        handle: row.handle,
        bio: row.bio,
        location_city: loc.location_city,
        location_country: loc.location_country,
        lanes: row.lanes,
        verification_status: row.verification_status,
        avatar_thumb_url: row.avatar_path
          ? publicMediaUrl(derivedThumbPath(row.avatar_path))
          : null,
        avatar_blurhash: row.avatar_blurhash,
        shared_lanes: sharedLanes,
        same_city: sameCity,
      };
    });

    return apiOk({ suggestions });
  } catch (error) {
    return handleApiError(error);
  }
}
