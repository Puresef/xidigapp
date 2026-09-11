import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Device push delivery requires a LIVE recipient (owner ruling, 11 Sep).
 *
 * sendPushToUser is the one device-push boundary (only notify() calls it, and
 * only for reply / mention / new_dm / dm_request — no account-lifecycle,
 * appeal or security notification pushes). Before touching any subscription
 * it reads the recipient's account status:
 *   active, pending_deletion (the grace) — delivered, as before;
 *   suspended, deactivated, deleted, or no account row — suppressed: no
 *     subscription read, no network call.
 * In-app notification rows are a different channel (lib/notifications) and
 * are not changed here. Endpoints and push keys never reach the console.
 */

const h = vi.hoisted(() => ({
  status: 'active' as string | null,
  subs: [] as Array<{ id: string; endpoint: string }>,
  subscriptionReads: 0,
  pruned: [] as string[],
}));

vi.mock('@/env', () => ({
  env: {
    VAPID_PUBLIC_KEY: 'zz-pub',
    VAPID_PRIVATE_KEY: 'zz-priv',
    VAPID_SUBJECT: 'mailto:zz@example.invalid',
  },
}));
vi.mock('./vapid', () => ({
  audienceFromEndpoint: () => 'https://push.invalid',
  buildVapidJwt: () => 'zz.jwt.value',
}));

import { sendPushToUser } from './send';

const USER = '11111111-1111-4111-8111-111111111111';
const ENDPOINTS = ['https://push.invalid/zz-device-a', 'https://push.invalid/zz-device-b'];

function fakeAdmin() {
  return {
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: h.status === null ? null : { status: h.status },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'push_subscriptions') {
        return {
          select: () => ({
            eq: () => ({
              is: async () => {
                h.subscriptionReads += 1;
                return { data: h.subs, error: null };
              },
            }),
          }),
          update: () => ({
            in: async (_c: string, ids: string[]) => {
              h.pruned.push(...ids);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  h.subs = ENDPOINTS.map((endpoint, i) => ({ id: `s${i}`, endpoint }));
  h.subscriptionReads = 0;
  h.pruned = [];
  fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendPushToUser delivers only to live recipients', () => {
  it.each(['active', 'pending_deletion'])('%s: every live device is pinged', async (status) => {
    h.status = status;
    await sendPushToUser(fakeAdmin(), USER);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(ENDPOINTS);
  });

  it.each(['suspended', 'deactivated', 'deleted', null])(
    '%s: suppressed — no subscription read, no network call',
    async (status) => {
      h.status = status;
      await sendPushToUser(fakeAdmin(), USER);
      expect(h.subscriptionReads).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('still prunes endpoints the push service reports gone (control)', async () => {
    h.status = 'active';
    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 410 }));
    await sendPushToUser(fakeAdmin(), USER);
    expect(h.pruned).toEqual(['s0']);
  });

  it('never logs an endpoint, a push key or the VAPID token', async () => {
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m));
    h.status = 'active';
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    await sendPushToUser(fakeAdmin(), USER);
    h.status = 'deleted';
    await sendPushToUser(fakeAdmin(), USER);
    const seen = JSON.stringify(spies.map((s) => s.mock.calls));
    for (const secret of [...ENDPOINTS, 'zz-priv', 'zz.jwt.value', 'zz-device']) {
      expect(seen).not.toContain(secret);
    }
    spies.forEach((s) => s.mockRestore());
  });
});
