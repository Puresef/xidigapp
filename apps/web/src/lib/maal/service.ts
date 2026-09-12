import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums, TablesUpdate } from '@xidig/db';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError } from '@/lib/api';
import { logLabEvent, notifyLabMembers } from '@/lib/labs/service';
import { isCharterComplete } from '@/lib/labs/views';
import {
  DEFAULT_WEIGHTS,
  RECUSED_TRANSITIONS,
  TASK_TRANSITIONS,
  WORKSTREAMS_PER_VENTURE_MAX,
} from '@/lib/maal/constants';
import type {
  ContributionLogInput,
  ContributionReversalInput,
  TaskCreateInput,
  TaskTransitionInput,
  TaskUpdateInput,
  VentureGoalInput,
  VenturePromoteInput,
  VentureVisibilityInput,
  WeightSchemeInput,
  WorkstreamCreateInput,
  WorkstreamUpdateInput,
} from '@/lib/maal/schemas';
import {
  resolveWeightScheme,
  TASK_COLUMNS,
  WORK_EVENT_COLUMNS,
  WORKSTREAM_COLUMNS,
  type TaskRow,
  type VentureRow,
  type WorkEventRow,
  type WorkstreamRow,
} from '@/lib/maal/views';

/**
 * Maal domain operations (F2 §5). Every write runs through the passed-in
 * service-role `admin` client AFTER the route has done its authz check (§22
 * API-first) — the Phase 4/5 write model, and the reason `work_events` and
 * friends have SELECT-only policies.
 *
 * Three invariants live here and nowhere else:
 *
 *  1. **The ledger is append-only.** There is no UPDATE and no DELETE against
 *     `work_events` in this file, and there never will be — the DB refuses them
 *     for every role including service_role. A correction is
 *     `reverseContribution`, which INSERTS the negation. `seq`, `prev_hash` and
 *     `hash` are assigned by the DB trigger; we pass empty strings for the two
 *     hash columns exactly as the DB suite does, because they are not ours to
 *     compute.
 *  2. **Weights are resolved server-side.** A client sends "3 hours", never
 *     "3 hours at weight 40". `unit_weight` comes from the venture's current
 *     scheme and `units` is derived from it — the DB CHECK
 *     `units = round(quantity * unit_weight)` then re-derives it independently.
 *  3. **Recusal is enforced twice.** The DB has CHECK constraints on
 *     `venture_tasks`; this layer turns them into a clean 403 with §27 copy
 *     instead of a constraint violation. Nobody witnesses or approves their own
 *     work, and a lead is not an exception — they are the reason for the rule.
 *
 * There is deliberately NO pledge function, no demotion function and no
 * capital-need function. Pledging is a built-and-disabled control (escrow does
 * not exist); declaring a need is paused while the capital pathway is under
 * review (owner ruling, 12 Sep); and demotion was only ever the system's move —
 * `demote_timed_out_ventures()` from the sweep, never from a route (ruling 2) —
 * and the sweep no longer calls it while the stage ladder is under review.
 */

type Admin = SupabaseClient<Database>;

/** True for the venture's lead, a core member, or a platform admin. */
async function isVentureLead(admin: Admin, lab: VentureRow, userId: string): Promise<boolean> {
  if (lab.lead_user_id === userId) return true;
  const { data, error } = await admin
    .from('lab_members')
    .select('role, status')
    .eq('lab_id', lab.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`lead check failed: ${error.message}`);
  return data?.status === 'active' && (data.role === 'lead' || data.role === 'core');
}

/**
 * The ledger only accepts writes while the space IS a Maal. A demoted venture
 * keeps everything it wrote — the ledger is readable forever — but a Warshad
 * has no contribution surface, so appending to one would create rows no member
 * can see or correct.
 */
function requireVenture(lab: VentureRow): void {
  if (lab.space_mode !== 'venture') throw new ApiError('ledger_locked', 409);
}

// --- promotion: Warshad -> Maal ---------------------------------------------

/**
 * Warshad → Maal. Additive, exactly like promoteToLab: the id, slug, members,
 * history, updates, artifacts and decisions all survive, and the URL does not
 * move (PRD §16 — "switching mode is a Space setting, not a rebuild").
 *
 * The four preconditions, in the order a lead would hit them:
 *   * it is a Warshad (a Koox promotes to a Warshad first);
 *   * the charter is complete — problem, hypothesis, definition of success;
 *   * a goal is declared (stored, or filled in this request);
 *   * at least one workstream has a NAMED owner. This is the one that makes
 *     Maal a stage rather than a badge: a venture with no owned work is a Lab
 *     with a bigger word on it.
 *
 * `.eq('space_mode', 'lab')` is the idempotency guard — a second call finds no
 * row and answers venture_not_ready rather than re-stamping venture_since and
 * re-notifying everyone.
 */
export async function promoteToVenture(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  patch: VenturePromoteInput = {},
): Promise<VentureRow> {
  if (!isCharterComplete(lab)) throw new ApiError('charter_incomplete', 409);

  const goalStatement = patch.goalStatement ?? lab.goal_statement;
  const goalUnit = patch.goalUnit ?? lab.goal_unit;
  const goalTarget = patch.goalTarget ?? lab.goal_target;
  if (!goalStatement) throw new ApiError('venture_not_ready', 409);

  const { data: owned, error: ownedError } = await admin
    .from('venture_workstreams')
    .select('id')
    .eq('lab_id', lab.id)
    .not('owner_user_id', 'is', null)
    .limit(1);
  if (ownedError) throw new Error(`workstream check failed: ${ownedError.message}`);
  if ((owned ?? []).length === 0) throw new ApiError('venture_not_ready', 409);

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('labs')
    .update({
      space_mode: 'venture',
      venture_since: now,
      goal_statement: goalStatement,
      goal_unit: goalUnit,
      goal_target: goalTarget,
      // A re-promotion starts the demotion clock over. Leaving the previous
      // cycle's demotion_warned_at / demoted_at in place would let tonight's
      // demote_timed_out_ventures() find an old warning beside an old
      // last_activity_at and demote this venture again the same day it was
      // promoted — with no advance notice, which is the one thing ruling 2 and
      // docs/maal-f2-prereqs.md forbid. Promotion IS activity, so the clock is
      // reset here rather than waiting for the first contribution to trip the
      // touch_lab_last_activity trigger.
      demotion_warned_at: null,
      demoted_at: null,
      last_activity_at: now,
    })
    .eq('id', lab.id)
    .eq('space_mode', 'lab')
    .select('*')
    .single();
  if (error || !data) throw new ApiError('venture_not_ready', 409);

  // Seed the frame's weight scheme — but only if this venture has never had
  // one. A space that was demoted and is promoting again keeps the scheme its
  // members VOTED; re-seeding would quietly overturn a decision.
  const { data: existing, error: schemeError } = await admin
    .from('venture_weight_schemes')
    .select('id')
    .eq('lab_id', lab.id)
    .limit(1);
  if (schemeError) throw new Error(`weight scheme check failed: ${schemeError.message}`);
  if ((existing ?? []).length === 0) {
    const { error: seedError } = await admin
      .from('venture_weight_schemes')
      .insert({ lab_id: lab.id, weights: DEFAULT_WEIGHTS });
    if (seedError) throw new Error(`weight scheme seed failed: ${seedError.message}`);
  }

  await logLabEvent(admin, lab.id, actorUserId, 'promoted', { from: 'lab', to: 'venture' });
  await notifyLabMembers(admin, lab.id, {
    type: 'lab_promoted',
    actorUserId,
    payload: { to: 'venture' },
    bundleKey: `lab_promoted:${lab.id}`,
  });
  emitServer(event('venture_promoted', {}), { distinctId: actorUserId, userId: actorUserId });

  return data as unknown as VentureRow;
}

// --- venture settings --------------------------------------------------------

/** The 7b goal meter. Progress is member-declared; nothing here is measured. */
export async function updateVentureGoal(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  input: VentureGoalInput,
): Promise<VentureRow> {
  requireVenture(lab);
  const patch: TablesUpdate<'labs'> = {};
  if (input.goalStatement !== undefined) patch.goal_statement = input.goalStatement;
  if (input.goalUnit !== undefined) patch.goal_unit = input.goalUnit;
  if (input.goalTarget !== undefined) patch.goal_target = input.goalTarget;
  if (input.goalProgress !== undefined) patch.goal_progress = input.goalProgress;

  const { data, error } = await admin
    .from('labs')
    .update(patch)
    .eq('id', lab.id)
    .select('*')
    .single();
  if (error || !data) throw new Error(`goal update failed: ${error?.message ?? 'no row'}`);
  await logLabEvent(admin, lab.id, actorUserId, 'goal_updated', {
    fields: Object.keys(patch),
  });
  return data as unknown as VentureRow;
}

/**
 * The 7b visibility toggles. "Xubnaha ayaa doortay. Xidig ma dooranayo" — so
 * this is a member write, and both columns are enforced in RLS rather than
 * merely hidden in a projection.
 */
export async function updateVentureVisibility(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  input: VentureVisibilityInput,
): Promise<VentureRow> {
  const patch: TablesUpdate<'labs'> = {};
  if (input.ledgerVisibility) patch.ledger_visibility = input.ledgerVisibility;
  if (input.hoursVisibility) patch.hours_visibility = input.hoursVisibility;

  const { data, error } = await admin
    .from('labs')
    .update(patch)
    .eq('id', lab.id)
    .select('*')
    .single();
  if (error || !data) throw new Error(`visibility update failed: ${error?.message ?? 'no row'}`);
  await logLabEvent(admin, lab.id, actorUserId, 'visibility_changed', {
    fields: Object.keys(patch),
  });
  return data as unknown as VentureRow;
}

// --- workstreams -------------------------------------------------------------

export async function createWorkstream(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  input: WorkstreamCreateInput,
): Promise<WorkstreamRow> {
  const { count, error: countError } = await admin
    .from('venture_workstreams')
    .select('id', { count: 'exact', head: true })
    .eq('lab_id', lab.id);
  if (countError) throw new Error(`workstream count failed: ${countError.message}`);
  if ((count ?? 0) >= WORKSTREAMS_PER_VENTURE_MAX) throw new ApiError('invalid_request', 409);

  const { data, error } = await admin
    .from('venture_workstreams')
    .insert({
      lab_id: lab.id,
      name: input.name,
      owner_user_id: input.ownerUserId ?? null,
      status: input.status,
      position: input.position ?? count ?? 0,
    })
    .select(WORKSTREAM_COLUMNS)
    .single();
  if (error || !data) {
    // venture_workstreams_name_uq — one name per venture, case-insensitive.
    if (error?.code === '23505') throw new ApiError('invalid_request', 409);
    throw new Error(`workstream insert failed: ${error?.message ?? 'no row'}`);
  }

  await logLabEvent(admin, lab.id, actorUserId, 'workstream_added', {
    workstream_id: (data as unknown as WorkstreamRow).id,
  });
  return data as unknown as WorkstreamRow;
}

/** Rename, re-order, hand over, or open a seat (ownerUserId: null). */
export async function updateWorkstream(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  workstreamId: string,
  input: WorkstreamUpdateInput,
): Promise<WorkstreamRow> {
  const patch: TablesUpdate<'venture_workstreams'> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.ownerUserId !== undefined) patch.owner_user_id = input.ownerUserId;
  if (input.status !== undefined) patch.status = input.status;
  if (input.position !== undefined) patch.position = input.position;

  const { data, error } = await admin
    .from('venture_workstreams')
    .update(patch)
    .eq('id', workstreamId)
    .eq('lab_id', lab.id)
    .select(WORKSTREAM_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new ApiError('invalid_request', 409);
    throw new Error(`workstream update failed: ${error.message}`);
  }
  if (!data) throw new ApiError('not_found', 404);

  await logLabEvent(admin, lab.id, actorUserId, 'workstream_changed', {
    workstream_id: workstreamId,
    fields: Object.keys(patch),
  });
  return data as unknown as WorkstreamRow;
}

/**
 * Remove a workstream. Its tasks survive with `workstream_id` set to null (DB
 * ON DELETE SET NULL) — the work was still done, and the ledger events that
 * point at those tasks are untouched by construction.
 */
export async function deleteWorkstream(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  workstreamId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('venture_workstreams')
    .delete()
    .eq('id', workstreamId)
    .eq('lab_id', lab.id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`workstream delete failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);
  await logLabEvent(admin, lab.id, actorUserId, 'workstream_removed', {
    workstream_id: workstreamId,
  });
}

// --- tasks -------------------------------------------------------------------

export async function createTask(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  input: TaskCreateInput,
): Promise<TaskRow> {
  const assignee = input.assigneeUserId ?? null;
  const { data, error } = await admin
    .from('venture_tasks')
    .insert({
      lab_id: lab.id,
      workstream_id: input.workstreamId ?? null,
      title: input.title,
      status: assignee ? 'claimed' : 'open',
      assignee_user_id: assignee,
      created_by_user_id: actorUserId,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error || !data) throw new Error(`task insert failed: ${error?.message ?? 'no row'}`);
  await logLabEvent(admin, lab.id, actorUserId, 'task_added', {
    task_id: (data as unknown as TaskRow).id,
  });
  return data as unknown as TaskRow;
}

export async function updateTask(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  taskId: string,
  input: TaskUpdateInput,
): Promise<TaskRow> {
  const patch: TablesUpdate<'venture_tasks'> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.workstreamId !== undefined) patch.workstream_id = input.workstreamId;

  const { data, error } = await admin
    .from('venture_tasks')
    .update(patch)
    .eq('id', taskId)
    .eq('lab_id', lab.id)
    .select(TASK_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`task update failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);

  await logLabEvent(admin, lab.id, actorUserId, 'task_changed', {
    task_id: taskId,
    fields: Object.keys(patch),
  });
  return data as unknown as TaskRow;
}

/**
 * Move a task across the board: open → claimed → submitted → attested →
 * verified (and claimed → open, to put something back down).
 *
 * Recusal is the point of this function. The DB refuses
 * `attested_by_user_id = assignee_user_id` and the verifier equivalent with a
 * CHECK, but a constraint violation reaches a member as a 500 — so the same
 * rule is stated here first and answers 403 with the sentence that explains it.
 * Verification additionally requires a lead: 7d's copy is explicit that a
 * verified unit needs a witness — a member co-sign or a lead — and that a lead
 * cannot approve their own work.
 */
export async function transitionTask(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  taskId: string,
  input: TaskTransitionInput,
): Promise<TaskRow> {
  requireVenture(lab);

  const { data: current, error: loadError } = await admin
    .from('venture_tasks')
    .select(TASK_COLUMNS)
    .eq('id', taskId)
    .eq('lab_id', lab.id)
    .maybeSingle();
  if (loadError) throw new Error(`task lookup failed: ${loadError.message}`);
  if (!current) throw new ApiError('not_found', 404);
  const task = current as unknown as TaskRow;

  const next = input.status;
  if (!TASK_TRANSITIONS[task.status].includes(next)) throw new ApiError('invalid_request', 409);

  const recused = (RECUSED_TRANSITIONS as readonly Enums<'venture_task_status'>[]).includes(next);
  if (recused && task.assignee_user_id === actorUserId) throw new ApiError('task_recusal', 403);
  if (next === 'verified' && !(await isVentureLead(admin, lab, actorUserId))) {
    throw new ApiError('forbidden', 403);
  }

  const patch: TablesUpdate<'venture_tasks'> = {
    status: next,
    updated_at: new Date().toISOString(),
  };
  if (next === 'claimed') patch.assignee_user_id = actorUserId;
  if (next === 'open') patch.assignee_user_id = null;
  if (next === 'attested') patch.attested_by_user_id = actorUserId;
  if (next === 'verified') patch.verified_by_user_id = actorUserId;

  const { data, error } = await admin
    .from('venture_tasks')
    .update(patch)
    .eq('id', taskId)
    .eq('lab_id', lab.id)
    .eq('status', task.status) // no two members move the same card at once
    .select(TASK_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`task transition failed: ${error.message}`);
  if (!data) throw new ApiError('invalid_request', 409);

  await logLabEvent(admin, lab.id, actorUserId, 'task_moved', { task_id: taskId, to: next });
  return data as unknown as TaskRow;
}

// --- the ledger --------------------------------------------------------------

/**
 * Append one contribution. The weight is read from the venture's current
 * scheme — never from the request — and `units` is derived from it; the DB
 * CHECK re-derives the same number, so a bug here fails loudly instead of
 * inflating a share.
 *
 * `seq`, `prev_hash` and `hash` are assigned by the BEFORE INSERT trigger. The
 * columns are NOT NULL with no default, so the insert has to name them —
 * `seq: 0` and two empty strings, exactly as the DB suite writes them, and all
 * three are overwritten before the row lands. Reading them back off the
 * returned row is how a caller learns where in the chain it landed.
 */
export async function logContribution(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  input: ContributionLogInput,
): Promise<WorkEventRow> {
  requireVenture(lab);

  const { weights } = await resolveWeightScheme(admin, lab.id);
  const unitWeight = weights[input.type];

  // Round to the stored precision FIRST, then derive units from the rounded
  // value — and send the rounded value. The column is numeric(12,2) and the
  // CHECK `units = round(quantity * unit_weight)` is evaluated by Postgres in
  // exact numeric AFTER that truncation, so deriving units from the raw double
  // means the two sides can disagree: quantity 1.045 at weight 10 gives
  // Math.round(10.45) = 10 here and round(1.05 * 10) = 11 there, and the member
  // reads a valid contribution as a 500. Cents are integers, so
  // (cents * weight) / 100 lands exactly on the .5 boundary Postgres rounds
  // away from zero, instead of a hair below it.
  const quantityCents = Math.round(input.quantity * 100);
  const quantity = quantityCents / 100;
  const units = Math.round((quantityCents * unitWeight) / 100);

  const { data, error } = await admin
    .from('work_events')
    .insert({
      lab_id: lab.id,
      member_user_id: actorUserId,
      event_type: input.type,
      quantity,
      unit_weight: unitWeight,
      units,
      task_id: input.taskId ?? null,
      note: input.note ?? null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      recorded_by_user_id: actorUserId,
      seq: 0,
      prev_hash: '',
      hash: '',
    })
    .select(WORK_EVENT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`contribution insert failed: ${error?.message ?? 'no row'}`);

  emitServer(event('contribution_logged', { type: input.type }), {
    distinctId: actorUserId,
    userId: actorUserId,
  });
  return data as unknown as WorkEventRow;
}

/**
 * Correct a contribution — by INSERTING its negation, never by touching it.
 * The reversal carries the original's type and weight so the two cancel to
 * exactly zero units, its own reason, and `reverses_event_id`, which is what
 * makes it render as a reversal instead of a mysterious negative row.
 *
 * Who may: the member whose event it is, or a lead. The DB allows one reversal
 * per event (a partial unique index) and refuses to reverse a reversal.
 */
export async function reverseContribution(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  eventId: string,
  input: ContributionReversalInput,
): Promise<WorkEventRow> {
  requireVenture(lab);

  const { data: original, error: loadError } = await admin
    .from('work_events')
    .select(WORK_EVENT_COLUMNS)
    .eq('id', eventId)
    .eq('lab_id', lab.id)
    .maybeSingle();
  if (loadError) throw new Error(`event lookup failed: ${loadError.message}`);
  if (!original) throw new ApiError('not_found', 404);
  const source = original as unknown as WorkEventRow;

  if (source.reverses_event_id !== null) throw new ApiError('invalid_request', 409);
  if (source.member_user_id !== actorUserId && !(await isVentureLead(admin, lab, actorUserId))) {
    throw new ApiError('forbidden', 403);
  }

  const { data, error } = await admin
    .from('work_events')
    .insert({
      lab_id: lab.id,
      member_user_id: source.member_user_id,
      event_type: source.event_type,
      quantity: -Number(source.quantity),
      unit_weight: source.unit_weight,
      units: -source.units,
      task_id: source.task_id,
      note: input.reason,
      occurred_at: new Date().toISOString(),
      recorded_by_user_id: actorUserId,
      reverses_event_id: source.id,
      seq: 0,
      prev_hash: '',
      hash: '',
    })
    .select(WORK_EVENT_COLUMNS)
    .single();
  if (error || !data) {
    // work_events_reversal_once_uq — an event is corrected once, not repeatedly.
    if (error?.code === '23505') throw new ApiError('contribution_already_reversed', 409);
    throw new Error(`reversal insert failed: ${error?.message ?? 'no row'}`);
  }

  await logLabEvent(admin, lab.id, actorUserId, 'contribution_reversed', {
    event_id: eventId,
    reverses_seq: source.seq,
  });
  emitServer(event('contribution_reversed', {}), {
    distinctId: actorUserId,
    userId: actorUserId,
  });
  return data as unknown as WorkEventRow;
}

/**
 * Witness someone's contribution ("Marag"). Never your own — the same recusal
 * as the board, restated at the ledger because that is where it buys a verified
 * unit. Re-attesting is a no-op, not an error: the PK already says so.
 */
export async function attestContribution(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  eventId: string,
): Promise<void> {
  requireVenture(lab);

  const { data: target, error: loadError } = await admin
    .from('work_events')
    .select('id, member_user_id')
    .eq('id', eventId)
    .eq('lab_id', lab.id)
    .maybeSingle();
  if (loadError) throw new Error(`event lookup failed: ${loadError.message}`);
  if (!target) throw new ApiError('not_found', 404);
  if (target.member_user_id === actorUserId) throw new ApiError('attestation_recusal', 403);

  const { error } = await admin
    .from('work_event_attestations')
    .upsert(
      { work_event_id: eventId, attester_user_id: actorUserId },
      { onConflict: 'work_event_id,attester_user_id', ignoreDuplicates: true },
    );
  if (error) throw new Error(`attestation insert failed: ${error.message}`);

  emitServer(event('contribution_attested', {}), {
    distinctId: actorUserId,
    userId: actorUserId,
  });
}

/**
 * Record a member-voted weight scheme. `decisionId` is required and points at
 * the `lab_decisions` row that carries the vote: 7d promises that changing the
 * weights "waa go'aan la cod-bixiyo … wuxuuna galayaa diiwaanka go'aannada", so
 * a scheme with no decision behind it must not be insertable.
 *
 * Nothing is edited: past events keep the weight they were recorded with, and
 * the new row simply becomes the one `resolveWeightScheme` reads next.
 */
export async function recordWeightScheme(
  admin: Admin,
  lab: VentureRow,
  actorUserId: string,
  input: WeightSchemeInput,
): Promise<void> {
  requireVenture(lab);

  const { data: decision, error: decisionError } = await admin
    .from('lab_decisions')
    .select('id')
    .eq('id', input.decisionId)
    .eq('lab_id', lab.id)
    .maybeSingle();
  if (decisionError) throw new Error(`decision lookup failed: ${decisionError.message}`);
  if (!decision) throw new ApiError('invalid_request', 409);

  const { error } = await admin.from('venture_weight_schemes').insert({
    lab_id: lab.id,
    weights: input.weights,
    decision_id: input.decisionId,
  });
  if (error) throw new Error(`weight scheme insert failed: ${error.message}`);

  await logLabEvent(admin, lab.id, actorUserId, 'weights_changed', {
    decision_id: input.decisionId,
  });
}

// --- capital (7f) ------------------------------------------------------------

// There is no capital-need write here. Declaring a need is PAUSED (owner
// ruling, 12 Sep) until the capital/P3 review approves a model with legal and
// product sign-off — POST /api/labs/[id]/capital refuses with
// `capital_pathway_under_review`. Needs recorded before the pause stay in
// `venture_capital_needs`, read-only (clients hold no insert/update/delete).
// There is still no `pledge()` either: pledge controls ship built and disabled
// with the escrow reason, and a service function would be a claim that money
// can move.
