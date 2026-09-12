import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

import { loadTestAccountIds, postgrestIdList } from '@/lib/account-flags';
import { DORMANCY_DAYS } from '@/lib/labs/constants';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';

/**
 * Labs / Spaces read models. Routes fetch lab rows under the CALLER's RLS (so
 * private/members/public visibility is enforced by the DB, and whatever RLS
 * hides is a plain 404), then hydrate cross-user data (lead profile, member
 * count, tags, skill needs, the viewer's own membership + pin) through the
 * service role. The public SSR projection uses a NARROW column set + the
 * service role (anon has no RLS read) — the build-in-public surface.
 */

// A single string literal (not a concatenation) so the Supabase types can parse
// it into a row shape instead of widening to `string`.
export const LAB_COLUMNS =
  'id, name, slug, space_mode, source, short_description, problem_statement, hypothesis, sprint_length_weeks, sprint_deadline, success_definition, charter_completed_at, promoted_at, stage, visibility, is_listed, is_supporter_only, member_list_visibility, join_mode, lead_user_id, last_activity_at, dormant_since, icon_path, icon_blurhash, cover_path, cover_blurhash, created_at, updated_at';

/** Anonymous public page: only the build-in-public fields, never settings. */
export const LAB_PUBLIC_COLUMNS =
  'id, name, slug, space_mode, short_description, problem_statement, hypothesis, success_definition, sprint_length_weeks, sprint_deadline, stage, promoted_at, charter_completed_at, last_activity_at, dormant_since, icon_path, icon_blurhash, cover_path, cover_blurhash, created_at, lead_user_id, visibility';

export interface LabRow {
  id: string;
  name: string;
  slug: string;
  space_mode: Enums<'space_mode'>;
  /** §21 provenance — drives the ContentSourceBadge chip ('member' renders nothing). */
  source: Enums<'content_source'>;
  short_description: string | null;
  problem_statement: string | null;
  hypothesis: string | null;
  sprint_length_weeks: number | null;
  sprint_deadline: string | null;
  success_definition: string | null;
  charter_completed_at: string | null;
  promoted_at: string | null;
  stage: Enums<'lab_stage'>;
  visibility: Enums<'lab_visibility'>;
  is_listed: boolean;
  is_supporter_only: boolean;
  member_list_visibility: Enums<'lab_visibility'>;
  join_mode: Enums<'lab_join_mode'>;
  lead_user_id: string;
  last_activity_at: string;
  dormant_since: string | null;
  icon_path: string | null;
  icon_blurhash: string | null;
  cover_path: string | null;
  cover_blurhash: string | null;
  created_at: string;
  updated_at: string;
}

/** Denormalized Space art (Phase 4.5): resolved public URLs + blurhashes. */
export interface LabMediaView {
  iconUrl: string | null;
  /** 96px thumb by pipeline convention — what small cards/avatars load. */
  iconThumbUrl: string | null;
  iconBlurhash: string | null;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverBlurhash: string | null;
}

/**
 * Resolve the labs.*_path columns into public URLs. Space art only exists
 * from Phase 4.5 (the space_icon/space_cover pipeline always writes the
 * thumb pair), so derivedThumbPath is safe whenever a path is set.
 */
export function labMediaView(
  lab: Pick<LabRow, 'icon_path' | 'icon_blurhash' | 'cover_path' | 'cover_blurhash'>,
): LabMediaView {
  return {
    iconUrl: lab.icon_path ? publicMediaUrl(lab.icon_path) : null,
    iconThumbUrl: lab.icon_path ? publicMediaUrl(derivedThumbPath(lab.icon_path)) : null,
    iconBlurhash: lab.icon_blurhash,
    coverUrl: lab.cover_path ? publicMediaUrl(lab.cover_path) : null,
    coverThumbUrl: lab.cover_path ? publicMediaUrl(derivedThumbPath(lab.cover_path)) : null,
    coverBlurhash: lab.cover_blurhash,
  };
}

export interface AuthorRef {
  user_id: string;
  display_name: string;
  handle: string;
  /** 96px pipeline thumb (<8KB) — what facepiles/bylines load; null = initials disc. */
  avatar_thumb_url: string | null;
  avatar_blurhash: string | null;
}

export type ViewerRelation = 'lead' | 'core' | 'member' | 'observer' | 'requested' | 'none';

export interface LabView {
  lab: LabRow;
  /** Dynamic chrome: 'lab' -> Warshad, 'club' -> Koox. */
  kind: Enums<'space_mode'>;
  lead: AuthorRef | null;
  memberCount: number;
  /**
   * First few active members (join order) for the directory facepile — []
   * whenever the §16 member_list_visibility gate hides the roster from this
   * viewer (count-only). See the gate note in hydrateLabs.
   */
  memberPreview: AuthorRef[];
  tags: { id: string; name: string }[];
  skillNeeds: { id: string; skill: string; alerted_at: string | null }[];
  /** The viewer's relationship to this Space (drives UI affordances). */
  viewerRelation: ViewerRelation;
  isDormant: boolean;
  /** Whole days until sprint_deadline (negative = past), or null. */
  sprintDaysLeft: number | null;
  /** Space icon + cover, resolved to public URLs (Phase 4.5). */
  media: LabMediaView;
}

/** Charter is complete when all three quality-gate fields are present. */
export function isCharterComplete(lab: Pick<LabRow, 'problem_statement' | 'hypothesis' | 'success_definition'>): boolean {
  return Boolean(lab.problem_statement && lab.hypothesis && lab.success_definition);
}

/** Whole days from now to a deadline ISO string (UTC-day granularity). */
export function daysUntil(deadlineIso: string | null, now: number = Date.now()): number | null {
  if (!deadlineIso) return null;
  const deadline = new Date(deadlineIso).getTime();
  return Math.ceil((deadline - now) / 86_400_000);
}

/** A Space is dormant if flagged, OR idle beyond the threshold (display fallback). */
export function computeDormant(lab: Pick<LabRow, 'dormant_since' | 'last_activity_at'>, now: number = Date.now()): boolean {
  if (lab.dormant_since) return true;
  return now - new Date(lab.last_activity_at).getTime() > DORMANCY_DAYS * 86_400_000;
}

async function fetchAuthors(
  admin: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, AuthorRef>> {
  const authors = new Map<string, AuthorRef>();
  if (userIds.length === 0) return authors;
  const { data, error } = await admin
    .from('profiles')
    .select('user_id, display_name, handle, avatar_path, avatar_blurhash')
    .in('user_id', userIds);
  if (error) throw new Error(`author hydration failed: ${error.message}`);
  for (const row of data ?? []) {
    authors.set(row.user_id, {
      user_id: row.user_id,
      display_name: row.display_name,
      handle: row.handle,
      avatar_thumb_url: row.avatar_path
        ? publicMediaUrl(derivedThumbPath(row.avatar_path))
        : null,
      avatar_blurhash: row.avatar_blurhash ?? null,
    });
  }
  return authors;
}

/** Facepile size on directory cards. */
export const MEMBER_PREVIEW_LIMIT = 4;

/**
 * Hydrate lab rows into view models. `viewerId` drives viewerRelation (the
 * caller's role or pending-request state). Aggregation is JS-side over the page
 * (≤20 labs) — fine at beta scale.
 *
 * FACEPILE GATE (§16 member_list_visibility): hydration runs on the service
 * role, so the roster gate is enforced HERE, before anything reaches the view
 * model the API returns. The directory rule is deliberately stricter than the
 * DB's can_read_lab_roster (which also opens 'members' rosters to any reader):
 * 'public' → facepile for everyone; 'members' → only the lead / an active
 * member of THIS Space; 'private' → never (count-only). A Discover card is a
 * broadcast surface — the detail page's Members tab is the roster surface.
 *
 * TEST-ACCOUNT QUARANTINE (users.is_test): a quarantined test member is not
 * counted in memberCount and never appears in the facepile — a headcount and
 * a facepile are community proof. Filtered in JS against the (small) test-id
 * set, fetched alongside the roster, so no extra round-trip is serialised and
 * the roster query never carries a long id list.
 */
export async function hydrateLabs(
  admin: SupabaseClient<Database>,
  viewerId: string,
  rows: LabRow[],
  now: number = Date.now(),
): Promise<LabView[]> {
  if (rows.length === 0) return [];

  const labIds = rows.map((r) => r.id);
  const leadIds = [...new Set(rows.map((r) => r.lead_user_id))];

  const [membersResult, tagsResult, skillsResult, mineResult, testIds] = await Promise.all([
    admin
      .from('lab_members')
      .select('lab_id, user_id, role')
      .in('lab_id', labIds)
      .eq('status', 'active')
      .order('joined_at', { ascending: true }),
    admin.from('lab_tags').select('lab_id, tags ( id, name )').in('lab_id', labIds),
    admin
      .from('lab_skill_needs')
      .select('id, lab_id, skill, alerted_at')
      .in('lab_id', labIds)
      .is('filled_at', null),
    admin.from('lab_members').select('lab_id, role, status').in('lab_id', labIds).eq('user_id', viewerId),
    loadTestAccountIds(admin),
  ]);
  if (membersResult.error) throw new Error(`member count failed: ${membersResult.error.message}`);
  if (tagsResult.error) throw new Error(`lab tags failed: ${tagsResult.error.message}`);
  if (skillsResult.error) throw new Error(`skill needs failed: ${skillsResult.error.message}`);
  if (mineResult.error) throw new Error(`viewer membership failed: ${mineResult.error.message}`);

  const testIdSet = new Set(testIds);
  const memberCounts = new Map<string, number>();
  const membersByLab = new Map<string, string[]>();
  for (const row of membersResult.data ?? []) {
    // Quarantined test members: neither counted nor eligible for the facepile.
    if (testIdSet.has(row.user_id)) continue;
    memberCounts.set(row.lab_id, (memberCounts.get(row.lab_id) ?? 0) + 1);
    membersByLab.set(row.lab_id, [...(membersByLab.get(row.lab_id) ?? []), row.user_id]);
  }

  const tagsByLab = new Map<string, { id: string; name: string }[]>();
  for (const row of tagsResult.data ?? []) {
    const tag = row.tags as unknown as { id: string; name: string } | null;
    if (!tag) continue;
    tagsByLab.set(row.lab_id, [...(tagsByLab.get(row.lab_id) ?? []), tag]);
  }

  const skillsByLab = new Map<string, { id: string; skill: string; alerted_at: string | null }[]>();
  for (const row of skillsResult.data ?? []) {
    skillsByLab.set(row.lab_id, [...(skillsByLab.get(row.lab_id) ?? []), row]);
  }

  const mineByLab = new Map<string, { role: string; status: string }>();
  for (const row of mineResult.data ?? []) {
    mineByLab.set(row.lab_id, { role: row.role, status: row.status });
  }

  // The facepile gate (see the function doc). Hidden roster ids are excluded
  // BEFORE the profile batch, so a downstream bug can never resurface them.
  const rosterVisible = (lab: LabRow): boolean => {
    if (lab.member_list_visibility === 'public') return true;
    if (lab.member_list_visibility !== 'members') return false;
    return lab.lead_user_id === viewerId || mineByLab.get(lab.id)?.status === 'active';
  };
  const previewIdsByLab = new Map<string, string[]>();
  for (const lab of rows) {
    if (!rosterVisible(lab)) continue;
    previewIdsByLab.set(lab.id, (membersByLab.get(lab.id) ?? []).slice(0, MEMBER_PREVIEW_LIMIT));
  }

  // One profile batch covers leads + every permitted preview id.
  const authors = await fetchAuthors(admin, [
    ...new Set([...leadIds, ...[...previewIdsByLab.values()].flat()]),
  ]);

  return rows.map((lab) => {
    const mine = mineByLab.get(lab.id);
    let viewerRelation: ViewerRelation = 'none';
    if (lab.lead_user_id === viewerId) viewerRelation = 'lead';
    else if (mine?.status === 'requested') viewerRelation = 'requested';
    else if (mine?.status === 'active') viewerRelation = mine.role as ViewerRelation;

    return {
      lab,
      kind: lab.space_mode,
      lead: authors.get(lab.lead_user_id) ?? null,
      memberCount: memberCounts.get(lab.id) ?? 0,
      memberPreview: (previewIdsByLab.get(lab.id) ?? [])
        .map((id) => authors.get(id))
        .filter((author): author is AuthorRef => Boolean(author)),
      tags: tagsByLab.get(lab.id) ?? [],
      skillNeeds: skillsByLab.get(lab.id) ?? [],
      viewerRelation,
      isDormant: computeDormant(lab, now),
      sprintDaysLeft: daysUntil(lab.sprint_deadline, now),
      media: labMediaView(lab),
    };
  });
}

// --- Discover tab counts ----------------------------------------------------

export interface LabTabCounts {
  all: number;
  clubs: number;
  labs: number;
  mine: number;
}

/** Listed Space ids the user belongs to (lead rows included — createLab seeds one). */
export async function fetchLabMembershipIds(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from('lab_members')
    .select('lab_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new Error(`membership scan failed: ${error.message}`);
  return (data ?? []).map((m) => m.lab_id);
}

/**
 * Tab counts for Discover (All / Clubs / Labs / My Spaces): head-only exact
 * counts issued on the CALLER's client, so RLS decides what is countable — a
 * viewer can never infer the existence of a Space they cannot read from any
 * number here. `memberLabIds` comes from fetchLabMembershipIds (service role;
 * the rows are the caller's own memberships), then the mine count itself is
 * still RLS-filtered through the labs SELECT policy.
 *
 * `testAccountIds` (loadTestAccountIds): the discovery tabs (All / Clubs /
 * Labs) never count a Space led by a quarantined test account — the same
 * exclusion the Discover list applies. My Spaces is the caller's own
 * membership record, not discovery, and is left as it is (the mine=1 list
 * does not exclude them either, so count and list agree).
 */
export async function fetchLabCounts(
  caller: SupabaseClient<Database>,
  memberLabIds: string[],
  testAccountIds: readonly string[],
): Promise<LabTabCounts> {
  const head = { count: 'exact', head: true } as const;
  const listed = () => {
    const query = caller.from('labs').select('id', head).eq('is_listed', true);
    return testAccountIds.length > 0
      ? query.not('lead_user_id', 'in', postgrestIdList(testAccountIds))
      : query;
  };
  const [all, clubs, labs, mine] = await Promise.all([
    listed(),
    listed().eq('space_mode', 'club'),
    listed().eq('space_mode', 'lab'),
    memberLabIds.length > 0
      ? caller.from('labs').select('id', head).in('id', memberLabIds)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  for (const result of [all, clubs, labs, mine]) {
    if (result.error) throw new Error(`lab tab counts failed: ${result.error.message}`);
  }
  return {
    all: all.count ?? 0,
    clubs: clubs.count ?? 0,
    labs: labs.count ?? 0,
    mine: mine.count ?? 0,
  };
}

// --- child content read models ----------------------------------------------

export const UPDATE_COLUMNS =
  'id, lab_id, author_user_id, title, body, collaboration_id, status, source, created_at, updated_at';
export const ARTIFACT_COLUMNS =
  'id, lab_id, added_by_user_id, title, url, description, status, created_at';
export const DECISION_COLUMNS =
  'id, lab_id, created_by_user_id, title, context, decision, status, decided_at, created_at';
export const EVENT_COLUMNS = 'id, lab_id, actor_user_id, event_type, metadata, created_at';

export interface UpdateRow {
  id: string;
  lab_id: string;
  author_user_id: string;
  title: string | null;
  body: string;
  collaboration_id: string | null;
  status: Enums<'content_status'>;
  source: Enums<'content_source'>;
  created_at: string;
  updated_at: string;
}

export interface ArtifactRow {
  id: string;
  lab_id: string;
  added_by_user_id: string;
  title: string;
  url: string;
  description: string | null;
  status: Enums<'content_status'>;
  created_at: string;
}

export interface DecisionRow {
  id: string;
  lab_id: string;
  created_by_user_id: string;
  title: string;
  context: string | null;
  decision: string;
  status: Enums<'content_status'>;
  decided_at: string;
  created_at: string;
}

export interface EventRow {
  id: string;
  lab_id: string;
  actor_user_id: string | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MemberView {
  user_id: string;
  role: Enums<'lab_member_role'>;
  specialization: Enums<'lab_member_specialization'> | null;
  status: Enums<'lab_member_status'>;
  joined_at: string | null;
  author: AuthorRef | null;
}

/** Attach author refs to any lab-child rows keyed by an author column. */
export async function attachAuthors<T extends object>(
  admin: SupabaseClient<Database>,
  rows: T[],
  authorKey: keyof T,
): Promise<Array<T & { author: AuthorRef | null }>> {
  const ids = [...new Set(rows.map((r) => r[authorKey]).filter(Boolean) as string[])];
  const authors = await fetchAuthors(admin, ids);
  return rows.map((r) => ({ ...r, author: authors.get(r[authorKey] as string) ?? null }));
}
