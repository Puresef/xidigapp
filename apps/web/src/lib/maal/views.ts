import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums, Json } from '@xidig/db';

import { ApiError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/guards';
import {
  isActiveAccount,
  isActiveAdmin,
  isActiveModOrAdmin,
  type AccountStanding,
} from '@/lib/auth/privilege';
import {
  hydrateLabs,
  MEMBER_PREVIEW_LIMIT,
  type AuthorRef,
  type LabRow,
  type ViewerRelation,
} from '@/lib/labs/views';
import {
  BOARD_COLUMN_LIMIT,
  BOARD_COLUMNS,
  DEFAULT_WEIGHTS,
  LEDGER_DEFAULT_DAYS,
  LEDGER_TRAIL_LIMIT,
  OVERVIEW_DECISIONS_LIMIT,
  TASK_STATUS_COLUMN,
  VENTURE_INDEX_PAGE_SIZE,
  VENTURE_TIMEOUT_DAYS,
  VENTURE_WARN_GRACE_DAYS,
  WORK_EVENT_TYPES,
  WORK_ORG_MODES,
  type BoardColumn,
  type WeightScheme,
  type WorkEventType,
} from '@/lib/maal/constants';
import type { BoardQuery, LedgerQuery, VentureIndexQuery } from '@/lib/maal/schemas';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Maal read models (F2 §5, frames 7a–7g).
 *
 * Same split as lib/labs/views.ts and lib/events/views.ts: rows come back under
 * the CALLER's RLS client so the DB decides what is readable (and whatever it
 * hides is a plain 404/empty list, never a hint), and the service role is used
 * ONLY to hydrate cross-user detail the caller cannot select for themselves —
 * names, avatars, cities, aggregate counts.
 *
 * Three rules this module owns, because no route can be trusted to remember
 * them one at a time:
 *
 *  1. **Koox is excluded in the query.** `WORK_ORG_MODES` is an `.in()` filter
 *     on every index read (ruling 4). A component that filters clubs out of a
 *     result set is already a bug — by then the count was wrong.
 *  2. **Share % is never stored.** It is `units / sum(units)` computed here,
 *     from `venture_contribution_tally()`, every time it is read. Changing the
 *     (member-voted) weight scheme therefore re-reads history instead of
 *     rewriting it, and no row anywhere claims to own a percentage.
 *  3. **The ledger gate is app-side AND DB-side.** `venture_contribution_tally`
 *     is SECURITY DEFINER with no internal readability guard (deliberately —
 *     the Phase 5 poll_results lesson) and is executable by `authenticated`, so
 *     calling it does NOT prove the caller may read the venture. Every entry
 *     point here resolves `canReadLedger` first and refuses before the RPC.
 *
 * One read model serves BOTH ledger surfaces. Ruling 1 is capability parity:
 * `getVentureLedger` returns everything 7d (desktop table) and 7g (mobile cards
 * + event trail) need, and there is no second, thinner mobile query to drift
 * away from it.
 */

type Admin = SupabaseClient<Database>;

const DAY_MS = 86_400_000;

/** A uuid no row holds — an empty `mine` filter must return nothing, not all. */
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// --- columns -----------------------------------------------------------------

/**
 * A venture row is a lab row plus the venture columns. Single string literal
 * (not a concatenation of LAB_COLUMNS) so the Supabase types can still parse it
 * into a row shape instead of widening to `string`.
 */
export const VENTURE_COLUMNS =
  'id, name, slug, space_mode, source, short_description, problem_statement, hypothesis, sprint_length_weeks, sprint_deadline, success_definition, charter_completed_at, promoted_at, stage, visibility, is_listed, is_supporter_only, member_list_visibility, join_mode, lead_user_id, last_activity_at, dormant_since, icon_path, icon_blurhash, cover_path, cover_blurhash, created_at, updated_at, goal_statement, goal_unit, goal_target, goal_progress, venture_since, ledger_visibility, hours_visibility, demotion_warned_at, demoted_at';

export const WORKSTREAM_COLUMNS =
  'id, lab_id, name, owner_user_id, status, position, created_at, updated_at';

export const TASK_COLUMNS =
  'id, lab_id, workstream_id, title, status, assignee_user_id, created_by_user_id, attested_by_user_id, verified_by_user_id, created_at, updated_at';

export const WORK_EVENT_COLUMNS =
  'id, lab_id, seq, member_user_id, event_type, quantity, unit_weight, units, task_id, note, occurred_at, recorded_at, recorded_by_user_id, reverses_event_id, prev_hash, hash';

export const CAPITAL_NEED_COLUMNS =
  'id, lab_id, amount_cents, currency, purpose, decision_id, declared_at, created_at';

export const WEIGHT_SCHEME_COLUMNS = 'id, lab_id, weights, decision_id, effective_from, created_at';

export interface VentureRow extends LabRow {
  goal_statement: string | null;
  goal_unit: string | null;
  goal_target: number | null;
  goal_progress: number;
  venture_since: string | null;
  ledger_visibility: Enums<'venture_scope'>;
  hours_visibility: Enums<'venture_scope'>;
  demotion_warned_at: string | null;
  demoted_at: string | null;
}

export interface WorkstreamRow {
  id: string;
  lab_id: string;
  name: string;
  owner_user_id: string | null;
  status: Enums<'venture_workstream_status'>;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  lab_id: string;
  workstream_id: string | null;
  title: string;
  status: Enums<'venture_task_status'>;
  assignee_user_id: string | null;
  created_by_user_id: string | null;
  attested_by_user_id: string | null;
  verified_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkEventRow {
  id: string;
  lab_id: string;
  seq: number;
  member_user_id: string;
  event_type: Enums<'work_event_type'>;
  quantity: number;
  unit_weight: number;
  units: number;
  task_id: string | null;
  note: string | null;
  occurred_at: string;
  recorded_at: string;
  recorded_by_user_id: string | null;
  reverses_event_id: string | null;
  prev_hash: string;
  hash: string;
}

export interface CapitalNeedRow {
  id: string;
  lab_id: string;
  amount_cents: number;
  currency: string;
  purpose: string;
  decision_id: string | null;
  declared_at: string;
  created_at: string;
}

// --- loaders -----------------------------------------------------------------

/** RLS-scoped venture load by id; whatever RLS hides is a plain 404. */
export async function loadVentureForViewer(ctx: AuthContext, id: string): Promise<VentureRow> {
  const { data, error } = await ctx.supabase
    .from('labs')
    .select(VENTURE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`venture lookup failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);
  return data as unknown as VentureRow;
}

/** RLS-scoped venture load by slug — the /labs/[slug] workspace entry point. */
export async function loadVentureBySlugForViewer(
  ctx: AuthContext,
  slug: string,
): Promise<VentureRow> {
  const { data, error } = await ctx.supabase
    .from('labs')
    .select(VENTURE_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`venture lookup failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);
  return data as unknown as VentureRow;
}

// --- pure helpers ------------------------------------------------------------

export function isVenture(lab: Pick<VentureRow, 'space_mode'>): boolean {
  return lab.space_mode === 'venture';
}

/**
 * The 7a demoted marker ("Dib loo celiyay Maal-nimada"). Read off
 * `labs.demoted_at`, but only while it is still TRUE: a Warshad that was
 * demoted and has since promoted again is a Maal, and its `demoted_at` is
 * history, not a label. `venture_since` is re-stamped on every promotion, so
 * the later of the two wins.
 */
export function wasDemoted(
  lab: Pick<VentureRow, 'space_mode' | 'demoted_at' | 'venture_since'>,
): boolean {
  if (lab.space_mode !== 'lab' || !lab.demoted_at) return false;
  if (!lab.venture_since) return true;
  return Date.parse(lab.demoted_at) > Date.parse(lab.venture_since);
}

/**
 * The per-row verb on 7a. `Fur` = you are already in it, `Codso` = it takes
 * requests, `Ku biir` = it is open, `Fiiri` = you can look but not act (an
 * invite-only space, or a request you have already sent — asking twice is not
 * an affordance).
 */
export type VentureJoinAction = 'open' | 'request' | 'join' | 'view';

export function ventureJoinAction(
  relation: ViewerRelation,
  joinMode: Enums<'lab_join_mode'>,
): VentureJoinAction {
  if (
    relation === 'lead' ||
    relation === 'core' ||
    relation === 'member' ||
    relation === 'observer'
  ) {
    return 'open';
  }
  if (relation === 'requested') return 'view';
  if (joinMode === 'open') return 'join';
  if (joinMode === 'request') return 'request';
  return 'view';
}

/**
 * What the viewer may DO inside a venture. Mirrors the DB's `is_venture_lead` /
 * `can_read_venture_ledger` / `can_read_venture_hours` so a surface and a policy
 * cannot disagree — the DB stays authoritative, this is what the UI renders
 * against.
 */
export interface VentureViewer {
  userId: string;
  relation: ViewerRelation;
  isMember: boolean;
  /** Lead, core member, or platform mod/admin — the "hoggaamiye" of 7b/7d. */
  isLead: boolean;
  isMod: boolean;
  /** Lead or platform admin, ACTIVE account: may change settings, promote, resolve applications. */
  canManage: boolean;
  /** Active non-observer on an ACTIVE account: may claim tasks and log contributions. */
  canContribute: boolean;
  canReadLedger: boolean;
  /** False = per-member hours fold to a venture total (the 7b toggle). */
  canReadHours: boolean;
}

/**
 * `account` is the viewer's PLATFORM standing (role + account status). Owner
 * ruling, 11 Sep: platform oversight (isMod, admin management) needs an active
 * account, and in the deletion grace a lead or member keeps READ reach
 * (ledger, hours, export) but every venture WRITE needs an active account —
 * so canManage / canContribute are false for any non-active account. The
 * write routes enforce the same with requireActiveUser; this keeps the
 * surfaces from offering controls the server will refuse.
 */
export function resolveVentureViewer(
  lab: VentureRow,
  viewerId: string,
  account: AccountStanding,
  membership: { role: Enums<'lab_member_role'>; status: Enums<'lab_member_status'> } | null,
): VentureViewer {
  const isMod = isActiveModOrAdmin(account);
  const accountActive = isActiveAccount(account);
  const isActive = membership?.status === 'active';
  const isOwner = lab.lead_user_id === viewerId;

  let relation: ViewerRelation = 'none';
  if (isOwner) relation = 'lead';
  else if (membership?.status === 'requested') relation = 'requested';
  else if (isActive) relation = membership.role as ViewerRelation;

  const isMember = isOwner || isActive;
  const isLead =
    isOwner || (isActive && (membership.role === 'lead' || membership.role === 'core'));

  return {
    userId: viewerId,
    relation,
    isMember,
    isLead,
    isMod,
    canManage: (accountActive && isOwner) || isActiveAdmin(account),
    canContribute: accountActive && (isOwner || (isActive && membership.role !== 'observer')),
    canReadLedger: (isMember || isMod) && (lab.ledger_visibility === 'members' || isLead || isMod),
    canReadHours: lab.hours_visibility === 'members' || isLead || isMod,
  };
}

/**
 * A stored weight scheme (jsonb) folded onto the closed type list. Unknown keys
 * are dropped and missing ones fall back to the seeded default: a scheme voted
 * before a contribution type existed must still resolve, and it must resolve to
 * the same number the ledger would have used anyway.
 */
export function parseWeightScheme(weights: Json | null | undefined): WeightScheme {
  const source =
    weights && typeof weights === 'object' && !Array.isArray(weights)
      ? (weights as Record<string, unknown>)
      : {};
  const scheme = { ...DEFAULT_WEIGHTS };
  for (const type of WORK_EVENT_TYPES) {
    const value = source[type];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      scheme[type] = Math.round(value);
    }
  }
  return scheme;
}

/**
 * Share of the venture, as a fraction of total units. Never stored, never
 * rounded into storage — the caller formats it.
 *
 * Reversals carry negative units, so a member whose contributions were all
 * corrected sums to 0 and simply has no share. A NEGATIVE total (more reversed
 * than logged) is clamped to 0 for the denominator's sake: a negative share is
 * not a thing anyone can hold, and it must not drag another member's share
 * above 100%.
 */
export function computeShares<T extends { units: number }>(
  rows: readonly T[],
): Array<T & { share: number }> {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.units), 0);
  return rows.map((row) => ({
    ...row,
    share: total > 0 ? Math.max(0, row.units) / total : 0,
  }));
}

/** Monday 00:00 UTC of the week containing `now` — the 7c week meter's window. */
export function startOfWeek(now: number = Date.now()): number {
  const date = new Date(now);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - day * DAY_MS;
}

/**
 * The sprint line on 7a ("Wareegga 2aad — 12 maalmood harsan"). DERIVED, not
 * stored: the repo has a sprint length and a deadline but no round counter, so
 * the round is counted off the moment the space took on the charter. Returns
 * null unless both fields are set — a made-up "Round 1" on a space that never
 * declared a sprint would be a worse answer than the last-activity line the UI
 * falls back to.
 */
export function sprintLine(
  lab: Pick<
    VentureRow,
    'sprint_length_weeks' | 'sprint_deadline' | 'venture_since' | 'promoted_at' | 'created_at'
  >,
  now: number = Date.now(),
): { round: number; daysLeft: number } | null {
  if (!lab.sprint_length_weeks || !lab.sprint_deadline) return null;
  const startedAt = Date.parse(lab.venture_since ?? lab.promoted_at ?? lab.created_at);
  if (Number.isNaN(startedAt)) return null;
  const sprintMs = lab.sprint_length_weeks * 7 * DAY_MS;
  const round = Math.max(1, Math.floor(Math.max(0, now - startedAt) / sprintMs) + 1);
  return { round, daysLeft: Math.ceil((Date.parse(lab.sprint_deadline) - now) / DAY_MS) };
}

/**
 * Where a Maal stands against the demotion clock (ruling 2). `warnedAt` is set
 * by the sweep; the deadline is the LATER of the two conditions the RPC checks,
 * because both must hold. Any activity clears `demotion_warned_at` in the DB
 * trigger, so a warned venture that revives simply stops reporting one.
 */
export interface DemotionClock {
  warnedAt: string;
  demoteAfter: string;
  daysIdle: number;
}

export function demotionClock(
  lab: Pick<VentureRow, 'space_mode' | 'demotion_warned_at' | 'last_activity_at'>,
  now: number = Date.now(),
): DemotionClock | null {
  if (lab.space_mode !== 'venture' || !lab.demotion_warned_at) return null;
  const lastActivity = Date.parse(lab.last_activity_at);
  const byTimeout = lastActivity + VENTURE_TIMEOUT_DAYS * DAY_MS;
  const byGrace = Date.parse(lab.demotion_warned_at) + VENTURE_WARN_GRACE_DAYS * DAY_MS;
  return {
    warnedAt: lab.demotion_warned_at,
    demoteAfter: new Date(Math.max(byTimeout, byGrace)).toISOString(),
    daysIdle: Math.floor((now - lastActivity) / DAY_MS),
  };
}

// --- shared hydration --------------------------------------------------------

/** Member cities for the 7a founder line ("Aasaase {name} · {city}"). */
async function fetchCities(admin: Admin, userIds: string[]): Promise<Map<string, string | null>> {
  const cities = new Map<string, string | null>();
  if (userIds.length === 0) return cities;
  const { data, error } = await admin
    .from('profiles')
    .select('user_id, location_city')
    .in('user_id', userIds);
  if (error) throw new Error(`city hydration failed: ${error.message}`);
  for (const row of data ?? []) cities.set(row.user_id, row.location_city);
  return cities;
}

/** The caller's membership row on a venture (service role — authoritative). */
export async function loadVentureMembership(
  admin: Admin,
  labId: string,
  userId: string,
): Promise<{ role: Enums<'lab_member_role'>; status: Enums<'lab_member_status'> } | null> {
  const { data, error } = await admin
    .from('lab_members')
    .select('role, status')
    .eq('lab_id', labId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`venture membership lookup failed: ${error.message}`);
  return data ?? null;
}

/** Resolve the viewer's capabilities on a venture in one call. */
export async function getVentureViewer(
  ctx: AuthContext,
  lab: VentureRow,
  admin: Admin = getSupabaseAdmin(),
): Promise<VentureViewer> {
  const membership = await loadVentureMembership(admin, lab.id, ctx.appUser.id);
  return resolveVentureViewer(lab, ctx.appUser.id, ctx.appUser, membership);
}

/** The venture's current weight scheme (latest effective row, or the seed). */
export async function resolveWeightScheme(
  admin: Admin,
  labId: string,
): Promise<{ weights: WeightScheme; effectiveFrom: string | null; decisionId: string | null }> {
  const { data, error } = await admin
    .from('venture_weight_schemes')
    .select(WEIGHT_SCHEME_COLUMNS)
    .eq('lab_id', labId)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`weight scheme lookup failed: ${error.message}`);
  if (!data) return { weights: { ...DEFAULT_WEIGHTS }, effectiveFrom: null, decisionId: null };
  return {
    weights: parseWeightScheme(data.weights),
    effectiveFrom: data.effective_from,
    decisionId: data.decision_id,
  };
}

// --- 7a: the Maal index ------------------------------------------------------

export interface VentureIndexRow {
  id: string;
  name: string;
  slug: string;
  /** 'venture' = Maal, 'lab' = Warshad. Never 'club'. */
  mode: Enums<'space_mode'>;
  /** The one-liner under the name — its summary, or the charter's problem. */
  premise: string | null;
  /** Founder (a Maal) or opener (a Warshad) + their city, for the meta line. */
  opener: AuthorRef | null;
  openerCity: string | null;
  sprint: { round: number; daysLeft: number } | null;
  lastActivityAt: string;
  isDormant: boolean;
  /** True only while the space is still sitting where the demotion left it. */
  demoted: boolean;
  memberCount: number;
  memberPreview: AuthorRef[];
  /** Members beyond the facepile — the "+N" disc, never a second query. */
  memberOverflow: number;
  /** Workstreams with no named owner ("{n} boos"), with their names. */
  openSeats: number;
  openSeatNames: string[];
  /** True when the space takes anyone ("Furan cid walba"), so seats are moot. */
  openToAnyone: boolean;
  viewerRelation: ViewerRelation;
  action: VentureJoinAction;
}

export interface VentureIndexCounts {
  all: number;
  ventures: number;
  labs: number;
  mine: number;
}

export interface VentureIndexView {
  rows: VentureIndexRow[];
  counts: VentureIndexCounts;
}

/**
 * Frame 7a. Staged work organisations only: `space_mode in ('lab','venture')`
 * is an `.in()` on the query itself, so a Koox is not fetched, not counted, and
 * not filterable back in by a component (ruling 4).
 *
 * Listing rule: a space shows when it is listed, OR when the viewer is in it —
 * otherwise "Kuwa aan ku jiro" would silently drop the viewer's own unlisted
 * venture, which is the one row they most need to find.
 */
export async function listVentureIndex(
  ctx: AuthContext,
  query: VentureIndexQuery = { filter: 'all' },
): Promise<VentureIndexView> {
  const admin = getSupabaseAdmin();
  const viewerId = ctx.appUser.id;

  const { data: mineRows, error: mineError } = await admin
    .from('lab_members')
    .select('lab_id')
    .eq('user_id', viewerId)
    .eq('status', 'active');
  if (mineError) throw new Error(`membership scan failed: ${mineError.message}`);
  const myLabIds = (mineRows ?? []).map((row) => row.lab_id);

  let rowsQuery = ctx.supabase
    .from('labs')
    .select(VENTURE_COLUMNS)
    .in('space_mode', WORK_ORG_MODES);
  rowsQuery =
    myLabIds.length > 0
      ? rowsQuery.or(`is_listed.eq.true,id.in.(${myLabIds.join(',')})`)
      : rowsQuery.eq('is_listed', true);
  if (query.filter === 'ventures') rowsQuery = rowsQuery.eq('space_mode', 'venture');
  if (query.filter === 'labs') rowsQuery = rowsQuery.eq('space_mode', 'lab');
  if (query.filter === 'mine') {
    rowsQuery = myLabIds.length > 0 ? rowsQuery.in('id', myLabIds) : rowsQuery.eq('id', ZERO_UUID);
  }

  const { data, error } = await rowsQuery
    .order('last_activity_at', { ascending: false })
    .limit(VENTURE_INDEX_PAGE_SIZE);
  if (error) throw new Error(`venture index failed: ${error.message}`);
  const labs = (data ?? []) as unknown as VentureRow[];

  const counts = await countVentureIndex(ctx, myLabIds);
  if (labs.length === 0) return { rows: [], counts };

  // Facepile + viewerRelation come from the Phase 4 hydrator, which owns the
  // §16 member_list_visibility gate — the roster rule must live in ONE place.
  const [views, seats, cities] = await Promise.all([
    hydrateLabs(admin, viewerId, labs),
    // Every row, not just the ventures: a Warshad preparing to promote already
    // has workstreams (promotion requires one with a named owner), and a demoted
    // one keeps them. Its open seats are real seats.
    fetchOpenSeats(
      admin,
      labs.map((lab) => lab.id),
    ),
    fetchCities(admin, [...new Set(labs.map((lab) => lab.lead_user_id))]),
  ]);

  const rows = views.map((view) => {
    const lab = view.lab as VentureRow;
    const seat = seats.get(lab.id);
    return {
      id: lab.id,
      name: lab.name,
      slug: lab.slug,
      mode: lab.space_mode,
      premise: lab.short_description ?? lab.problem_statement,
      opener: view.lead,
      openerCity: cities.get(lab.lead_user_id) ?? null,
      sprint: sprintLine(lab),
      lastActivityAt: lab.last_activity_at,
      isDormant: view.isDormant,
      demoted: wasDemoted(lab),
      memberCount: view.memberCount,
      memberPreview: view.memberPreview,
      memberOverflow: Math.max(0, view.memberCount - MEMBER_PREVIEW_LIMIT),
      openSeats: seat?.count ?? 0,
      openSeatNames: seat?.names ?? [],
      openToAnyone: lab.join_mode === 'open',
      viewerRelation: view.viewerRelation,
      action: ventureJoinAction(view.viewerRelation, lab.join_mode),
    } satisfies VentureIndexRow;
  });

  return { rows, counts };
}

/**
 * Chip counts, head-only on the CALLER's client so RLS decides what is
 * countable: a viewer can never infer a space they cannot read from a number
 * here (the fetchLabCounts rule, restated for the two staged modes).
 *
 * The visibility predicate is the SAME one the row query uses — listed, or mine
 * — because a chip that says "Dhammaan · 12" over a list of 13 rows is a bug
 * the member notices before we do.
 */
async function countVentureIndex(
  ctx: AuthContext,
  myLabIds: string[],
): Promise<VentureIndexCounts> {
  const head = { count: 'exact', head: true } as const;
  const base = () => {
    const query = ctx.supabase.from('labs').select('id', head).in('space_mode', WORK_ORG_MODES);
    return myLabIds.length > 0
      ? query.or(`is_listed.eq.true,id.in.(${myLabIds.join(',')})`)
      : query.eq('is_listed', true);
  };
  const [all, ventures, labs, mine] = await Promise.all([
    base(),
    base().eq('space_mode', 'venture'),
    base().eq('space_mode', 'lab'),
    myLabIds.length > 0 ? base().in('id', myLabIds) : Promise.resolve({ count: 0, error: null }),
  ]);
  for (const result of [all, ventures, labs, mine]) {
    if (result.error) throw new Error(`venture index counts failed: ${result.error.message}`);
  }
  return {
    all: all.count ?? 0,
    ventures: ventures.count ?? 0,
    labs: labs.count ?? 0,
    mine: mine.count ?? 0,
  };
}

/** Unowned workstreams per venture — the "{n} boos" cell and its labels. */
async function fetchOpenSeats(
  admin: Admin,
  labIds: string[],
): Promise<Map<string, { count: number; names: string[] }>> {
  const seats = new Map<string, { count: number; names: string[] }>();
  if (labIds.length === 0) return seats;
  const { data, error } = await admin
    .from('venture_workstreams')
    .select('lab_id, name, position')
    .in('lab_id', labIds)
    .is('owner_user_id', null)
    .order('position', { ascending: true });
  if (error) throw new Error(`open seats lookup failed: ${error.message}`);
  for (const row of data ?? []) {
    const seat = seats.get(row.lab_id) ?? { count: 0, names: [] };
    seat.count += 1;
    seat.names.push(row.name);
    seats.set(row.lab_id, seat);
  }
  return seats;
}

// --- 7b/7e: the overview -----------------------------------------------------

export interface WorkstreamView {
  id: string;
  name: string;
  status: Enums<'venture_workstream_status'>;
  position: number;
  /** null = "Boos furan": an open seat is a state, not a missing owner. */
  owner: AuthorRef | null;
  taskCount: number;
  openTaskCount: number;
}

export interface DecisionView {
  id: string;
  title: string;
  decision: string;
  decidedAt: string;
  author: AuthorRef | null;
  /**
   * ALWAYS null today, and deliberately so. 7b shows post-close tallies only,
   * and the repo has no ballot table behind `lab_decisions` — so there is no
   * closed tally to show and there must never be a running one. The field
   * exists so the vote mechanic can fill it without a shape change; a UI that
   * invents numbers for it is inventing a vote.
   */
  tally: { agreed: number; rejected: number } | null;
}

export interface ApplicationView {
  userId: string;
  applicant: AuthorRef | null;
  /** The applicant's first declared skill — the "{skill} · …" line on 7b. */
  skill: string | null;
  requestedWorkstream: { id: string; name: string } | null;
  requestedAt: string | null;
}

export interface MemberRailEntry {
  user: AuthorRef | null;
  role: Enums<'lab_member_role'>;
  specialization: Enums<'lab_member_specialization'> | null;
  joinedAt: string | null;
}

export interface VentureOverview {
  lab: VentureRow;
  viewer: VentureViewer;
  charter: {
    problem: string | null;
    hypothesis: string | null;
    success: string | null;
    completedAt: string | null;
    updatedAt: string;
  };
  /** `ratio` is null when no target was declared — a meter with no end. */
  goal: {
    statement: string | null;
    unit: string | null;
    target: number | null;
    progress: number;
    ratio: number | null;
  };
  workstreams: WorkstreamView[];
  decisions: DecisionView[];
  /** Populated for managers only — an applications rail is a lead surface. */
  applications: ApplicationView[];
  members: MemberRailEntry[];
  memberCount: number;
  visibility: {
    publicPage: boolean;
    ledgerOpenToMembers: boolean;
    hoursLeadsOnly: boolean;
  };
  capitalNeed: CapitalNeedRow | null;
  isDormant: boolean;
  demotion: DemotionClock | null;
}

/**
 * Frames 7b (member/lead) and 7e (non-member). ONE model for both: 7e is not a
 * different page, it is this page with an empty board and an empty ledger,
 * which is exactly what RLS returns to a non-member. Workstreams and members
 * stay readable because the space's own visibility says so — that is the
 * promise "Waxa dadweynahu arkaan" makes.
 */
export async function getVentureOverview(
  ctx: AuthContext,
  lab: VentureRow,
): Promise<VentureOverview> {
  const admin = getSupabaseAdmin();
  const viewer = await getVentureViewer(ctx, lab, admin);

  const [
    workstreamsResult,
    decisionsResult,
    rosterResult,
    countResult,
    applicationsResult,
    tasksResult,
    needResult,
  ] = await Promise.all([
    ctx.supabase
      .from('venture_workstreams')
      .select(WORKSTREAM_COLUMNS)
      .eq('lab_id', lab.id)
      .order('position', { ascending: true }),
    ctx.supabase
      .from('lab_decisions')
      .select('id, title, decision, decided_at, created_by_user_id')
      .eq('lab_id', lab.id)
      .eq('status', 'published')
      .order('decided_at', { ascending: false })
      .limit(OVERVIEW_DECISIONS_LIMIT),
    // The ROSTER goes through the caller's RLS (can_read_lab_roster owns the
    // §16 member_list_visibility rule) — a private roster returns nothing.
    ctx.supabase
      .from('lab_members')
      .select('user_id, role, specialization, joined_at')
      .eq('lab_id', lab.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: true }),
    // The COUNT does not: 7e shows "Xubno · {n}" before you join, which is
    // exactly the count-without-roster split the directory cards use.
    admin
      .from('lab_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('lab_id', lab.id)
      .eq('status', 'active'),
    // Applications are a LEAD surface — not fetched at all for anyone else.
    viewer.canManage
      ? admin
          .from('lab_members')
          .select('user_id, requested_at, requested_workstream_id')
          .eq('lab_id', lab.id)
          .eq('status', 'requested')
          .order('requested_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    ctx.supabase.from('venture_tasks').select('workstream_id, status').eq('lab_id', lab.id),
    ctx.supabase
      .from('venture_capital_needs')
      .select(CAPITAL_NEED_COLUMNS)
      .eq('lab_id', lab.id)
      .order('declared_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (workstreamsResult.error)
    throw new Error(`workstreams failed: ${workstreamsResult.error.message}`);
  if (decisionsResult.error) throw new Error(`decisions failed: ${decisionsResult.error.message}`);
  if (rosterResult.error) throw new Error(`members failed: ${rosterResult.error.message}`);
  if (countResult.error) throw new Error(`member count failed: ${countResult.error.message}`);
  if (applicationsResult.error)
    throw new Error(`applications failed: ${applicationsResult.error.message}`);
  if (tasksResult.error) throw new Error(`task counts failed: ${tasksResult.error.message}`);
  if (needResult.error) throw new Error(`capital need failed: ${needResult.error.message}`);

  const workstreams = (workstreamsResult.data ?? []) as unknown as WorkstreamRow[];
  const active = rosterResult.data ?? [];
  const requested = applicationsResult.data ?? [];

  const authors = await fetchProfiles(admin, [
    ...workstreams.map((row) => row.owner_user_id),
    ...active.map((row) => row.user_id),
    ...requested.map((row) => row.user_id),
    ...(decisionsResult.data ?? []).map((row) => row.created_by_user_id),
  ]);
  const skills = viewer.canManage
    ? await fetchSkills(
        admin,
        requested.map((row) => row.user_id),
      )
    : new Map<string, string[]>();

  const taskCounts = new Map<string, { total: number; open: number }>();
  for (const task of tasksResult.data ?? []) {
    const key = task.workstream_id ?? '';
    const counts = taskCounts.get(key) ?? { total: 0, open: 0 };
    counts.total += 1;
    if (task.status !== 'verified') counts.open += 1;
    taskCounts.set(key, counts);
  }

  const workstreamNames = new Map(workstreams.map((row) => [row.id, row.name]));

  return {
    lab,
    viewer,
    charter: {
      problem: lab.problem_statement,
      hypothesis: lab.hypothesis,
      success: lab.success_definition,
      completedAt: lab.charter_completed_at,
      updatedAt: lab.updated_at,
    },
    goal: {
      statement: lab.goal_statement,
      unit: lab.goal_unit,
      target: lab.goal_target,
      progress: lab.goal_progress,
      ratio:
        lab.goal_target && lab.goal_target > 0
          ? Math.min(1, lab.goal_progress / lab.goal_target)
          : null,
    },
    workstreams: workstreams.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      position: row.position,
      owner: row.owner_user_id ? (authors.get(row.owner_user_id) ?? null) : null,
      taskCount: taskCounts.get(row.id)?.total ?? 0,
      openTaskCount: taskCounts.get(row.id)?.open ?? 0,
    })),
    decisions: (decisionsResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      decision: row.decision,
      decidedAt: row.decided_at,
      author: authors.get(row.created_by_user_id) ?? null,
      tally: null,
    })),
    applications: requested.map((row) => ({
      userId: row.user_id,
      applicant: authors.get(row.user_id) ?? null,
      skill: skills.get(row.user_id)?.[0] ?? null,
      requestedWorkstream: row.requested_workstream_id
        ? {
            id: row.requested_workstream_id,
            name: workstreamNames.get(row.requested_workstream_id) ?? '',
          }
        : null,
      requestedAt: row.requested_at,
    })),
    members: active.map((row) => ({
      user: authors.get(row.user_id) ?? null,
      role: row.role,
      specialization: row.specialization,
      joinedAt: row.joined_at,
    })),
    memberCount: countResult.count ?? 0,
    visibility: {
      publicPage: lab.visibility === 'public',
      ledgerOpenToMembers: lab.ledger_visibility === 'members',
      hoursLeadsOnly: lab.hours_visibility === 'leads',
    },
    capitalNeed: (needResult.data as unknown as CapitalNeedRow | null) ?? null,
    isDormant: Boolean(lab.dormant_since),
    demotion: demotionClock(lab),
  };
}

// --- 7c: the work board ------------------------------------------------------

export interface TaskView {
  id: string;
  title: string;
  status: Enums<'venture_task_status'>;
  workstream: { id: string; name: string } | null;
  assignee: AuthorRef | null;
  /** Hours logged against this task — the "{n} saac" on a board card. */
  hours: number;
  /** Drives the guul star on a done card (the one earned orange mark here). */
  attested: boolean;
  updatedAt: string;
}

export interface VentureBoard {
  columns: Record<BoardColumn, TaskView[]>;
  counts: Record<BoardColumn, number>;
  workstreams: Array<{ id: string; name: string; status: Enums<'venture_workstream_status'> }>;
  /** The active filter chip, echoed back so the UI never guesses. */
  workstreamId: string | null;
  /** The viewer's OWN hours this week — never another member's (7c is a "you" meter). */
  viewerHoursThisWeek: number;
  viewer: VentureViewer;
}

/**
 * Frame 7c. Tasks come back under the caller's RLS, which is members-only for
 * `venture_tasks` — a non-member gets four empty columns, not a 403, and the
 * overview above still tells them what the venture is.
 *
 * One page covers the whole board (4 × BOARD_COLUMN_LIMIT, newest first) and
 * the column counts are counted off that page: past 200 open tasks a header
 * count would read low. That is a scale problem to solve with a real count
 * query when a venture ever gets there, not a correctness one at alpha.
 */
export async function getVentureBoard(
  ctx: AuthContext,
  lab: VentureRow,
  query: BoardQuery = {},
): Promise<VentureBoard> {
  const admin = getSupabaseAdmin();
  const viewer = await getVentureViewer(ctx, lab, admin);
  const weekStart = new Date(startOfWeek()).toISOString();

  let tasksQuery = ctx.supabase
    .from('venture_tasks')
    .select(TASK_COLUMNS)
    .eq('lab_id', lab.id)
    .order('updated_at', { ascending: false })
    .limit(BOARD_COLUMN_LIMIT * BOARD_COLUMNS.length);
  if (query.workstreamId) tasksQuery = tasksQuery.eq('workstream_id', query.workstreamId);

  const [tasksResult, workstreamsResult, weekResult] = await Promise.all([
    tasksQuery,
    ctx.supabase
      .from('venture_workstreams')
      .select('id, name, status, position')
      .eq('lab_id', lab.id)
      .order('position', { ascending: true }),
    ctx.supabase
      .from('work_events')
      .select('quantity')
      .eq('lab_id', lab.id)
      .eq('member_user_id', ctx.appUser.id)
      .eq('event_type', 'hours')
      .gte('occurred_at', weekStart),
  ]);
  if (tasksResult.error) throw new Error(`board failed: ${tasksResult.error.message}`);
  if (workstreamsResult.error)
    throw new Error(`workstreams failed: ${workstreamsResult.error.message}`);
  if (weekResult.error) throw new Error(`week meter failed: ${weekResult.error.message}`);

  const tasks = (tasksResult.data ?? []) as unknown as TaskRow[];
  const [authors, hoursByTask] = await Promise.all([
    fetchProfiles(
      admin,
      tasks.map((task) => task.assignee_user_id),
    ),
    fetchTaskHours(
      ctx,
      tasks.map((task) => task.id),
    ),
  ]);
  const workstreamNames = new Map(
    (workstreamsResult.data ?? []).map((row) => [row.id, row.name] as const),
  );

  const columns = emptyColumns<TaskView>();
  const counts = emptyCounts();
  for (const task of tasks) {
    const column = TASK_STATUS_COLUMN[task.status];
    counts[column] += 1;
    if (columns[column].length >= BOARD_COLUMN_LIMIT) continue;
    columns[column].push({
      id: task.id,
      title: task.title,
      status: task.status,
      workstream: task.workstream_id
        ? { id: task.workstream_id, name: workstreamNames.get(task.workstream_id) ?? '' }
        : null,
      assignee: task.assignee_user_id ? (authors.get(task.assignee_user_id) ?? null) : null,
      hours: hoursByTask.get(task.id) ?? 0,
      attested: task.attested_by_user_id !== null || task.status === 'verified',
      updatedAt: task.updated_at,
    });
  }

  return {
    columns,
    counts,
    workstreams: (workstreamsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
    })),
    workstreamId: query.workstreamId ?? null,
    viewerHoursThisWeek: (weekResult.data ?? []).reduce(
      (sum, row) => sum + Number(row.quantity),
      0,
    ),
    viewer,
  };
}

function emptyColumns<T>(): Record<BoardColumn, T[]> {
  return { planned: [], inProgress: [], attestation: [], done: [] };
}

function emptyCounts(): Record<BoardColumn, number> {
  return { planned: 0, inProgress: 0, attestation: 0, done: 0 };
}

/** Hours per task, under the CALLER's RLS (so the hours gate still applies). */
async function fetchTaskHours(ctx: AuthContext, taskIds: string[]): Promise<Map<string, number>> {
  const hours = new Map<string, number>();
  const ids = taskIds.filter(Boolean);
  if (ids.length === 0) return hours;
  const { data, error } = await ctx.supabase
    .from('work_events')
    .select('task_id, quantity')
    .in('task_id', ids)
    .eq('event_type', 'hours');
  if (error) throw new Error(`task hours failed: ${error.message}`);
  for (const row of data ?? []) {
    if (!row.task_id) continue;
    hours.set(row.task_id, (hours.get(row.task_id) ?? 0) + Number(row.quantity));
  }
  return hours;
}

// --- 7d/7g: the ledger -------------------------------------------------------

export interface LedgerMemberRow {
  userId: string;
  member: AuthorRef | null;
  role: Enums<'lab_member_role'> | null;
  /**
   * null = the hours toggle hides this member's hours from this viewer.
   *
   * The four per-TYPE columns below fold with it and null together, never
   * separately: see the note in getVentureLedger for why leaving them behind
   * would hand the hidden number straight back.
   */
  hours: number | null;
  codeCount: number | null;
  designCount: number | null;
  introCount: number | null;
  moneyCents: number | null;
  units: number;
  /** Units carrying at least one attestation — the witnessed part of a share. */
  verifiedUnits: number;
  eventCount: number;
  /** units / sum(units). Computed on every read; never stored (ruling 5). */
  share: number;
}

export interface LedgerEventView {
  id: string;
  seq: number;
  member: AuthorRef | null;
  memberUserId: string;
  type: Enums<'work_event_type'>;
  quantity: number;
  unitWeight: number;
  units: number;
  note: string | null;
  task: { id: string; title: string } | null;
  occurredAt: string;
  attestationCount: number;
  /**
   * A reversal renders as ITSELF — a muted row that says what it undid — never
   * as a hole where the original used to be, and never by mutating the row it
   * points at. `reversesEventId` is the link the UI draws.
   */
  isReversal: boolean;
  reversesEventId: string | null;
}

export interface VentureLedger {
  lab: VentureRow;
  viewer: VentureViewer;
  members: LedgerMemberRow[];
  stats: {
    totalHours: number;
    totalUnits: number;
    eventCount: number;
    contributorCount: number;
    /** Recorded, never moved. The 7d/7g card renders it and it reads $0. */
    moneyCents: number;
  };
  weights: { weights: WeightScheme; effectiveFrom: string | null; decisionId: string | null };
  /**
   * null WITH `trailError` set is state m4: the totals above are the last
   * verified ones and the ledger itself lost nothing — an empty array means the
   * venture genuinely has no events yet. The two must never render the same.
   */
  trail: LedgerEventView[] | null;
  trailError: boolean;
  filters: { memberId: string | null; type: WorkEventType | null; days: number };
}

/**
 * Frames 7d (desktop table) and 7g (mobile cards + event trail) — ONE model,
 * full capability on both (ruling 1).
 *
 * The tally RPC is SECURITY DEFINER and ungated by design, so readability is
 * decided HERE, before it is called: a caller who may not read the ledger gets
 * a 403 rather than a zeroed table, because a zeroed table is a lie about the
 * venture rather than a statement about the caller.
 */
export async function getVentureLedger(
  ctx: AuthContext,
  lab: VentureRow,
  query: LedgerQuery = {},
): Promise<VentureLedger> {
  const admin = getSupabaseAdmin();
  const viewer = await getVentureViewer(ctx, lab, admin);
  if (!viewer.canReadLedger) throw new ApiError('forbidden', 403);

  const days = query.days ?? LEDGER_DEFAULT_DAYS;
  const since = new Date(Date.now() - days * DAY_MS).toISOString();

  const [tallyResult, weights, memberRows] = await Promise.all([
    admin.rpc('venture_contribution_tally', { p_lab_id: lab.id }),
    resolveWeightScheme(admin, lab.id),
    admin.from('lab_members').select('user_id, role').eq('lab_id', lab.id),
  ]);
  if (tallyResult.error) throw new Error(`contribution tally failed: ${tallyResult.error.message}`);
  if (memberRows.error) throw new Error(`member roles failed: ${memberRows.error.message}`);
  const tally = tallyResult.data ?? [];
  const roles = new Map((memberRows.data ?? []).map((row) => [row.user_id, row.role] as const));

  const authors = await fetchProfiles(
    admin,
    tally.map((row) => row.member_user_id),
  );

  const stats = {
    totalHours: tally.reduce((sum, row) => sum + Number(row.hours), 0),
    totalUnits: tally.reduce((sum, row) => sum + row.units, 0),
    eventCount: tally.reduce((sum, row) => sum + row.event_count, 0),
    contributorCount: tally.length,
    moneyCents: tally.reduce((sum, row) => sum + Number(row.money_cents), 0),
  };

  // The 7b hours toggle, folded: with hours_visibility = 'leads' a member sees
  // their OWN row in full, the venture-wide totals, and a dash where another
  // member's per-type numbers would be.
  //
  // The WHOLE per-type breakdown folds, not just `hours`, and it must stay that
  // way. `units = round(quantity * unit_weight)` summed, so a row that keeps
  // codeCount / designCount / introCount / moneyCents beside `units` states a
  // one-unknown equation: hours = (units - 12·code - 10·design - 25·intro) / 8,
  // solvable by any member with the weights card open — which the same screen
  // shows. Nulling only `hours` hides the column and publishes the number.
  // Four unknowns behind one total do not invert; one does. Do NOT "restore"
  // these columns to make the table look fuller.
  //
  // `units`, `verifiedUnits` and `share` stay: they are what the ledger is FOR,
  // and hiding them to make the fold airtight would hide the venture from
  // itself. The venture-wide totals stay too — a total is exactly what
  // maal.visHoursLeadsHint promises other members will still see.
  const members = computeShares(
    tally.map((row) => {
      const ownRow = row.member_user_id === viewer.userId;
      const readsBreakdown = viewer.canReadHours || ownRow;
      return {
        userId: row.member_user_id,
        member: authors.get(row.member_user_id) ?? null,
        role: roles.get(row.member_user_id) ?? null,
        hours: readsBreakdown ? Number(row.hours) : null,
        codeCount: readsBreakdown ? row.code_count : null,
        designCount: readsBreakdown ? row.design_count : null,
        introCount: readsBreakdown ? row.intro_count : null,
        moneyCents: readsBreakdown ? Number(row.money_cents) : null,
        units: row.units,
        verifiedUnits: row.verified_units,
        eventCount: row.event_count,
      };
    }),
  ).sort((a, b) => b.units - a.units);

  const trail = await loadLedgerTrail(ctx, admin, lab.id, { ...query, days, since });

  return {
    lab,
    viewer,
    members,
    stats,
    weights,
    trail: trail.rows,
    trailError: trail.failed,
    filters: { memberId: query.memberId ?? null, type: query.type ?? null, days },
  };
}

/**
 * The event trail. Read under the CALLER's RLS so the hours-column policy is
 * enforced by the DB, and wrapped: state m4 keeps the totals on screen when the
 * detail read fails, because "we could not load the list" and "the ledger lost
 * something" are different sentences and only one of them is true.
 */
async function loadLedgerTrail(
  ctx: AuthContext,
  admin: Admin,
  labId: string,
  query: LedgerQuery & { days: number; since: string },
): Promise<{ rows: LedgerEventView[] | null; failed: boolean }> {
  try {
    let eventsQuery = ctx.supabase
      .from('work_events')
      .select(WORK_EVENT_COLUMNS)
      .eq('lab_id', labId)
      .gte('occurred_at', query.since)
      .order('seq', { ascending: false })
      .limit(LEDGER_TRAIL_LIMIT);
    if (query.memberId) eventsQuery = eventsQuery.eq('member_user_id', query.memberId);
    if (query.type) eventsQuery = eventsQuery.eq('event_type', query.type);

    const { data, error } = await eventsQuery;
    if (error) throw new Error(error.message);
    const events = (data ?? []) as unknown as WorkEventRow[];
    if (events.length === 0) return { rows: [], failed: false };

    const [attestations, authors, tasks] = await Promise.all([
      ctx.supabase
        .from('work_event_attestations')
        .select('work_event_id')
        .in(
          'work_event_id',
          events.map((row) => row.id),
        ),
      fetchProfiles(
        admin,
        events.map((row) => row.member_user_id),
      ),
      fetchTaskTitles(
        ctx,
        events.map((row) => row.task_id),
      ),
    ]);
    if (attestations.error) throw new Error(attestations.error.message);

    const counts = new Map<string, number>();
    for (const row of attestations.data ?? []) {
      counts.set(row.work_event_id, (counts.get(row.work_event_id) ?? 0) + 1);
    }

    return {
      rows: events.map((row) => ({
        id: row.id,
        seq: row.seq,
        member: authors.get(row.member_user_id) ?? null,
        memberUserId: row.member_user_id,
        type: row.event_type,
        quantity: Number(row.quantity),
        unitWeight: row.unit_weight,
        units: row.units,
        note: row.note,
        task: row.task_id ? { id: row.task_id, title: tasks.get(row.task_id) ?? '' } : null,
        occurredAt: row.occurred_at,
        attestationCount: counts.get(row.id) ?? 0,
        isReversal: row.reverses_event_id !== null,
        reversesEventId: row.reverses_event_id,
      })),
      failed: false,
    };
  } catch (error) {
    console.error('[maal] ledger trail read failed:', (error as Error).message);
    return { rows: null, failed: true };
  }
}

async function fetchTaskTitles(
  ctx: AuthContext,
  taskIds: Array<string | null>,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const ids = [...new Set(taskIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return titles;
  const { data, error } = await ctx.supabase
    .from('venture_tasks')
    .select('id, title')
    .in('id', ids);
  if (error) throw new Error(`task titles failed: ${error.message}`);
  for (const row of data ?? []) titles.set(row.id, row.title);
  return titles;
}

// --- 7f: capital -------------------------------------------------------------

export interface VentureCapital {
  need: CapitalNeedRow | null;
  /** The lab_decisions row behind the need — "Go'aankii" on 7f. */
  decision: { id: string; title: string; decision: string; decidedAt: string } | null;
  viewer: VentureViewer;
}

/**
 * Frame 7f. The declared need and the decision behind it — that is the whole
 * model. There is no pledge read model because there is no pledge: the controls
 * ship built and disabled with the escrow reason, and a function here that
 * returned pledges would be the first half of a capability we refused to build.
 */
export async function getVentureCapital(
  ctx: AuthContext,
  lab: VentureRow,
): Promise<VentureCapital> {
  const admin = getSupabaseAdmin();
  const viewer = await getVentureViewer(ctx, lab, admin);

  const { data, error } = await ctx.supabase
    .from('venture_capital_needs')
    .select(CAPITAL_NEED_COLUMNS)
    .eq('lab_id', lab.id)
    .order('declared_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`capital need failed: ${error.message}`);
  const need = (data as unknown as CapitalNeedRow | null) ?? null;
  if (!need?.decision_id) return { need, decision: null, viewer };

  const { data: decision, error: decisionError } = await ctx.supabase
    .from('lab_decisions')
    .select('id, title, decision, decided_at')
    .eq('id', need.decision_id)
    .maybeSingle();
  if (decisionError) throw new Error(`need decision failed: ${decisionError.message}`);

  return {
    need,
    decision: decision
      ? {
          id: decision.id,
          title: decision.title,
          decision: decision.decision,
          decidedAt: decision.decided_at,
        }
      : null,
    viewer,
  };
}

// --- profile hydration -------------------------------------------------------

/**
 * Author refs for any set of user ids (service role — cross-user hydration, the
 * one thing the admin client is for here). Nulls and duplicates are tolerated
 * so call sites can pass raw column values.
 */
async function fetchProfiles(
  admin: Admin,
  userIds: Array<string | null>,
): Promise<Map<string, AuthorRef>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  const authors = new Map<string, AuthorRef>();
  if (ids.length === 0) return authors;
  const { data, error } = await admin
    .from('profiles')
    .select('user_id, display_name, handle, avatar_path, avatar_blurhash')
    .in('user_id', ids);
  if (error) throw new Error(`author hydration failed: ${error.message}`);
  for (const row of data ?? []) {
    authors.set(row.user_id, {
      user_id: row.user_id,
      display_name: row.display_name,
      handle: row.handle,
      avatar_thumb_url: row.avatar_path ? publicMediaUrl(derivedThumbPath(row.avatar_path)) : null,
      avatar_blurhash: row.avatar_blurhash ?? null,
    });
  }
  return authors;
}

/** Declared skills, for the "{skill} · wuxuu codsanaya…" applications line. */
async function fetchSkills(admin: Admin, userIds: string[]): Promise<Map<string, string[]>> {
  const skills = new Map<string, string[]>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return skills;
  const { data, error } = await admin.from('profiles').select('user_id, skills').in('user_id', ids);
  if (error) throw new Error(`applicant skills failed: ${error.message}`);
  for (const row of data ?? []) skills.set(row.user_id, row.skills ?? []);
  return skills;
}
