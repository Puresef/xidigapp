import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

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
  'id, name, slug, space_mode, short_description, problem_statement, hypothesis, sprint_length_weeks, sprint_deadline, success_definition, charter_completed_at, promoted_at, stage, visibility, is_listed, is_supporter_only, member_list_visibility, join_mode, lead_user_id, last_activity_at, dormant_since, icon_path, icon_blurhash, cover_path, cover_blurhash, created_at, updated_at';

/** Anonymous public page: only the build-in-public fields, never settings. */
export const LAB_PUBLIC_COLUMNS =
  'id, name, slug, space_mode, short_description, problem_statement, hypothesis, success_definition, sprint_length_weeks, sprint_deadline, stage, promoted_at, charter_completed_at, last_activity_at, dormant_since, icon_path, icon_blurhash, cover_path, cover_blurhash, created_at, lead_user_id, visibility';

export interface LabRow {
  id: string;
  name: string;
  slug: string;
  space_mode: Enums<'space_mode'>;
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
}

export type ViewerRelation = 'lead' | 'core' | 'member' | 'observer' | 'requested' | 'none';

export interface LabView {
  lab: LabRow;
  /** Dynamic chrome: 'lab' -> Warshad, 'club' -> Koox. */
  kind: Enums<'space_mode'>;
  lead: AuthorRef | null;
  memberCount: number;
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
    .select('user_id, display_name, handle')
    .in('user_id', userIds);
  if (error) throw new Error(`author hydration failed: ${error.message}`);
  for (const row of data ?? []) {
    authors.set(row.user_id, { user_id: row.user_id, display_name: row.display_name, handle: row.handle });
  }
  return authors;
}

/**
 * Hydrate lab rows into view models. `viewerId` drives viewerRelation (the
 * caller's role or pending-request state). Aggregation is JS-side over the page
 * (≤20 labs) — fine at beta scale.
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

  const [authors, membersResult, tagsResult, skillsResult, mineResult] = await Promise.all([
    fetchAuthors(admin, leadIds),
    admin.from('lab_members').select('lab_id, user_id, role').in('lab_id', labIds).eq('status', 'active'),
    admin.from('lab_tags').select('lab_id, tags ( id, name )').in('lab_id', labIds),
    admin
      .from('lab_skill_needs')
      .select('id, lab_id, skill, alerted_at')
      .in('lab_id', labIds)
      .is('filled_at', null),
    admin.from('lab_members').select('lab_id, role, status').in('lab_id', labIds).eq('user_id', viewerId),
  ]);
  if (membersResult.error) throw new Error(`member count failed: ${membersResult.error.message}`);
  if (tagsResult.error) throw new Error(`lab tags failed: ${tagsResult.error.message}`);
  if (skillsResult.error) throw new Error(`skill needs failed: ${skillsResult.error.message}`);
  if (mineResult.error) throw new Error(`viewer membership failed: ${mineResult.error.message}`);

  const memberCounts = new Map<string, number>();
  for (const row of membersResult.data ?? []) {
    memberCounts.set(row.lab_id, (memberCounts.get(row.lab_id) ?? 0) + 1);
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
      tags: tagsByLab.get(lab.id) ?? [],
      skillNeeds: skillsByLab.get(lab.id) ?? [],
      viewerRelation,
      isDormant: computeDormant(lab, now),
      sprintDaysLeft: daysUntil(lab.sprint_deadline, now),
      media: labMediaView(lab),
    };
  });
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
