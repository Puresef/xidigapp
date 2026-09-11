import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findAccountsOwingMediaPurge, purgeIdentityMedia } from './media-cleanup';

/**
 * Identity-media cleanup. The property that matters is not "remove() was
 * called" but "the objects are confirmed gone before anything says so":
 *
 *  - a row is marked purged ONLY when the bucket is confirmed not to hold any
 *    of its paths, so an already-missing object is success and a remove() that
 *    silently did nothing is not;
 *  - the derived thumb goes with the source (otherwise the face survives at
 *    the thumbnail URL);
 *  - one row failing leaves its purged_at null and does not stop the others;
 *  - logs carry the media row id and a failure category, never a path or URL
 *    (a path embeds the member's user id — it is part of what we are deleting).
 */

type Row = Record<string, unknown>;

interface StorageState {
  /** Paths currently "in the bucket". */
  present: Set<string>;
  /** Paths remove() refuses to delete. */
  undeletable: Set<string>;
  removeCalls: string[][];
  existsThrowsFor: Set<string>;
}

function fakeAdmin(rows: Row[], storage: StorageState, opts: { markFails?: boolean } = {}) {
  const marked: string[] = [];
  const scanFilters: Array<{ op: string; args: unknown[] }> = [];

  const table = () => {
    const q: Record<string, unknown> = {};
    const chain =
      (op: string) =>
      (...args: unknown[]) => {
        scanFilters.push({ op, args });
        if (op === 'update') {
          const values = args[0] as Row;
          if (values.purged_at) q.__marking = true;
        }
        if (op === 'eq' && q.__marking) marked.push(String(args[1]));
        return q;
      };
    for (const op of ['select', 'update', 'eq', 'in', 'is', 'limit']) q[op] = chain(op);
    q.then = <T1, T2>(
      onfulfilled?: ((v: { data: Row[] | null; error: null | { message: string } }) => T1) | null,
      onrejected?: ((r: unknown) => T2) | null,
    ) =>
      Promise.resolve(
        q.__marking
          ? { data: null, error: opts.markFails ? { message: 'mark boom' } : null }
          : { data: rows, error: null },
      ).then(onfulfilled as never, onrejected as never);
    return q;
  };

  const admin = {
    from: () => table(),
    storage: {
      from: () => ({
        async remove(paths: string[]) {
          storage.removeCalls.push(paths);
          for (const p of paths) if (!storage.undeletable.has(p)) storage.present.delete(p);
          return { data: [], error: null };
        },
        // Mirrors list(prefix, {limit, search}) — the primitive the cleanup
        // uses, because exists() answers 400 on the live Storage version.
        async list(folder: string, opts: { search?: string }) {
          const name = opts.search ?? '';
          const full = folder ? `${folder}/${name}` : name;
          if (storage.existsThrowsFor.has(full)) {
            return { data: null, error: { message: 'list boom' } };
          }
          return { data: storage.present.has(full) ? [{ name }] : [], error: null };
        },
      }),
    },
  } as never;

  return { admin, marked, scanFilters };
}

function storageWith(present: string[]): StorageState {
  return {
    present: new Set(present),
    undeletable: new Set(),
    removeCalls: [],
    existsThrowsFor: new Set(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('purgeIdentityMedia', () => {
  it('deletes source and thumb together and marks the row purged', async () => {
    const storage = storageWith(['u/a.webp', 'u/a_thumb.webp']);
    const { admin, marked } = fakeAdmin(
      [{ id: 'm1', storage_path: 'u/a.webp', thumb_path: 'u/a_thumb.webp' }],
      storage,
    );
    const result = await purgeIdentityMedia(admin, 'u');
    expect(storage.removeCalls).toEqual([['u/a.webp', 'u/a_thumb.webp']]);
    expect(storage.present.size).toBe(0);
    expect(result).toEqual({ purged: 1, pending: 0 });
    expect(marked).toEqual(['m1']);
  });

  it('treats an already-missing object as success (idempotent second run)', async () => {
    const storage = storageWith([]); // nothing left in the bucket
    const { admin, marked } = fakeAdmin(
      [{ id: 'm1', storage_path: 'u/a.webp', thumb_path: 'u/a_thumb.webp' }],
      storage,
    );
    expect(await purgeIdentityMedia(admin, 'u')).toEqual({ purged: 1, pending: 0 });
    expect(marked).toEqual(['m1']);
  });

  it('does NOT mark purged when an object survives the remove', async () => {
    const storage = storageWith(['u/a.webp', 'u/a_thumb.webp']);
    storage.undeletable.add('u/a_thumb.webp'); // thumb refuses to go
    const { admin, marked } = fakeAdmin(
      [{ id: 'm1', storage_path: 'u/a.webp', thumb_path: 'u/a_thumb.webp' }],
      storage,
    );
    const result = await purgeIdentityMedia(admin, 'u');
    expect(result).toEqual({ purged: 0, pending: 1 });
    expect(marked).toEqual([]); // stays retryable
    expect(storage.present.has('u/a_thumb.webp')).toBe(true);
  });

  it('does not mark purged when the bucket cannot be queried', async () => {
    const storage = storageWith(['u/a.webp']);
    storage.existsThrowsFor.add('u/a.webp');
    const { admin, marked } = fakeAdmin(
      [{ id: 'm1', storage_path: 'u/a.webp', thumb_path: null }],
      storage,
    );
    expect(await purgeIdentityMedia(admin, 'u')).toEqual({ purged: 0, pending: 1 });
    expect(marked).toEqual([]);
  });

  it('settles each row independently — one failure does not lose the others', async () => {
    const storage = storageWith(['u/a.webp', 'u/b.webp', 'u/c.webp']);
    storage.undeletable.add('u/b.webp');
    const { admin, marked } = fakeAdmin(
      [
        { id: 'm1', storage_path: 'u/a.webp', thumb_path: null },
        { id: 'm2', storage_path: 'u/b.webp', thumb_path: null },
        { id: 'm3', storage_path: 'u/c.webp', thumb_path: null },
      ],
      storage,
    );
    expect(await purgeIdentityMedia(admin, 'u')).toEqual({ purged: 2, pending: 1 });
    expect(marked).toEqual(['m1', 'm3']);
  });

  it('leaves the row retryable when only the bookkeeping fails', async () => {
    const storage = storageWith(['u/a.webp']);
    const { admin } = fakeAdmin(
      [{ id: 'm1', storage_path: 'u/a.webp', thumb_path: null }],
      storage,
      {
        markFails: true,
      },
    );
    expect(await purgeIdentityMedia(admin, 'u')).toEqual({ purged: 0, pending: 1 });
    expect(storage.present.size).toBe(0); // object really is gone
  });

  it('logs the row id and a category, never a path or URL', async () => {
    const storage = storageWith(['u/secret-user-id/face.webp']);
    storage.undeletable.add('u/secret-user-id/face.webp');
    const { admin } = fakeAdmin(
      [{ id: 'm1', storage_path: 'u/secret-user-id/face.webp', thumb_path: null }],
      storage,
    );
    await purgeIdentityMedia(admin, 'u');
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .join(' ');
    expect(logged).toContain('m1');
    expect(logged).toContain('still_present');
    expect(logged).not.toContain('secret-user-id');
    expect(logged).not.toContain('http');
  });

  it('only ever looks at unpurged avatar/cover rows for the owner', async () => {
    const storage = storageWith([]);
    const { admin, scanFilters } = fakeAdmin([], storage);
    await purgeIdentityMedia(admin, 'owner-1');
    expect(scanFilters.find((f) => f.op === 'eq')?.args).toEqual(['owner_user_id', 'owner-1']);
    expect(scanFilters.find((f) => f.op === 'in')?.args).toEqual(['kind', ['avatar', 'cover']]);
    expect(scanFilters.find((f) => f.op === 'is')?.args).toEqual(['purged_at', null]);
  });
});

describe('findAccountsOwingMediaPurge', () => {
  it('scans deleted accounts with unconfirmed identity media, deduped', async () => {
    const storage = storageWith([]);
    const { admin, scanFilters } = fakeAdmin(
      [{ owner_user_id: 'u1' }, { owner_user_id: 'u1' }, { owner_user_id: 'u2' }],
      storage,
    );
    expect(await findAccountsOwingMediaPurge(admin)).toEqual(['u1', 'u2']);
    expect(scanFilters.find((f) => f.op === 'is')?.args).toEqual(['purged_at', null]);
    expect(scanFilters.find((f) => f.op === 'eq')?.args).toEqual(['users.status', 'deleted']);
  });
});
