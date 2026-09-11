import { describe, expect, it } from 'vitest';

import { projectWaitlistForAdmin, type AdminWaitlistEntry } from './admin-view';

/**
 * Retained content — admin waitlist. A deleted member's email/phone must not
 * appear as ordinary contact data. Joined entries are tied to their account
 * through the signup record (grant or invite); a deleted account's entry is
 * withheld as "account deleted". Suspended/deactivated accounts are not a
 * deletion and stay visible. Unlinked joined entries fall back to "does an
 * existing, non-deleted account hold this contact".
 */

type Row = Record<string, unknown>;

/** Generic PostgREST-ish fake: select / in / not(is null) / neq, citext emails. */
function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        select: () => builder,
        in: (column: string, values: unknown[]) => {
          const norm = (v: unknown) =>
            column === 'email' && typeof v === 'string' ? v.toLowerCase() : v;
          const wanted = new Set(values.map(norm));
          filters.push((row) => wanted.has(norm(row[column])));
          return builder;
        },
        not: (column: string, _op: string, _value: null) => {
          filters.push((row) => row[column] !== null && row[column] !== undefined);
          return builder;
        },
        neq: (column: string, value: unknown) => {
          filters.push((row) => row[column] !== value);
          return builder;
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          resolve({
            data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))),
            error: null,
          });
        },
      };
      return builder;
    },
  };
}

const entry = (
  id: string,
  status: AdminWaitlistEntry['status'],
  email: string | null,
  phone: string | null = null,
  invite_id: string | null = null,
) => ({ id, status, email, phone, invite_id, created_at: '2026-07-01T00:00:00Z' });

const ENTRIES = [
  entry('w-deleted', 'joined', 'gone@example.com'),
  entry('w-active', 'joined', 'here@example.com'),
  entry('w-suspended', 'joined', 'paused@example.com'),
  entry('w-invite-deleted', 'joined', null, '+252633333333', 'inv-1'),
  entry('w-unlinked-held', 'joined', 'Legacy@Example.com'),
  entry('w-unlinked-gone', 'joined', 'nobody@example.com'),
  entry('w-pending', 'pending', 'waiting@example.com'),
  entry('w-invited', 'invited', null, '+252622222222'),
];

const TABLES: Record<string, Row[]> = {
  waitlist_entries: ENTRIES,
  signup_grants: [
    { waitlist_entry_id: 'w-deleted', consumed_by_user_id: 'u-deleted' },
    { waitlist_entry_id: 'w-active', consumed_by_user_id: 'u-active' },
    { waitlist_entry_id: 'w-suspended', consumed_by_user_id: 'u-suspended' },
    // an unconsumed grant links nothing
    { waitlist_entry_id: 'w-pending', consumed_by_user_id: null },
  ],
  invites: [{ id: 'inv-1', redeemed_by_user_id: 'u-deleted-2' }],
  users: [
    // anonymise_user nulled the deleted accounts' email and phone
    { id: 'u-deleted', status: 'deleted', email: null, phone: null },
    { id: 'u-deleted-2', status: 'deleted', email: null, phone: null },
    { id: 'u-active', status: 'active', email: 'here@example.com', phone: null },
    { id: 'u-suspended', status: 'suspended', email: 'paused@example.com', phone: null },
    { id: 'u-legacy', status: 'active', email: 'legacy@example.com', phone: null },
  ],
};

async function project() {
  const rows = await projectWaitlistForAdmin(fakeAdmin(TABLES) as never, ENTRIES);
  return new Map(rows.map((row) => [row.id, row]));
}

describe('projectWaitlistForAdmin', () => {
  it('withholds a deleted account’s contact, linked through its signup grant', async () => {
    expect((await project()).get('w-deleted')).toMatchObject({
      email: null,
      phone: null,
      contactHidden: 'account_deleted',
    });
  });

  it('withholds a deleted account’s contact, linked through the invite it redeemed', async () => {
    expect((await project()).get('w-invite-deleted')).toMatchObject({
      phone: null,
      contactHidden: 'account_deleted',
    });
  });

  it('shows live and suspended members’ entries unchanged (suspension is not deletion)', async () => {
    const rows = await project();
    expect(rows.get('w-active')).toMatchObject({ email: 'here@example.com', contactHidden: null });
    expect(rows.get('w-suspended')).toMatchObject({
      email: 'paused@example.com',
      contactHidden: null,
    });
  });

  it('unlinked joined entries: shown while an account holds the contact (case-insensitive), else withheld', async () => {
    const rows = await project();
    expect(rows.get('w-unlinked-held')).toMatchObject({
      email: 'Legacy@Example.com',
      contactHidden: null,
    });
    expect(rows.get('w-unlinked-gone')).toMatchObject({
      email: null,
      contactHidden: 'no_matching_account',
    });
  });

  it('never touches pending or invited entries', async () => {
    const rows = await project();
    expect(rows.get('w-pending')).toMatchObject({
      email: 'waiting@example.com',
      contactHidden: null,
    });
    expect(rows.get('w-invited')).toMatchObject({ phone: '+252622222222', contactHidden: null });
  });

  it('no stored contact of a deleted account survives the projection', async () => {
    const rows = await projectWaitlistForAdmin(fakeAdmin(TABLES) as never, ENTRIES);
    const blob = JSON.stringify(rows.filter((r) => r.contactHidden === 'account_deleted'));
    expect(blob).not.toContain('gone@example.com');
    expect(blob).not.toContain('+252633333333');
  });
});
