import { beforeEach, describe, expect, it, vi } from 'vitest';

import { REMINDER_WINDOW_MS, sendEventReminders } from './reminders';

/**
 * T-3d reminder sweep (Task 4): the window widens to 72h and the payload
 * carries enough to render a useful notification without a second read —
 * { eventSlug, title, startsAt, timezone, going, capacity, status } where
 * `status` is that member's own RSVP and the counts are a send-time snapshot.
 * The atomic reminded_at claim and the skip-the-host rule stay locked.
 */

const notifications = vi.hoisted(() => ({ sent: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/notifications/notify', () => ({
  insertNotification: async (_admin: unknown, input: Record<string, unknown>) => {
    notifications.sent.push(input);
  },
}));

interface RecordedQuery {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}

function makeFakeAdmin(resultsByTable: Record<string, Array<{ data: unknown; error: null }>>) {
  const queries: RecordedQuery[] = [];

  function from(table: string) {
    const record: RecordedQuery = { table, calls: [] };
    queries.push(record);
    const queue = resultsByTable[table] ?? [];
    const result = queue.shift() ?? { data: [], error: null };

    function rec(method: string) {
      return (...args: unknown[]) => (record.calls.push({ method, args }), chain);
    }
    const chain = {
      update: rec('update'),
      select: rec('select'),
      is: rec('is'),
      eq: rec('eq'),
      in: rec('in'),
      gt: rec('gt'),
      lte: rec('lte'),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled, onRejected),
    };
    return chain;
  }

  return { admin: { from } as never, queries };
}

const NOW = new Date('2026-08-10T12:00:00Z');

beforeEach(() => {
  notifications.sent.length = 0;
});

describe('sendEventReminders (72h window, snapshot payload)', () => {
  it('claims events entering the NEXT 72 HOURS in one atomic update', async () => {
    const { admin, queries } = makeFakeAdmin({ events: [{ data: [], error: null }] });

    const result = await sendEventReminders(admin, NOW);

    expect(result).toEqual({ eventsClaimed: 0, remindersSent: 0 });
    expect(REMINDER_WINDOW_MS).toBe(72 * 60 * 60 * 1000);

    const claim = queries.find((q) => q.table === 'events')!;
    const lte = claim.calls.find((c) => c.method === 'lte')!;
    expect(lte.args).toEqual([
      'starts_at',
      new Date(NOW.getTime() + REMINDER_WINDOW_MS).toISOString(),
    ]);
    const gt = claim.calls.find((c) => c.method === 'gt')!;
    expect(gt.args).toEqual(['starts_at', NOW.toISOString()]);
    // Still an atomic claim: the same statement sets reminded_at.
    expect(claim.calls.find((c) => c.method === 'update')!.args).toEqual([
      { reminded_at: NOW.toISOString() },
    ]);
  });

  it('sends the snapshot payload per member, with their OWN rsvp status, skipping the host', async () => {
    const { admin } = makeFakeAdmin({
      events: [
        {
          data: [
            {
              id: 'e1',
              slug: 'tea-talk',
              title: 'Tea & talk',
              starts_at: '2026-08-12T18:30:00Z',
              timezone: 'Africa/Mogadishu',
              capacity: 40,
              host_user_id: 'host-1',
            },
          ],
          error: null,
        },
      ],
      event_rsvps: [
        {
          data: [
            { user_id: 'host-1', status: 'going' },
            { user_id: 'member-1', status: 'going' },
            { user_id: 'member-2', status: 'interested' },
          ],
          error: null,
        },
      ],
    });

    const result = await sendEventReminders(admin, NOW);

    expect(result).toEqual({ eventsClaimed: 1, remindersSent: 2 });
    expect(notifications.sent).toHaveLength(2);
    expect(notifications.sent[0]).toMatchObject({
      userId: 'member-1',
      type: 'event_reminder',
      entityType: 'event',
      entityId: 'e1',
      payload: {
        eventSlug: 'tea-talk',
        title: 'Tea & talk',
        startsAt: '2026-08-12T18:30:00Z',
        timezone: 'Africa/Mogadishu',
        going: 2, // send-time snapshot (the host counts toward attendance)
        capacity: 40,
        status: 'going',
      },
    });
    expect(notifications.sent[1]).toMatchObject({
      userId: 'member-2',
      payload: expect.objectContaining({ status: 'interested', going: 2, capacity: 40 }),
    });
  });

  describe('retained content — a deleted host', () => {
    const claimedEvent = (labId: string | null) => ({
      id: 'e2',
      slug: 'garden-day',
      title: 'Garden day',
      starts_at: '2026-08-12T09:00:00Z',
      timezone: 'Africa/Mogadishu',
      capacity: null,
      host_user_id: 'host-gone',
      lab_id: labId,
    });

    it('a member-hosted event whose host was deleted sends NO reminder (it is no longer running)', async () => {
      const { admin } = makeFakeAdmin({
        events: [{ data: [claimedEvent(null)], error: null }],
        users: [{ data: [{ id: 'host-gone', status: 'deleted', is_ai: false }], error: null }],
        event_rsvps: [{ data: [{ user_id: 'member-1', status: 'going' }], error: null }],
      });

      const result = await sendEventReminders(admin, NOW);

      expect(result).toEqual({ eventsClaimed: 1, remindersSent: 0 });
      expect(notifications.sent).toHaveLength(0);
    });

    it('a Space-hosted event keeps running — its reminders still go out', async () => {
      const { admin } = makeFakeAdmin({
        events: [{ data: [claimedEvent('lab-1')], error: null }],
        users: [
          { data: [{ id: 'host-gone', status: 'deleted', is_ai: false }], error: null },
          { data: [], error: null },
        ],
        event_rsvps: [{ data: [{ user_id: 'member-1', status: 'going' }], error: null }],
      });

      const result = await sendEventReminders(admin, NOW);

      expect(result.remindersSent).toBe(1);
      expect(notifications.sent[0]).toMatchObject({ userId: 'member-1' });
    });

    it('a deleted account is never a reminder recipient', async () => {
      const { admin } = makeFakeAdmin({
        events: [
          {
            data: [{ ...claimedEvent(null), host_user_id: 'host-live' }],
            error: null,
          },
        ],
        users: [
          { data: [{ id: 'host-live', status: 'active', is_ai: false }], error: null },
          {
            data: [
              { id: 'member-1', status: 'active', is_ai: false },
              { id: 'member-gone', status: 'deleted', is_ai: false },
            ],
            error: null,
          },
        ],
        event_rsvps: [
          {
            data: [
              { user_id: 'member-1', status: 'going' },
              { user_id: 'member-gone', status: 'going' },
            ],
            error: null,
          },
        ],
      });

      const result = await sendEventReminders(admin, NOW);

      expect(result.remindersSent).toBe(1);
      expect(notifications.sent.map((n) => n.userId)).toEqual(['member-1']);
    });
  });
});
