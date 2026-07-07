import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

import { CANDIDATE_LIST_PAGE_SIZE } from '@/lib/capital/constants';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { keysetBefore, type Cursor } from '@/lib/pagination';

/**
 * Capital / Maal read models (§10/§17). Candidate rows are fetched under the
 * CALLER's RLS (can_read_candidate governs draft/reviewers-only/members
 * visibility, so whatever RLS hides is a plain 404). Cross-user hydration —
 * lab name/slug, creator profile, vote tally, interest counts — goes through the
 * service role: votes are ballot-private (own-row-only) so the tally comes from
 * the SECURITY DEFINER candidate_vote_tally rpc, and interest counts from
 * candidate_interest_counts (social proof without enumerating who).
 *
 * The public projection uses a NARROW column set + service role (anon has no RLS
 * read) and NEVER exposes invest language — build-in-public only.
 */

// A single string literal so Supabase types parse it into a row shape.
export const CANDIDATE_COLUMNS =
  'id, lab_id, co_lab_id, created_by_user_id, name, one_liner, problem, solution, traction, team, ask, status, status_reason, visibility, region_gated, rubric_team_score, rubric_traction_score, rubric_feasibility_score, notes, timeline_public, vote_opens_at, vote_closes_at, submitted_at, decided_at, funded_at, logo_path, logo_blurhash, cover_path, cover_blurhash, created_at, updated_at';

/** Public page: build-in-public fields only — no ask, no notes, no invest data. */
export const CANDIDATE_PUBLIC_COLUMNS =
  'id, lab_id, name, one_liner, problem, solution, traction, team, status, timeline_public, submitted_at, decided_at, funded_at, logo_path, logo_blurhash, cover_path, cover_blurhash, created_at';

export interface CandidateRow {
  id: string;
  lab_id: string;
  co_lab_id: string | null;
  created_by_user_id: string;
  name: string;
  one_liner: string | null;
  problem: string | null;
  solution: string | null;
  traction: string | null;
  team: string | null;
  ask: string | null;
  status: Enums<'candidate_status'>;
  status_reason: string | null;
  visibility: Enums<'candidate_visibility'>;
  region_gated: boolean;
  rubric_team_score: number | null;
  rubric_traction_score: number | null;
  rubric_feasibility_score: number | null;
  notes: string | null;
  timeline_public: boolean;
  vote_opens_at: string | null;
  vote_closes_at: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  funded_at: string | null;
  logo_path: string | null;
  logo_blurhash: string | null;
  cover_path: string | null;
  cover_blurhash: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthorRef {
  user_id: string;
  display_name: string;
  handle: string;
}

export interface LabRef {
  id: string;
  name: string;
  slug: string;
}

/** Resolved candidate art (logo/cover) URLs + blurhashes. */
export interface CandidateMediaView {
  logoUrl: string | null;
  logoThumbUrl: string | null;
  logoBlurhash: string | null;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverBlurhash: string | null;
}

export function candidateMediaView(
  cand: Pick<CandidateRow, 'logo_path' | 'logo_blurhash' | 'cover_path' | 'cover_blurhash'>,
): CandidateMediaView {
  return {
    logoUrl: cand.logo_path ? publicMediaUrl(cand.logo_path) : null,
    logoThumbUrl: cand.logo_path ? publicMediaUrl(derivedThumbPath(cand.logo_path)) : null,
    logoBlurhash: cand.logo_blurhash,
    coverUrl: cand.cover_path ? publicMediaUrl(cand.cover_path) : null,
    coverThumbUrl: cand.cover_path ? publicMediaUrl(derivedThumbPath(cand.cover_path)) : null,
    coverBlurhash: cand.cover_blurhash,
  };
}

/** Aggregate rubric snapshot (the denormalized numeric(3,2) columns). */
export interface RubricAggregate {
  team: number | null;
  traction: number | null;
  feasibility: number | null;
  /** Simple mean of the present criteria, or null if none scored. */
  overall: number | null;
}

export function rubricAggregate(
  cand: Pick<
    CandidateRow,
    'rubric_team_score' | 'rubric_traction_score' | 'rubric_feasibility_score'
  >,
): RubricAggregate {
  const parts = [cand.rubric_team_score, cand.rubric_traction_score, cand.rubric_feasibility_score]
    .filter((n): n is number => typeof n === 'number');
  const overall = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  return {
    team: cand.rubric_team_score,
    traction: cand.rubric_traction_score,
    feasibility: cand.rubric_feasibility_score,
    overall,
  };
}

export interface ReviewRow {
  id: string;
  candidate_id: string;
  reviewer_user_id: string;
  team_score: number | null;
  traction_score: number | null;
  feasibility_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  reviewer: AuthorRef | null;
}

export interface VoteTally {
  approve: number;
  reject: number;
  total: number;
}

export interface InterestCounts {
  help: number;
  cosign: number;
  invest: number;
}

/** The viewer's own signals (RLS reads — own-row-only on votes/interests). */
export interface ViewerSignals {
  vote: Enums<'vote_choice'> | null;
  /** interest_type slugs the viewer has expressed on this candidate. */
  interests: Enums<'interest_type'>[];
}

export interface TimelineMilestone {
  key: 'created' | 'submitted' | 'decided' | 'funded';
  at: string;
}

export interface CandidateView {
  candidate: CandidateRow;
  lab: LabRef | null;
  coLab: LabRef | null;
  creator: AuthorRef | null;
  rubric: RubricAggregate;
  reviews: ReviewRow[];
  voteTally: VoteTally;
  interestCounts: InterestCounts;
  viewer: ViewerSignals;
  media: CandidateMediaView;
  timeline: TimelineMilestone[];
}

/** Narrow logged-out projection — NO invest language, NO ask, NO reviews/votes. */
export interface PublicCandidateView {
  id: string;
  name: string;
  oneLiner: string | null;
  problem: string | null;
  solution: string | null;
  traction: string | null;
  team: string | null;
  status: Enums<'candidate_status'>;
  lab: LabRef | null;
  media: CandidateMediaView;
  timeline: TimelineMilestone[];
}

type Admin = SupabaseClient<Database>;
type AnyClient = SupabaseClient<Database>;

// --- shared hydration -------------------------------------------------------

async function fetchAuthors(admin: Admin, userIds: string[]): Promise<Map<string, AuthorRef>> {
  const authors = new Map<string, AuthorRef>();
  if (userIds.length === 0) return authors;
  const { data, error } = await admin
    .from('profiles')
    .select('user_id, display_name, handle')
    .in('user_id', userIds);
  if (error) throw new Error(`author hydration failed: ${error.message}`);
  for (const row of data ?? []) {
    authors.set(row.user_id, {
      user_id: row.user_id,
      display_name: row.display_name,
      handle: row.handle,
    });
  }
  return authors;
}

async function fetchLabs(admin: Admin, labIds: string[]): Promise<Map<string, LabRef>> {
  const labs = new Map<string, LabRef>();
  if (labIds.length === 0) return labs;
  const { data, error } = await admin.from('labs').select('id, name, slug').in('id', labIds);
  if (error) throw new Error(`lab hydration failed: ${error.message}`);
  for (const row of data ?? []) labs.set(row.id, { id: row.id, name: row.name, slug: row.slug });
  return labs;
}

/**
 * Vote tally via the SECURITY DEFINER rpc (ballots are own-row-only, so a plain
 * count would be blocked). The rpc name is not in database.types.ts until the DB
 * agent's migration is merged — cast the name until then.
 */
async function fetchVoteTally(admin: Admin, candidateId: string): Promise<VoteTally> {
  const { data, error } = await admin.rpc('candidate_vote_tally' as never, {
    cand: candidateId,
  } as never);
  if (error) throw new Error(`vote tally failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { approve: number; reject: number; total: number }
    | undefined;
  return { approve: row?.approve ?? 0, reject: row?.reject ?? 0, total: row?.total ?? 0 };
}

async function fetchInterestCounts(admin: Admin, candidateId: string): Promise<InterestCounts> {
  const { data, error } = await admin.rpc('candidate_interest_counts' as never, {
    cand: candidateId,
  } as never);
  if (error) throw new Error(`interest counts failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { help: number; cosign: number; invest: number }
    | undefined;
  return { help: row?.help ?? 0, cosign: row?.cosign ?? 0, invest: row?.invest ?? 0 };
}

function buildTimeline(cand: CandidateRow): TimelineMilestone[] {
  const milestones: TimelineMilestone[] = [{ key: 'created', at: cand.created_at }];
  if (cand.submitted_at) milestones.push({ key: 'submitted', at: cand.submitted_at });
  if (cand.decided_at) milestones.push({ key: 'decided', at: cand.decided_at });
  if (cand.funded_at) milestones.push({ key: 'funded', at: cand.funded_at });
  return milestones;
}

/**
 * Full candidate view for a signed-in viewer. `supabase` MUST be the caller's
 * RLS-scoped client so the initial fetch enforces can_read_candidate; `admin`
 * (service role) drives the cross-user/aggregate hydration. Returns null when
 * the candidate is not readable (RLS hides it → 404).
 */
export async function getCandidateView(
  supabase: AnyClient,
  admin: Admin,
  id: string,
  viewerId: string,
): Promise<CandidateView | null> {
  const { data: candData, error } = await supabase
    .from('venture_candidates')
    .select(CANDIDATE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`candidate fetch failed: ${error.message}`);
  if (!candData) return null;
  const candidate = candData as unknown as CandidateRow;

  const labIds = [candidate.lab_id, candidate.co_lab_id].filter(
    (v): v is string => typeof v === 'string',
  );

  const [authors, labs, voteTally, interestCounts, reviewsResult, myVoteResult, myInterestsResult] =
    await Promise.all([
      fetchAuthors(admin, [candidate.created_by_user_id]),
      fetchLabs(admin, labIds),
      fetchVoteTally(admin, id),
      fetchInterestCounts(admin, id),
      // Reviews are readable wherever the candidate is → RLS-scoped read.
      supabase
        .from('candidate_reviews')
        .select(
          'id, candidate_id, reviewer_user_id, team_score, traction_score, feasibility_score, notes, created_at, updated_at',
        )
        .eq('candidate_id', id)
        .order('created_at', { ascending: true }),
      // Viewer's own vote (own-row-only under RLS).
      supabase
        .from('candidate_votes')
        .select('vote')
        .eq('candidate_id', id)
        .eq('voter_user_id', viewerId)
        .maybeSingle(),
      // Viewer's own interests (own-row-only under RLS).
      supabase.from('interests').select('type').eq('candidate_id', id).eq('user_id', viewerId),
    ]);

  if (reviewsResult.error) throw new Error(`reviews fetch failed: ${reviewsResult.error.message}`);
  if (myVoteResult.error) throw new Error(`viewer vote fetch failed: ${myVoteResult.error.message}`);
  if (myInterestsResult.error) {
    throw new Error(`viewer interests fetch failed: ${myInterestsResult.error.message}`);
  }

  const reviewerIds = [...new Set((reviewsResult.data ?? []).map((r) => r.reviewer_user_id))];
  const reviewers = await fetchAuthors(admin, reviewerIds);
  const reviews: ReviewRow[] = (reviewsResult.data ?? []).map((r) => ({
    ...r,
    reviewer: reviewers.get(r.reviewer_user_id) ?? null,
  }));

  return {
    candidate,
    lab: labs.get(candidate.lab_id) ?? null,
    coLab: candidate.co_lab_id ? labs.get(candidate.co_lab_id) ?? null : null,
    creator: authors.get(candidate.created_by_user_id) ?? null,
    rubric: rubricAggregate(candidate),
    reviews,
    voteTally,
    interestCounts,
    viewer: {
      vote: (myVoteResult.data?.vote as Enums<'vote_choice'>) ?? null,
      interests: (myInterestsResult.data ?? []).map((r) => r.type as Enums<'interest_type'>),
    },
    media: candidateMediaView(candidate),
    timeline: buildTimeline(candidate),
  };
}

/**
 * Logged-out narrow projection (SSR). Service role (anon has no RLS read), but
 * gated in code to public build-in-public candidates only: visible ONLY when
 * timeline_public is set AND the candidate is in a shown status (not draft, and
 * visibility is all_members). NEVER any invest language. Returns null otherwise.
 */
export async function getPublicCandidateView(
  admin: Admin,
  id: string,
): Promise<PublicCandidateView | null> {
  const { data, error } = await admin
    .from('venture_candidates')
    .select(`${CANDIDATE_PUBLIC_COLUMNS}, visibility, timeline_public, co_lab_id`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`public candidate fetch failed: ${error.message}`);
  if (!data) return null;

  const cand = data as unknown as CandidateRow;
  const isPublic =
    cand.timeline_public && cand.visibility === 'all_members' && cand.status !== 'draft';
  if (!isPublic) return null;

  const labs = await fetchLabs(admin, [cand.lab_id]);
  return {
    id: cand.id,
    name: cand.name,
    oneLiner: cand.one_liner,
    problem: cand.problem,
    solution: cand.solution,
    traction: cand.traction,
    team: cand.team,
    status: cand.status,
    lab: labs.get(cand.lab_id) ?? null,
    media: candidateMediaView(cand),
    timeline: buildTimeline(cand),
  };
}

export interface CandidateListItem {
  candidate: CandidateRow;
  lab: LabRef | null;
  creator: AuthorRef | null;
  media: CandidateMediaView;
}

export interface CandidateListResult {
  items: CandidateListItem[];
  nextCursor: Cursor | null;
}

/**
 * Keyset list of readable candidates (mirrors labs/views pagination). Reads run
 * under the caller's RLS (can_read_candidate), so hidden candidates simply don't
 * appear. `admin` hydrates lab + creator refs over the page.
 */
export async function listCandidates(
  supabase: AnyClient,
  admin: Admin,
  opts: { labId?: string; status?: Enums<'candidate_status'>; cursor?: Cursor | null; limit?: number },
): Promise<CandidateListResult> {
  const limit = opts.limit ?? CANDIDATE_LIST_PAGE_SIZE;

  let query = supabase
    .from('venture_candidates')
    .select(CANDIDATE_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (opts.labId) query = query.or(`lab_id.eq.${opts.labId},co_lab_id.eq.${opts.labId}`);
  if (opts.status) query = query.eq('status', opts.status);
  if (opts.cursor) query = query.or(keysetBefore(opts.cursor, 'id'));

  const { data, error } = await query;
  if (error) throw new Error(`candidate list failed: ${error.message}`);

  const rows = (data ?? []) as unknown as CandidateRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor = hasMore && last ? { createdAt: last.created_at, id: last.id } : null;

  const labIds = [...new Set(page.map((c) => c.lab_id))];
  const creatorIds = [...new Set(page.map((c) => c.created_by_user_id))];
  const [labs, creators] = await Promise.all([
    fetchLabs(admin, labIds),
    fetchAuthors(admin, creatorIds),
  ]);

  const items: CandidateListItem[] = page.map((candidate) => ({
    candidate,
    lab: labs.get(candidate.lab_id) ?? null,
    creator: creators.get(candidate.created_by_user_id) ?? null,
    media: candidateMediaView(candidate),
  }));

  return { items, nextCursor };
}
