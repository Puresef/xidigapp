import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';
import type { MessageKey, Translator } from '@xidig/i18n';

import { ApiError, handleApiError } from '@/lib/api';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { parseLabId } from '@/lib/labs-api';
import { getT } from '@/lib/locale';
import { LEDGER_MAX_DAYS } from '@/lib/maal/constants';
import { ledgerQuerySchema, type LedgerQuery } from '@/lib/maal/schemas';
import { getVentureViewer, loadVentureForViewer } from '@/lib/maal/views';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The 7g header button ("Soo deji CSV"). The member's own copy of the ledger.
 *
 * It exports the EVENT TRAIL, not the member totals: the totals are a read model
 * anyone can recompute, while the events are the thing the chain actually
 * records — negative rows included, because a correction is an event and an
 * export that quietly nets it away would be the one edit the ledger forbids.
 *
 * **The file is the whole history.** It does NOT reuse the screen's
 * LEDGER_TRAIL_LIMIT page: a member who exports a 400-event ledger and receives
 * 100 rows has been handed a wrong record of who built what, and nothing in a
 * CSV can tell them so. So the events are paged through here (keyset on `seq`,
 * which is unique per venture) until the venture runs out of them. If anything
 * fails part-way the whole request fails — a partial money-adjacent file must
 * never leave with a 200 on it.
 *
 * **The readability gate is the screen's gate, not a second one.** The viewer is
 * resolved by the same `getVentureViewer` the ledger read uses and refused on
 * the same `canReadLedger` predicate, and every event/attestation/task row is
 * read on the CALLER's RLS-scoped client — so `work_events_select` applies the
 * hours-column policy to the file exactly as it applies to the screen. The
 * service role is used for one thing only, as everywhere else in Maal:
 * hydrating display names.
 *
 * Window: the sheet filters are honoured when sent, but an export with no
 * filters means "everything", so `days` defaults to LEDGER_MAX_DAYS rather than
 * the screen's 90-day chip.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

type Admin = SupabaseClient<Database>;

const DAY_MS = 86_400_000;

/** Events fetched per keyset page. */
const EXPORT_PAGE_SIZE = 200;

/**
 * Ids per `.in()` filter when hydrating. The trail read has always issued
 * 100-id filters, so that is the size proven safe against the request-line
 * limit in front of PostgREST — a full history is chunked down to it rather
 * than sent as one enormous URL.
 */
const ID_CHUNK = 100;

/**
 * A guardrail, not a product cap: the whole file is built in memory before a
 * byte is sent, so an unbounded ledger would be an unbounded allocation. Past
 * this the request FAILS (500, and it pages us) instead of quietly shipping a
 * short file — the export is either the record or it is nothing. If a real
 * venture ever reaches it, the answer is a streaming export, not a smaller
 * number.
 */
const EXPORT_EVENT_MAX = 10_000;

const TYPE_KEYS: Record<Enums<'work_event_type'>, MessageKey> = {
  hours: 'maal.typeHours',
  code: 'maal.typeCode',
  design: 'maal.typeDesign',
  intro: 'maal.typeIntro',
  money: 'maal.typeMoney',
};

const EXPORT_EVENT_COLUMNS =
  'id, seq, member_user_id, event_type, quantity, units, task_id, note, occurred_at';

interface ExportEventRow {
  id: string;
  seq: number;
  member_user_id: string;
  event_type: Enums<'work_event_type'>;
  quantity: number;
  units: number;
  task_id: string | null;
  note: string | null;
  occurred_at: string;
}

/**
 * A FREE-TEXT cell: RFC 4180 quoting, plus the spreadsheet-injection guard.
 * `note` is member text and a note beginning `=`, `+`, `-`, `@`, tab or CR is
 * executed as a formula by Excel/Sheets on open — a ledger export is precisely
 * the file people open. The leading apostrophe keeps the text intact and inert.
 */
function textCell(value: string | null): string {
  if (value === null) return '';
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}

/**
 * A NUMERIC cell: bare, unquoted, and never apostrophe-prefixed. Every reversal
 * carries a negative quantity and negative units, so guarding numbers as if
 * they were text turned each correction into a string the member could not sum
 * — and corrections are exactly what someone opens this file to check. The
 * injection guard exists for text a member wrote; a number the ledger derived
 * is not that.
 */
function numberCell(value: number): string {
  return String(value);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/** Filename component: nothing that could close a quote or break the header. */
function safeSlug(slug: string): string {
  return (
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 60) || 'venture'
  );
}

/** Attestation counts, on the caller's client (RLS decides). */
async function fetchAttestationCounts(
  ctx: AuthContext,
  eventIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const group of chunks(eventIds, ID_CHUNK)) {
    const { data, error } = await ctx.supabase
      .from('work_event_attestations')
      .select('work_event_id')
      .in('work_event_id', group);
    if (error) throw new Error(`export attestations failed: ${error.message}`);
    for (const row of data ?? []) {
      counts.set(row.work_event_id, (counts.get(row.work_event_id) ?? 0) + 1);
    }
  }
  return counts;
}

/** Task titles, on the caller's client (RLS decides). */
async function fetchTaskTitles(
  ctx: AuthContext,
  taskIds: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const ids = [...new Set(taskIds.filter((id): id is string => Boolean(id)))];
  for (const group of chunks(ids, ID_CHUNK)) {
    const { data, error } = await ctx.supabase
      .from('venture_tasks')
      .select('id, title')
      .in('id', group);
    if (error) throw new Error(`export task titles failed: ${error.message}`);
    for (const row of data ?? []) titles.set(row.id, row.title);
  }
  return titles;
}

/** Display names — the one thing the service role is for here. */
async function fetchMemberNames(
  admin: Admin,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(userIds)];
  for (const group of chunks(ids, ID_CHUNK)) {
    const { data, error } = await admin
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', group);
    if (error) throw new Error(`export name hydration failed: ${error.message}`);
    for (const row of data ?? []) names.set(row.user_id, row.display_name);
  }
  return names;
}

/**
 * Every event the caller may read, newest first — the screen's order, over the
 * whole history rather than its first page. Keyset on `seq` (unique per lab, so
 * no row is repeated or skipped between pages); a short page means the caller
 * has genuinely run out of visible rows, because Postgres applies RLS before
 * the LIMIT.
 */
async function collectEvents(
  ctx: AuthContext,
  labId: string,
  query: LedgerQuery & { days: number },
): Promise<ExportEventRow[]> {
  const since = new Date(Date.now() - query.days * DAY_MS).toISOString();
  const all: ExportEventRow[] = [];
  let cursor: number | null = null;

  for (;;) {
    let page = ctx.supabase
      .from('work_events')
      .select(EXPORT_EVENT_COLUMNS)
      .eq('lab_id', labId)
      .gte('occurred_at', since)
      .order('seq', { ascending: false })
      .limit(EXPORT_PAGE_SIZE);
    if (query.memberId) page = page.eq('member_user_id', query.memberId);
    if (query.type) page = page.eq('event_type', query.type);
    if (cursor !== null) page = page.lt('seq', cursor);

    const { data, error } = await page;
    if (error) throw new Error(`ledger export read failed: ${error.message}`);
    const events = (data ?? []) as unknown as ExportEventRow[];
    if (events.length === 0) break;

    if (all.length + events.length > EXPORT_EVENT_MAX) {
      throw new Error(`ledger export exceeds ${EXPORT_EVENT_MAX} events for lab ${labId}`);
    }
    all.push(...events);

    const last = events[events.length - 1];
    if (!last || events.length < EXPORT_PAGE_SIZE) break;
    cursor = last.seq;
  }

  return all;
}

/** One CSV line per event, in the order the trail returned them. */
function eventRows(
  t: Translator,
  events: readonly ExportEventRow[],
  names: Map<string, string>,
  tasks: Map<string, string>,
  attestations: Map<string, number>,
): string[] {
  return events.map((row) =>
    [
      numberCell(row.seq),
      textCell(row.occurred_at),
      textCell(names.get(row.member_user_id) ?? null),
      textCell(t(TYPE_KEYS[row.event_type])),
      numberCell(Number(row.quantity)),
      numberCell(row.units),
      textCell(row.task_id ? (tasks.get(row.task_id) ?? null) : null),
      numberCell(attestations.get(row.id) ?? 0),
      textCell(row.note),
    ].join(','),
  );
}

export async function GET(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const query = ledgerQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    // A download is a whole ledger read; it is not a polling endpoint. Same
    // shape as the /api/me/export limit, one tier looser.
    await enforceRateLimit(`maal:export:${ctx.appUser.id}`, { max: 20, windowSeconds: 3600 });

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    // The screen's gate, restated on the screen's own resolver: a caller who may
    // not read the ledger is refused before a single event is fetched.
    const viewer = await getVentureViewer(ctx, lab, admin);
    if (!viewer.canReadLedger) throw new ApiError('forbidden', 403);

    const t = await getT();
    const header = [
      textCell(t('maal.csvSeq')),
      textCell(t('maal.csvWhen')),
      textCell(t('maal.colMember')),
      textCell(t('maal.logTypeLabel')),
      textCell(t('maal.logAmountLabel')),
      textCell(t('maal.colUnits')),
      textCell(t('maal.logTaskLabel')),
      textCell(t('maal.csvWitnesses')),
      textCell(t('maal.csvNote')),
    ].join(',');

    // State m4 on the screen keeps the totals and says the detail did not load.
    // A file cannot say that, so any failed read is a failed export — every
    // throw below reaches handleApiError before a byte of CSV is written.
    const events = await collectEvents(ctx, lab.id, {
      ...query,
      days: query.days ?? LEDGER_MAX_DAYS,
    });
    const [names, tasks, attestations] = await Promise.all([
      fetchMemberNames(
        admin,
        events.map((row) => row.member_user_id),
      ),
      fetchTaskTitles(
        ctx,
        events.map((row) => row.task_id),
      ),
      fetchAttestationCounts(
        ctx,
        events.map((row) => row.id),
      ),
    ]);
    const body = [header, ...eventRows(t, events, names, tasks, attestations)].join('\r\n');

    // U+FEFF so Excel opens UTF-8 Somali as Somali instead of mojibake.
    return new Response(`﻿${body}\r\n`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        // The slug is already ASCII by construction; re-narrowing it here means
        // a header can never be split by a value that came out of a column.
        'Content-Disposition': `attachment; filename="xidig-ledger-${safeSlug(lab.slug)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
