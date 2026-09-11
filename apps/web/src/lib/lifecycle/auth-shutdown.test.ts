import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_BAN_DURATION,
  authPseudonymEmail,
  findAccountsOwingAuthCleanup,
  recordAuthCleanup,
  shutDownAuthIdentity,
} from './auth-shutdown';

/**
 * §19 auth shutdown (owner-selected Option A): after the database transition,
 * the GoTrue identity is banned and its email replaced by a deterministic
 * non-routable pseudonym. The UUID stays; the phone is never touched; the
 * identity is never deleted. Pinned here against a fake GoTrue admin that
 * keeps real state, so "done" means the provider SAYS it is done:
 *
 *  - the ban lands BEFORE the email changes, and a failed ban stops the run
 *    (a pseudonymised-but-unbanned account can still mint tokens);
 *  - an account already shut at the provider needs no provider writes;
 *  - a provider "success" that does not read back as shut is a failure;
 *  - failures surface only as a coarse category — never a provider message,
 *    address or token.
 */

const UID = '0b5c1e4e-6d0a-4a39-9d51-2d6f3c7e9a10';
const NOW = new Date('2026-09-11T03:30:00.000Z');

interface AuthUserState {
  id: string;
  email: string;
  phone: string;
  banned_until?: string;
}

type Failure = { status?: number; message: string } | 'throw';

function fakeGoTrue(initial: AuthUserState | null) {
  const user = initial ? { ...initial } : null;
  const updates: Array<Record<string, unknown>> = [];
  const calls: string[] = [];
  const fail: { get?: Failure; ban?: Failure; email?: Failure } = {};
  // When set, updates report success but do not change state (a provider that
  // lies, or a proxy that swallowed the write).
  let silentlyIgnoreUpdates = false;
  let readBackId: string | null = null;

  const errorOf = (f: Failure) => {
    if (f === 'throw') throw new TypeError('fetch failed');
    return { data: { user: null }, error: f };
  };

  const authAdmin = {
    async getUserById(id: string) {
      calls.push('getUserById');
      if (fail.get) return errorOf(fail.get);
      if (!user || user.id !== id) {
        return { data: { user: null }, error: { status: 404, message: 'User not found' } };
      }
      return { data: { user: { ...user, id: readBackId ?? user.id } }, error: null };
    },
    async updateUserById(id: string, attrs: Record<string, unknown>) {
      updates.push(attrs);
      calls.push(`update:${Object.keys(attrs).sort().join(',')}`);
      if ('ban_duration' in attrs && fail.ban) return errorOf(fail.ban);
      if ('email' in attrs && fail.email) return errorOf(fail.email);
      if (!user || user.id !== id) {
        return { data: { user: null }, error: { status: 404, message: 'User not found' } };
      }
      if (!silentlyIgnoreUpdates) {
        if ('ban_duration' in attrs) {
          const hours = Number(String(attrs.ban_duration).replace(/h$/, ''));
          user.banned_until = new Date(NOW.getTime() + hours * 3_600_000).toISOString();
        }
        if ('email' in attrs) user.email = String(attrs.email);
      }
      return { data: { user: { ...user } }, error: null };
    },
    async deleteUser() {
      calls.push('deleteUser');
      return { data: null, error: null };
    },
  };

  const admin = {
    auth: { admin: authAdmin },
    from(table: string) {
      calls.push(`from:${table}`);
      throw new Error('auth shutdown must not touch database tables');
    },
  };

  return {
    admin: admin as never,
    updates,
    calls,
    fail,
    state: () => user,
    ignoreUpdates: () => {
      silentlyIgnoreUpdates = true;
    },
    readBackWrongId: (id: string) => {
      readBackId = id;
    },
  };
}

const LIVE: AuthUserState = { id: UID, email: 'member@example.com', phone: '252611234567' };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('authPseudonymEmail', () => {
  it('is deterministic per UUID and carries nothing but the UUID', () => {
    expect(authPseudonymEmail(UID)).toBe(authPseudonymEmail(UID));
    expect(authPseudonymEmail(UID)).toBe(`deleted-${UID}@deleted.invalid`);
    expect(authPseudonymEmail(UID)).not.toBe(
      authPseudonymEmail('11111111-2222-4333-8444-555555555555'),
    );
  });

  it('uses the RFC 2606 .invalid TLD, which can never resolve or receive mail', () => {
    expect(authPseudonymEmail(UID).split('@')[1]).toMatch(/\.invalid$/);
  });
});

describe('shutDownAuthIdentity', () => {
  it('bans first, then pseudonymises, then reports completed', async () => {
    const g = fakeGoTrue(LIVE);
    const result = await shutDownAuthIdentity(g.admin, UID, NOW);

    expect(result).toEqual({ outcome: 'completed', changed: true });
    const writes = g.calls.filter((c) => c.startsWith('update:'));
    expect(writes).toEqual(['update:ban_duration', 'update:email']);
    expect(g.updates[0]).toEqual({ ban_duration: AUTH_BAN_DURATION });
    expect(g.updates[1]).toEqual({ email: authPseudonymEmail(UID) });
  });

  it('bans for a terminal horizon, not a moderation-length one', () => {
    const hours = Number(AUTH_BAN_DURATION.replace(/h$/, ''));
    expect(AUTH_BAN_DURATION).toMatch(/^\d+h$/);
    expect(hours / 24 / 365).toBeGreaterThanOrEqual(100);
  });

  it('never sends a phone attribute, never deletes the identity, never touches tables', async () => {
    const g = fakeGoTrue(LIVE);
    await shutDownAuthIdentity(g.admin, UID, NOW);

    for (const attrs of g.updates) {
      expect(Object.keys(attrs).every((k) => k === 'ban_duration' || k === 'email')).toBe(true);
    }
    expect(g.calls).not.toContain('deleteUser');
    expect(g.calls.some((c) => c.startsWith('from:'))).toBe(false);
    expect(g.state()?.phone).toBe(LIVE.phone);
    expect(g.state()?.id).toBe(UID);
  });

  it('is idempotent: an identity already shut needs no provider writes', async () => {
    const g = fakeGoTrue(LIVE);
    await shutDownAuthIdentity(g.admin, UID, NOW);
    const writesBefore = g.updates.length;

    const again = await shutDownAuthIdentity(g.admin, UID, NOW);

    expect(again).toEqual({ outcome: 'completed', changed: false });
    expect(g.updates.length).toBe(writesBefore);
  });

  it('a failed ban stops the run before the email changes', async () => {
    const g = fakeGoTrue(LIVE);
    g.fail.ban = { status: 503, message: 'upstream unavailable' };

    const result = await shutDownAuthIdentity(g.admin, UID, NOW);

    expect(result).toEqual({ outcome: 'failed', failure: 'provider_unavailable' });
    expect(g.updates.some((u) => 'email' in u)).toBe(false);
    expect(g.state()?.email).toBe(LIVE.email);
  });

  it('a network failure is retryable, not a crash', async () => {
    const g = fakeGoTrue(LIVE);
    g.fail.ban = 'throw';
    expect(await shutDownAuthIdentity(g.admin, UID, NOW)).toEqual({
      outcome: 'failed',
      failure: 'provider_unavailable',
    });
  });

  it('ban done, email rejected → pending; the retry only does the missing step', async () => {
    const g = fakeGoTrue(LIVE);
    g.fail.email = {
      status: 422,
      message: `Unable to validate email address: invalid format ${LIVE.email}`,
    };

    const first = await shutDownAuthIdentity(g.admin, UID, NOW);
    expect(first).toEqual({ outcome: 'failed', failure: 'provider_rejected' });
    expect(g.state()?.banned_until).toBeTruthy();

    delete g.fail.email;
    g.updates.length = 0;
    const retry = await shutDownAuthIdentity(g.admin, UID, NOW);

    expect(retry).toEqual({ outcome: 'completed', changed: true });
    expect(g.updates).toEqual([{ email: authPseudonymEmail(UID) }]);
  });

  it('extends a short moderation ban to the terminal one', async () => {
    const g = fakeGoTrue({
      ...LIVE,
      banned_until: new Date(NOW.getTime() + 86_400_000).toISOString(),
    });
    await shutDownAuthIdentity(g.admin, UID, NOW);
    expect(g.updates[0]).toEqual({ ban_duration: AUTH_BAN_DURATION });
  });

  it('a missing identity is its own category (the FK should make it impossible)', async () => {
    const g = fakeGoTrue(null);
    expect(await shutDownAuthIdentity(g.admin, UID, NOW)).toEqual({
      outcome: 'failed',
      failure: 'identity_missing',
    });
  });

  it('a provider "success" that does not read back as shut is a verification failure', async () => {
    const g = fakeGoTrue(LIVE);
    g.ignoreUpdates();
    expect(await shutDownAuthIdentity(g.admin, UID, NOW)).toEqual({
      outcome: 'failed',
      failure: 'verification_failed',
    });
  });

  it('a read-back under a different id is a verification failure', async () => {
    const g = fakeGoTrue(LIVE);
    await shutDownAuthIdentity(g.admin, UID, NOW);
    g.readBackWrongId('99999999-9999-4999-8999-999999999999');
    expect(await shutDownAuthIdentity(g.admin, UID, NOW)).toEqual({
      outcome: 'failed',
      failure: 'verification_failed',
    });
  });

  it('never lets a provider message, address or phone out of the result or the logs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const g = fakeGoTrue(LIVE);
    g.fail.email = {
      status: 400,
      message: `PROVIDER-TEXT email ${LIVE.email} phone ${LIVE.phone}`,
    };

    const result = await shutDownAuthIdentity(g.admin, UID, NOW);

    const surfaced = JSON.stringify([result, error.mock.calls, warn.mock.calls]);
    expect(surfaced).not.toContain(LIVE.email);
    expect(surfaced).not.toContain(LIVE.phone);
    expect(surfaced).not.toContain('PROVIDER-TEXT');
  });
});

// ---------------------------------------------------------------------------
// Durable state on public.users (migration 20260911000300).
// ---------------------------------------------------------------------------

function recordingAdmin(opts: { error?: { message: string } } = {}) {
  const ops: Array<{ op: string; args: unknown[] }> = [];
  const q: Record<string, unknown> = {};
  for (const op of ['select', 'update', 'eq', 'is', 'order', 'limit']) {
    q[op] = (...args: unknown[]) => {
      ops.push({ op, args });
      return q;
    };
  }
  q.then = (onfulfilled: (v: unknown) => unknown, onrejected: (r: unknown) => unknown) =>
    Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: opts.error ?? null }).then(
      onfulfilled,
      onrejected,
    );
  const admin = {
    from: (table: string) => {
      ops.push({ op: 'from', args: [table] });
      return q;
    },
  };
  return { admin: admin as never, ops };
}

describe('recordAuthCleanup', () => {
  it('marks completion on the deleted row only, and clears any old failure', async () => {
    const { admin, ops } = recordingAdmin();
    const ok = await recordAuthCleanup(admin, UID, { outcome: 'completed', changed: true }, NOW);

    expect(ok).toBe(true);
    expect(ops).toContainEqual({ op: 'from', args: ['users'] });
    expect(ops).toContainEqual({
      op: 'update',
      args: [
        {
          auth_cleaned_at: NOW.toISOString(),
          auth_cleanup_attempted_at: NOW.toISOString(),
          auth_cleanup_failure: null,
        },
      ],
    });
    expect(ops).toContainEqual({ op: 'eq', args: ['id', UID] });
    expect(ops).toContainEqual({ op: 'eq', args: ['status', 'deleted'] });
  });

  it('records a failure as attempt time + category, never completion', async () => {
    const { admin, ops } = recordingAdmin();
    await recordAuthCleanup(
      admin,
      UID,
      { outcome: 'failed', failure: 'provider_unavailable' },
      NOW,
    );

    expect(ops).toContainEqual({
      op: 'update',
      args: [
        {
          auth_cleanup_attempted_at: NOW.toISOString(),
          auth_cleanup_failure: 'provider_unavailable',
        },
      ],
    });
    expect(ops).toContainEqual({ op: 'is', args: ['auth_cleaned_at', null] });
  });

  it('reports a failed bookkeeping write instead of pretending', async () => {
    const { admin } = recordingAdmin({ error: { message: 'boom' } });
    expect(await recordAuthCleanup(admin, UID, { outcome: 'completed', changed: false }, NOW)).toBe(
      false,
    );
  });
});

describe('findAccountsOwingAuthCleanup', () => {
  it('selects deleted accounts not yet cleaned, least-recently-attempted first', async () => {
    const { admin, ops } = recordingAdmin();
    const ids = await findAccountsOwingAuthCleanup(admin, 50);

    expect(ids).toEqual(['a', 'b']);
    expect(ops).toContainEqual({ op: 'from', args: ['users'] });
    expect(ops).toContainEqual({ op: 'eq', args: ['status', 'deleted'] });
    expect(ops).toContainEqual({ op: 'is', args: ['auth_cleaned_at', null] });
    expect(ops).toContainEqual({
      op: 'order',
      args: ['auth_cleanup_attempted_at', { ascending: true, nullsFirst: true }],
    });
    expect(ops).toContainEqual({ op: 'limit', args: [50] });
  });

  it('throws on a failed scan so the caller cannot read silence as "nothing owed"', async () => {
    const { admin } = recordingAdmin({ error: { message: 'boom' } });
    await expect(findAccountsOwingAuthCleanup(admin)).rejects.toThrow(/auth cleanup scan failed/);
  });
});
