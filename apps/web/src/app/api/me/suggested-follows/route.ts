import { loadTestAccountIds, postgrestIdList } from '@/lib/account-flags';
import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { findLabsSeekingSkills } from '@/lib/matching/looking-for';
import {
  buildFollowSuggestions,
  type DeclaredFields,
  type PersonCandidate,
} from '@/lib/matching/suggestions';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { applyLocationGranularity } from '@/lib/profile-view';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/me/suggested-follows (extras plan item 4): 3–10 people/Lab follow
 * suggestions from DECLARED fields only — lanes, skills, city, country,
 * open-to chips, and Labs seeking the member's skills. Every suggestion
 * carries machine-readable reasons the UI renders as visible copy ("Shares
 * your fintech lane"); the score is the sum of those reasons' weights and
 * nothing else. No behavioral signals, no follower counts (feedback loops),
 * no filler — sparse declared data means a short (or empty) list.
 *
 * Privacy: AI accounts, quarantined test accounts, non-active accounts,
 * directory opt-outs (user_settings.discoverable_directory=false; absent row
 * = discoverable), already-followed, blocked (either direction), and muted
 * members are all excluded in lib/matching/suggestions.ts. Test accounts are
 * also kept out of the candidate pool itself (so they cannot crowd real
 * members out of the bounded legs), and a Space led by a test account is
 * never suggested. Lab matches ride the member's own RLS session
 * (can_read_lab), so private Labs never leak.
 *
 * Deterministic by construction: bounded candidate legs ordered by
 * (created_at desc, user_id) and pure scoring — the same declared data always
 * returns the same suggestions.
 */

const CANDIDATE_SELECT =
  'user_id, display_name, handle, location_city, location_country, lanes, skills, avatar_path, avatar_blurhash';

interface CandidateRow {
  user_id: string;
  display_name: string;
  handle: string;
  location_city: string | null;
  location_country: string | null;
  lanes: string[];
  skills: string[];
  avatar_path: string | null;
  avatar_blurhash: string | null;
}

interface Candidate extends PersonCandidate {
  row: CandidateRow;
}

const POOL_PER_QUERY = 60;
const OPEN_TO_POOL = 120;

/** hiring↔hire_me complement — the open-to slugs worth pulling candidates for. */
function wantedOpenToSlugs(mine: string[]): string[] {
  const wanted = new Set(mine);
  if (mine.includes('hiring')) wanted.add('hire_me');
  if (mine.includes('hire_me')) wanted.add('hiring');
  return [...wanted];
}

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();
    const admin = getSupabaseAdmin();
    const myId = ctx.appUser.id;

    // The viewer's declared fields + relationship state (own-rows RLS reads).
    const [
      { data: me },
      { data: myOpenToRows },
      { data: followRows },
      { data: muteRows },
      { data: blockedByMe },
      { data: blockedMe },
      testIds,
    ] = await Promise.all([
      ctx.supabase
        .from('profiles')
        .select('lanes, skills, location_city, location_country')
        .eq('user_id', myId)
        .maybeSingle(),
      ctx.supabase.from('profile_open_to').select('open_to_id').eq('user_id', myId),
      ctx.supabase
        .from('follows')
        .select('target_id')
        .eq('follower_user_id', myId)
        .eq('target_type', 'user')
        .limit(1000),
      ctx.supabase.from('mutes').select('entity_type, entity_id').eq('user_id', myId).limit(1000),
      admin.from('user_blocks').select('blocked_user_id').eq('blocker_user_id', myId).limit(1000),
      admin.from('user_blocks').select('blocker_user_id').eq('blocked_user_id', myId).limit(1000),
      // Quarantined test accounts (service role; throws rather than guess).
      loadTestAccountIds(admin),
    ]);
    const testIdSet = new Set(testIds);
    const testIdList = testIds.length > 0 ? postgrestIdList(testIds) : null;

    const declared: DeclaredFields = {
      lanes: (me?.lanes ?? []) as string[],
      skills: (me?.skills ?? []) as string[],
      city: me?.location_city ?? null,
      country: me?.location_country ?? null,
      openTo: (myOpenToRows ?? []).map((row) => row.open_to_id),
    };

    const followedUserIds = new Set((followRows ?? []).map((row) => row.target_id));
    const mutedUserIds = new Set(
      (muteRows ?? []).filter((row) => row.entity_type === 'user').map((row) => row.entity_id),
    );
    const mutedLabIds = new Set(
      (muteRows ?? []).filter((row) => row.entity_type === 'lab').map((row) => row.entity_id),
    );
    const blockedUserIds = new Set<string>([
      ...(blockedByMe ?? []).map((row) => row.blocked_user_id),
      ...(blockedMe ?? []).map((row) => row.blocker_user_id),
    ]);

    // Labs seeking the member's skills — the member's own RLS session, so
    // private Labs are already filtered by can_read_lab. A Space led by a
    // quarantined test account is never suggested (service-role lead read;
    // a match whose lead cannot be confirmed is dropped — fail closed).
    let labMatches = await findLabsSeekingSkills(ctx.supabase, [...declared.skills]);
    if (labMatches.length > 0 && testIdSet.size > 0) {
      const { data: leadRows, error: leadError } = await admin
        .from('labs')
        .select('id, lead_user_id')
        .in(
          'id',
          labMatches.map((match) => match.labId),
        );
      if (leadError) throw new Error(`suggested lab lead lookup failed: ${leadError.message}`);
      const leadByLab = new Map((leadRows ?? []).map((row) => [row.id, row.lead_user_id]));
      labMatches = labMatches.filter((match) => {
        const lead = leadByLab.get(match.labId);
        return lead !== undefined && !testIdSet.has(lead);
      });
    }

    // Bounded, deterministic candidate legs — one per declared field. Each is
    // optional when the member declared nothing for it; there is deliberately
    // NO unconditioned "recent joiners" leg (a candidate with no shared
    // declared field has no reason to show, and filler is banned). Test
    // accounts are excluded in the query so they cannot fill a bounded leg.
    const base = () => {
      const leg = admin
        .from('profiles')
        .select(CANDIDATE_SELECT)
        .neq('user_id', myId)
        .order('created_at', { ascending: false })
        .order('user_id')
        .limit(POOL_PER_QUERY);
      return testIdList ? leg.not('user_id', 'in', testIdList) : leg;
    };

    const legs: PromiseLike<{ data: unknown[] | null }>[] = [];
    if (declared.lanes.length > 0) legs.push(base().overlaps('lanes', [...declared.lanes]));
    if (declared.skills.length > 0) legs.push(base().overlaps('skills', [...declared.skills]));
    if (declared.city?.trim()) legs.push(base().ilike('location_city', declared.city.trim()));
    if (declared.country?.trim())
      legs.push(base().ilike('location_country', declared.country.trim()));

    const results = await Promise.all(legs);
    const pool = new Map<string, CandidateRow>();
    for (const result of results) {
      for (const raw of result.data ?? []) {
        const row = raw as CandidateRow;
        if (!pool.has(row.user_id)) pool.set(row.user_id, row);
      }
    }

    // Open-to leg: members whose chips match (or complement) the viewer's.
    const wantedOpenTo = wantedOpenToSlugs([...declared.openTo]);
    if (wantedOpenTo.length > 0) {
      let openToQuery = admin
        .from('profile_open_to')
        .select('user_id')
        .in('open_to_id', wantedOpenTo)
        .neq('user_id', myId);
      if (testIdList) openToQuery = openToQuery.not('user_id', 'in', testIdList);
      const { data: openToLeg } = await openToQuery.order('user_id').limit(OPEN_TO_POOL);
      const missing = [...new Set((openToLeg ?? []).map((row) => row.user_id))].filter(
        (id) => !pool.has(id) && !testIdSet.has(id),
      );
      if (missing.length > 0) {
        const { data: extra } = await admin
          .from('profiles')
          .select(CANDIDATE_SELECT)
          .in('user_id', missing);
        for (const raw of extra ?? []) {
          const row = raw as CandidateRow;
          if (!pool.has(row.user_id)) pool.set(row.user_id, row);
        }
      }
    }

    if (pool.size === 0 && labMatches.length === 0) {
      return apiOk({ people: [], labs: [] });
    }

    // Hydrate the pool's privacy flags + open-to chips in three bulk reads.
    const ids = [...pool.keys()];
    const [{ data: userRows }, { data: settingsRows }, { data: openToRows }] = await Promise.all([
      ids.length > 0
        ? admin.from('users').select('id, is_ai, is_test, status').in('id', ids)
        : Promise.resolve({ data: [] }),
      ids.length > 0
        ? admin
            .from('user_settings')
            .select('user_id, discoverable_directory, location_granularity')
            .in('user_id', ids)
        : Promise.resolve({ data: [] }),
      ids.length > 0
        ? admin.from('profile_open_to').select('user_id, open_to_id').in('user_id', ids)
        : Promise.resolve({ data: [] }),
    ]);

    const flags = new Map((userRows ?? []).map((row) => [row.id, row]));
    const settings = new Map((settingsRows ?? []).map((row) => [row.user_id, row]));
    const openToByUser = new Map<string, string[]>();
    for (const row of openToRows ?? []) {
      const list = openToByUser.get(row.user_id) ?? [];
      list.push(row.open_to_id);
      openToByUser.set(row.user_id, list);
    }

    const candidates: Candidate[] = [...pool.values()].map((row) => {
      const flag = flags.get(row.user_id);
      const setting = settings.get(row.user_id);
      return {
        row,
        userId: row.user_id,
        lanes: row.lanes,
        skills: row.skills,
        city: row.location_city,
        country: row.location_country,
        openTo: (openToByUser.get(row.user_id) ?? []).sort(),
        isAi: flag?.is_ai ?? true, // unknown account ⇒ fail closed
        isTest: flag?.is_test ?? true, // unknown account ⇒ fail closed
        accountStatus: flag?.status ?? 'suspended',
        discoverable: setting?.discoverable_directory ?? true,
        locationGranularity: setting?.location_granularity ?? 'city',
      };
    });

    const { people, labs } = buildFollowSuggestions(
      declared,
      candidates,
      { viewerId: myId, followedUserIds, blockedUserIds, mutedUserIds },
      labMatches,
      mutedLabIds,
    );

    return apiOk({
      people: people.map(({ candidate, reasons }) => {
        // Fold the DISPLAYED city/country to the member's granularity (reasons
        // above already respected it — a region/hidden member never got a
        // location reason in the first place).
        const loc = applyLocationGranularity(
          {
            location_city: candidate.row.location_city,
            location_country: candidate.row.location_country,
          },
          candidate.locationGranularity,
        );
        return {
          user_id: candidate.userId,
          display_name: candidate.row.display_name,
          handle: candidate.row.handle,
          location_city: loc.location_city,
          location_country: loc.location_country,
          avatar_thumb_url: candidate.row.avatar_path
            ? publicMediaUrl(derivedThumbPath(candidate.row.avatar_path))
            : null,
          avatar_blurhash: candidate.row.avatar_blurhash,
          reasons,
        };
      }),
      labs: labs.map((match) => ({
        lab_id: match.labId,
        slug: match.slug,
        name: match.name,
        short_description: match.shortDescription,
        matched_skills: match.matchedSkills,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
