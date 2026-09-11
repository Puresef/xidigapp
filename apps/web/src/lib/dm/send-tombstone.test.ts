import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

import { respondToRequest, sendMessage } from './service';

vi.mock('@/env', () => ({ env: { APP_URL: 'http://localhost:3000' } }));

/**
 * Retained content — a deleted account is not a live communication
 * participant (owner ruling 12 Sep). Replying into an EXISTING 1:1 thread
 * whose other participant was deleted is refused with 409 account_deleted
 * before any message row, notification (the in-app row, its preview and the
 * device push all ride notify()) exists. Accepting a pending request from a
 * deleted initiator is refused the same way; declining stays open. Active,
 * suspended and deactivated counterparts keep their existing behaviour.
 * Conversations are strictly two-party here — there is no group chat in the
 * schema, so no group behaviour exists to change.
 */

const notified = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('@/lib/notifications/notify', () => ({
  notify: async (_admin: unknown, entry: Record<string, unknown>) => {
    notified.push(entry);
  },
}));

type Row = Record<string, unknown>;

function fakeAdmin(statusOf: Record<string, string>) {
  const writes: Array<{ table: string; op: string; values?: unknown }> = [];
  const admin = {
    writes,
    from(table: string) {
      let userId: string | null = null;
      let op = 'select';
      let values: unknown;
      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (table === 'users' && column === 'id') userId = value;
          return builder;
        },
        or: () => builder,
        limit: () => builder,
        insert: (v: unknown) => {
          op = 'insert';
          values = v;
          writes.push({ table, op, values });
          return builder;
        },
        update: (v: unknown) => {
          op = 'update';
          values = v;
          writes.push({ table, op, values });
          return builder;
        },
        upsert: (v: unknown) => {
          writes.push({ table, op: 'upsert', values: v });
          return Promise.resolve({ error: null });
        },
        delete: () => {
          writes.push({ table, op: 'delete' });
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'users') {
            const status = userId ? statusOf[userId] : undefined;
            return { data: status ? { status } : null, error: null };
          }
          return { data: null, error: null };
        },
        single: async () => {
          if (op === 'insert' && table === 'messages') {
            return { data: { id: 'm-new', ...(values as Row) }, error: null };
          }
          if (op === 'update' && table === 'conversations') {
            return { data: { id: 'c1', status: 'accepted' }, error: null };
          }
          return { data: null, error: null };
        },
        // user_blocks: `await builder` → no block rows.
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  };
  return admin;
}

const accepted = (initiator: string, recipient: string) =>
  ({
    id: 'c1',
    initiator_user_id: initiator,
    recipient_user_id: recipient,
    status: 'accepted',
  }) as never;

const pending = (initiator: string, recipient: string) =>
  ({ ...(accepted(initiator, recipient) as object), status: 'pending' }) as never;

beforeEach(() => {
  notified.length = 0;
});

describe('sendMessage — replying into an existing thread with a deleted participant', () => {
  it('refuses with 409 account_deleted; no message row, notification, preview or push', async () => {
    const admin = fakeAdmin({ me: 'active', them: 'deleted' });
    await expect(
      sendMessage(admin as never, 'me', accepted('me', 'them'), { body: 'hello?' }),
    ).rejects.toMatchObject({ code: 'account_deleted', status: 409 });
    expect(admin.writes).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('refuses whichever side the deleted account is on (recipient replying to a deleted initiator)', async () => {
    const admin = fakeAdmin({ them: 'deleted', me: 'active' });
    const error = await sendMessage(admin as never, 'me', accepted('them', 'me'), {
      body: 'hi',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'account_deleted' });
    expect(admin.writes).toEqual([]);
  });

  it('a voice note is refused the same way (the guard runs before the upload is attached)', async () => {
    const admin = fakeAdmin({ me: 'active', them: 'deleted' });
    await expect(
      sendMessage(admin as never, 'me', accepted('me', 'them'), { voiceUploadId: 'up-1' }),
    ).rejects.toMatchObject({ code: 'account_deleted' });
    expect(admin.writes).toEqual([]);
  });

  it('the accept gate still runs first — a pending thread keeps its masked refusal (f5)', async () => {
    const admin = fakeAdmin({ me: 'active', them: 'deleted' });
    await expect(
      sendMessage(admin as never, 'me', pending('me', 'them'), { body: 'x' }),
    ).rejects.toMatchObject({ code: 'dm_not_accepted', status: 409 });
  });

  it.each(['active', 'pending_deletion', 'suspended', 'deactivated'])(
    '%s counterpart: unchanged — the message is written and the recipient notified',
    async (status) => {
      const admin = fakeAdmin({ me: 'active', them: status });
      const sent = await sendMessage(admin as never, 'me', accepted('me', 'them'), {
        body: 'salaan',
      });
      expect(sent.message).toMatchObject({ id: 'm-new', body: 'salaan' });
      expect(admin.writes).toEqual([
        {
          table: 'messages',
          op: 'insert',
          values: { conversation_id: 'c1', sender_user_id: 'me', body: 'salaan' },
        },
      ]);
      expect(notified).toEqual([
        expect.objectContaining({ userId: 'them', type: 'new_dm', entityId: 'c1' }),
      ]);
    },
  );
});

describe('respondToRequest — a pending request from a now-deleted initiator', () => {
  it('accept is refused with 409 account_deleted before any write or notification', async () => {
    const admin = fakeAdmin({ them: 'deleted', me: 'active' });
    await expect(
      respondToRequest(admin as never, 'me', pending('them', 'me'), 'accept'),
    ).rejects.toMatchObject({ code: 'account_deleted', status: 409 });
    expect(admin.writes).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('decline stays open (silent inbox housekeeping)', async () => {
    const admin = fakeAdmin({ them: 'deleted', me: 'active' });
    const result = await respondToRequest(admin as never, 'me', pending('them', 'me'), 'decline');
    expect(result.status).toBe('declined');
    expect(notified).toEqual([]);
  });

  it('accept from a live initiator is unchanged (control)', async () => {
    const admin = fakeAdmin({ them: 'active', me: 'active' });
    const result = await respondToRequest(admin as never, 'me', pending('them', 'me'), 'accept');
    expect(result.status).toBe('accepted');
    expect(notified).toEqual([expect.objectContaining({ userId: 'them', type: 'dm_accepted' })]);
  });
});
