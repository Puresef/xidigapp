import { describe, expect, it, vi } from 'vitest';

import type { Tables } from '@xidig/db';

import { ApiError } from '@/lib/api';

import type { DigestCandidates } from './candidates';
import { selectDigestRecipients, sendDigestEmails } from './send';

/**
 * Digest bulk email channel (extras plan item 6). An in-memory database
 * enforcing the real digest_email_sends unique (edition_id, user_id)
 * constraint proves the load-bearing rules:
 *   * recipient selection: active human members only — opted-out
 *     (digest_frequency='off' or weekly_digest/email pref off), AI accounts,
 *     non-active accounts and members without an email never receive it;
 *   * idempotency: a re-run of the same edition sends ZERO duplicates;
 *   * suppression + failure isolation: one bad address never blocks the rest;
 *   * every email carries the manage-preferences link.
 */

type Row = Record<string, unknown>;

interface FakeTables {
  users: Row[];
  user_settings: Row[];
  notification_prefs: Row[];
  digest_email_sends: Row[];
}

/** Fake service client over named in-memory tables (registry.test.ts style). */
function makeFakeAdmin(seed: Partial<FakeTables> = {}) {
  const tables: FakeTables = {
    users: seed.users ?? [],
    user_settings: seed.user_settings ?? [],
    notification_prefs: seed.notification_prefs ?? [],
    digest_email_sends: seed.digest_email_sends ?? [],
  };
  let seq = 0;

  function from(table: string) {
    const rows = (tables as unknown as Record<string, Row[]>)[table] ?? [];
    const eqs: Array<[string, unknown]> = [];
    const ins: Array<[string, readonly unknown[]]> = [];
    const notNullCols: string[] = [];
    let orderCol: string | null = null;
    let rangeArg: [number, number] | null = null;
    let upsertRows: Row[] | null = null;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } | undefined;
    let updatePayload: Row | null = null;

    const matches = (r: Row) =>
      eqs.every(([c, v]) => r[c] === v) &&
      ins.every(([c, vs]) => vs.includes(r[c])) &&
      notNullCols.every((c) => r[c] !== null && r[c] !== undefined);

    async function resolve(): Promise<{ data: Row[] | null; error: null }> {
      if (upsertRows) {
        const conflictCols = (upsertOpts?.onConflict ?? '').split(',');
        const inserted: Row[] = [];
        for (const row of upsertRows) {
          const dup = rows.find((r) => conflictCols.every((c) => r[c] === row[c]));
          if (dup) continue; // ignoreDuplicates → ON CONFLICT DO NOTHING
          const withDefaults: Row = {
            id: `send-${++seq}`,
            status: 'pending',
            error: null,
            sent_at: null,
            ...row,
          };
          rows.push(withDefaults);
          inserted.push(withDefaults);
        }
        return { data: inserted, error: null };
      }
      if (updatePayload) {
        for (const r of rows.filter(matches)) Object.assign(r, updatePayload);
        return { data: null, error: null };
      }
      let out = rows.filter(matches);
      if (orderCol) {
        const col = orderCol;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1));
      }
      if (rangeArg) out = out.slice(rangeArg[0], rangeArg[1] + 1);
      return { data: out, error: null };
    }

    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => (eqs.push([c, v]), q),
      in: (c: string, vs: readonly unknown[]) => (ins.push([c, vs]), q),
      not: (c: string, op: string, v: unknown) => {
        if (op === 'is' && v === null) notNullCols.push(c);
        return q;
      },
      order: (c: string) => ((orderCol = c), q),
      range: (a: number, b: number) => ((rangeArg = [a, b]), q),
      upsert: (r: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) => (
        (upsertRows = Array.isArray(r) ? r : [r]), (upsertOpts = o), q
      ),
      update: (p: Row) => ((updatePayload = p), q),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        resolve().then(onF, onR),
    };
    return q;
  }

  return { admin: { from } as never, tables };
}

function user(id: string, overrides: Row = {}): Row {
  return { id, email: `${id}@example.so`, status: 'active', is_ai: false, ...overrides };
}

function payload(overrides: Partial<DigestCandidates> = {}): DigestCandidates {
  return {
    periodKey: '2026-W28',
    window: { since: 's', until: 'u' },
    wins: [{ id: 'p1', title: 'First 100 users' }],
    openAsks: [],
    newLabs: [],
    newListings: [],
    mentor: null,
    counts: { wins: 1, openAsks: 0, newLabs: 0, newListings: 0 },
    ...overrides,
  };
}

function edition(overrides: Partial<Tables<'digest_editions'>> = {}): Tables<'digest_editions'> {
  return {
    id: 'ed-1',
    period_key: '2026-W28',
    period_start: '2026-07-02',
    period_end: '2026-07-09',
    status: 'published',
    pinned_post_id: 'post-1',
    payload: payload() as never,
    generated_at: '2026-07-09T08:00:00Z',
    published_at: '2026-07-09T08:00:00Z',
    created_by: null,
    ...overrides,
  };
}

const APP_URL = 'https://app.xidig.net';

describe('selectDigestRecipients', () => {
  it('selects active human members and honors every opt-out', async () => {
    const { admin } = makeFakeAdmin({
      users: [
        user('u1'),
        user('u2', { is_ai: true }), // AI account — never emailed
        user('u3', { status: 'suspended' }), // not active
        user('u4', { email: null }), // no address on file
        user('u5'), // digest_frequency = 'off'
        user('u6'), // weekly_digest/email pref off
        user('u7'), // explicit ON rows — still included
      ],
      user_settings: [
        { user_id: 'u5', digest_frequency: 'off' },
        { user_id: 'u7', digest_frequency: 'weekly' },
      ],
      notification_prefs: [
        { user_id: 'u6', notification_type: 'weekly_digest', channel: 'email', enabled: false },
        { user_id: 'u7', notification_type: 'weekly_digest', channel: 'email', enabled: true },
        // Unrelated pref rows never opt anyone out of the digest.
        { user_id: 'u1', notification_type: 'dm_request', channel: 'email', enabled: false },
        { user_id: 'u1', notification_type: 'weekly_digest', channel: 'push', enabled: false },
      ],
    });

    const recipients = await selectDigestRecipients(admin);
    expect(recipients).toEqual([
      { userId: 'u1', email: 'u1@example.so' },
      { userId: 'u7', email: 'u7@example.so' },
    ]);
  });
});

describe('sendDigestEmails', () => {
  it('sends to every recipient once and records the ledger', async () => {
    const { admin, tables } = makeFakeAdmin({ users: [user('u1'), user('u7')] });
    const sendFn = vi.fn(async () => {});

    const summary = await sendDigestEmails(admin, { edition: edition(), appUrl: APP_URL, sendFn });

    expect(summary).toMatchObject({
      editionId: 'ed-1',
      periodKey: '2026-W28',
      recipients: 2,
      claimed: 2,
      alreadyClaimed: 0,
      sent: 2,
      failed: 0,
      suppressed: 0,
    });
    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(tables.digest_email_sends).toHaveLength(2);
    for (const row of tables.digest_email_sends) {
      expect(row.status).toBe('sent');
      expect(row.sent_at).toBeTruthy();
    }
  });

  it('every email carries the digest content and the manage-preferences link', async () => {
    const { admin } = makeFakeAdmin({ users: [user('u1')] });
    const sent: Array<{ to: string; subject: string; text: string; html?: string }> = [];
    const sendFn = vi.fn(async (_admin: never, email: (typeof sent)[number]) => {
      sent.push(email);
    });

    await sendDigestEmails(admin, { edition: edition(), appUrl: APP_URL, sendFn: sendFn as never });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain('2026-W28');
    expect(sent[0]?.text).toContain('First 100 users');
    expect(sent[0]?.text).toContain(`${APP_URL}/settings/notifications`);
    expect(sent[0]?.html).toContain(`href="${APP_URL}/settings/notifications"`);
  });

  it('a re-run of the same edition sends zero duplicates', async () => {
    const { admin, tables } = makeFakeAdmin({ users: [user('u1'), user('u7')] });
    const sendFn = vi.fn(async () => {});

    await sendDigestEmails(admin, { edition: edition(), appUrl: APP_URL, sendFn });
    const rerun = await sendDigestEmails(admin, { edition: edition(), appUrl: APP_URL, sendFn });

    expect(sendFn).toHaveBeenCalledTimes(2); // first run only
    expect(rerun).toMatchObject({ recipients: 2, claimed: 0, alreadyClaimed: 2, sent: 0 });
    expect(tables.digest_email_sends).toHaveLength(2);
  });

  it('resumes a partial run without re-sending claimed members', async () => {
    const { admin, tables } = makeFakeAdmin({
      users: [user('u1'), user('u7')],
      digest_email_sends: [
        // u1 was claimed by an earlier (crashed) run — even 'failed' rows are
        // never retried automatically: never-double-send outranks retry.
        {
          id: 'prior-1',
          edition_id: 'ed-1',
          user_id: 'u1',
          email: 'u1@example.so',
          status: 'failed',
          error: 'timeout',
          sent_at: null,
        },
      ],
    });
    const sendFn = vi.fn(async (_admin: unknown, _email: { to: string }) => {});

    const summary = await sendDigestEmails(admin, { edition: edition(), appUrl: APP_URL, sendFn });

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0]?.[1]).toMatchObject({ to: 'u7@example.so' });
    expect(summary).toMatchObject({ claimed: 1, alreadyClaimed: 1, sent: 1 });
    expect(tables.digest_email_sends).toHaveLength(2);
  });

  it('records suppressed addresses without blocking the rest', async () => {
    const { admin, tables } = makeFakeAdmin({ users: [user('u1'), user('u7')] });
    const sendFn = vi.fn(async (_admin: never, email: { to: string }) => {
      if (email.to === 'u1@example.so') throw new ApiError('email_undeliverable', 422);
    });

    const summary = await sendDigestEmails(admin, {
      edition: edition(),
      appUrl: APP_URL,
      sendFn: sendFn as never,
    });

    expect(summary).toMatchObject({ sent: 1, suppressed: 1, failed: 0 });
    const byUser = new Map(tables.digest_email_sends.map((r) => [r.user_id, r]));
    expect(byUser.get('u1')?.status).toBe('suppressed');
    expect(byUser.get('u7')?.status).toBe('sent');
  });

  it('isolates provider failures per send and records the error', async () => {
    const { admin, tables } = makeFakeAdmin({ users: [user('u1'), user('u7')] });
    const sendFn = vi.fn(async (_admin: never, email: { to: string }) => {
      if (email.to === 'u1@example.so') throw new Error('provider rejected (500)');
    });

    const summary = await sendDigestEmails(admin, {
      edition: edition(),
      appUrl: APP_URL,
      sendFn: sendFn as never,
    });

    expect(summary).toMatchObject({ sent: 1, failed: 1, suppressed: 0 });
    const failedRow = tables.digest_email_sends.find((r) => r.user_id === 'u1');
    expect(failedRow?.status).toBe('failed');
    expect(failedRow?.error).toContain('provider rejected');
    expect(failedRow?.sent_at).toBeNull();
  });

  it('never emails for an unpublished (dry-run) edition', async () => {
    const { admin, tables } = makeFakeAdmin({ users: [user('u1')] });
    const sendFn = vi.fn(async () => {});

    const summary = await sendDigestEmails(admin, {
      edition: edition({ status: 'generated', pinned_post_id: null, published_at: null }),
      appUrl: APP_URL,
      sendFn,
    });

    expect(summary.skipped).toBe('edition_not_published');
    expect(sendFn).not.toHaveBeenCalled();
    expect(tables.digest_email_sends).toHaveLength(0);
  });
});
