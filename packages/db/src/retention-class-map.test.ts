import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LEGAL_HOLD,
  MEDIA_KINDS,
  PROVIDER_METADATA,
  PUBLIC_MEDIA_RESIDUAL,
  RETENTION_CLASS_MAP,
  RETENTION_WINDOW_DAYS,
  RETENTION_WINDOWS,
  type TableRule,
} from './retention';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Retention class map, R1a coverage contract (owner doctrine, 12 Sep;
 * docs/retention-implementation-plan.md §2).
 *
 * Runs against a real Postgres with every migration applied. It fails when the
 * schema and the class map drift apart:
 *   (a) every public base table is classified; no stale entries;
 *   (b) memberLink is EXACTLY the table's FK columns to public.users;
 *   (c) every text/citext/varchar/json/jsonb (or array-of) column on a
 *       non-platform table is classified; no stale columns;
 *   (d) declared mutability matches the forbid_mutation triggers;
 *   (e) memberReadable matches the permissive using(true) SELECT policies
 *       for `authenticated`, so blanket exposure is always explicit;
 *   (f) MEDIA_KINDS matches the seeded media_kinds rows, and the purged
 *       kinds match the lifecycle purge index;
 *   (g) the window, the legal hold and the GoTrue phone stay declared honestly.
 * The map is configuration only: nothing here reads or changes member data.
 */

let db: TestDatabase;
const MAP = RETENTION_CLASS_MAP as unknown as Record<string, TableRule>;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function rows<T>(sql: string): Promise<T[]> {
  return (await db.admin.query(sql)).rows as T[];
}

const sorted = (xs: Iterable<string>) => [...xs].sort();

describe('(a) every public table is classified', () => {
  it('the map and the schema list exactly the same tables', async () => {
    const tables = await rows<{ t: string }>(
      `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')`,
    );
    const inDb = sorted(tables.map((r) => r.t));
    expect(inDb.length).toBeGreaterThan(100);
    expect(
      inDb.filter((t) => !(t in MAP)),
      'unclassified tables',
    ).toEqual([]);
    expect(
      Object.keys(MAP).filter((t) => !inDb.includes(t)),
      'stale entries',
    ).toEqual([]);
  });
});

describe('(b) member links are exactly the FKs to public.users', () => {
  it('every FK column to public.users is a memberLink, and nothing else is', async () => {
    const fks = await rows<{ t: string; col: string }>(
      `select c.relname as t, a.attname as col
         from pg_constraint con
         join pg_class c on c.oid = con.conrelid
         join pg_namespace n on n.oid = c.relnamespace
         join lateral unnest(con.conkey) k(attnum) on true
         join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
        where con.contype = 'f' and n.nspname = 'public'
          and con.confrelid = 'public.users'::regclass`,
    );
    const byTable = new Map<string, Set<string>>();
    for (const { t, col } of fks) byTable.set(t, (byTable.get(t) ?? new Set()).add(col));
    for (const [table, rule] of Object.entries(MAP)) {
      // users.id references auth.users; the row IS the member.
      const expected = table === 'users' ? ['id'] : sorted(byTable.get(table) ?? []);
      expect(sorted(rule.memberLink), table).toEqual(expected);
    }
  });

  it('a table with no FK to users either is platform data or says how it links', () => {
    for (const [table, rule] of Object.entries(MAP)) {
      if (rule.memberLink.length > 0 || rule.class === 'platform') continue;
      expect(rule.linkedVia, `${table} needs linkedVia`).toBeTruthy();
    }
  });
});

describe('(c) every text-like column on member data is classified', () => {
  it('columns match the schema exactly (no unclassified, no stale)', async () => {
    const cols = await rows<{ t: string; col: string }>(
      `select c.relname as t, a.attname as col
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and a.attnum > 0 and not a.attisdropped
          and format_type(a.atttypid, a.atttypmod)
              ~ '^(text|citext|jsonb|json|character varying(\\(\\d+\\))?)(\\[\\])?$'`,
    );
    const byTable = new Map<string, string[]>();
    for (const { t, col } of cols) byTable.set(t, [...(byTable.get(t) ?? []), col]);
    for (const [table, rule] of Object.entries(MAP)) {
      if (rule.allColumns === 'platform') {
        expect(rule.class, `${table}: allColumns 'platform' needs class 'platform'`).toBe(
          'platform',
        );
        continue;
      }
      expect(sorted(Object.keys(rule.columns ?? {})), table).toEqual(
        sorted(byTable.get(table) ?? []),
      );
    }
  });
});

describe('(d) mutability matches the immutability triggers', () => {
  it('forbid_mutation on UPDATE+DELETE = append_only; UPDATE only = no_update', async () => {
    const trig = await rows<{ t: string; upd: boolean; del: boolean }>(
      `select c.relname as t,
              bool_or((t.tgtype & 16) = 16) as upd,
              bool_or((t.tgtype & 8) = 8) as del
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_proc p on p.oid = t.tgfoid
         join pg_namespace n on n.oid = c.relnamespace
        where not t.tgisinternal and n.nspname = 'public' and p.proname = 'forbid_mutation'
        group by c.relname`,
    );
    const byTable = new Map(trig.map((r) => [r.t, r]));
    for (const [table, rule] of Object.entries(MAP)) {
      const r = byTable.get(table);
      const expected = r?.upd && r.del ? 'append_only' : r?.upd ? 'no_update' : 'mutable';
      expect(rule.mutability, table).toBe(expected);
    }
  });
});

describe('(e) blanket member readability is always declared', () => {
  it('memberReadable matches the permissive using(true) SELECT policies', async () => {
    const pol = await rows<{ t: string }>(
      `select distinct tablename as t from pg_policies
        where schemaname = 'public' and cmd in ('SELECT', 'ALL')
          and permissive = 'PERMISSIVE' and qual = 'true'
          and 'authenticated' = any(roles)`,
    );
    const inDb = sorted(pol.map((r) => r.t));
    const declared = sorted(
      Object.entries(MAP)
        .filter(([, r]) => r.memberReadable)
        .map(([t]) => t),
    );
    expect(declared).toEqual(inDb);
  });

  it('no restricted or legal record is blanket member-readable without an owner flag', () => {
    for (const [table, rule] of Object.entries(MAP)) {
      if (!rule.memberReadable) continue;
      if (rule.class === 'restricted' || rule.class === 'legal') {
        expect(rule.status, `${table}: blanket-readable restricted data`).toBe('owner');
      }
    }
  });
});

describe('(f) media kinds and the purge scope', () => {
  it('every seeded media kind is classified; no stale kinds', async () => {
    const kinds = await rows<{ id: string }>(`select id::text as id from media_kinds`);
    expect(sorted(Object.keys(MEDIA_KINDS))).toEqual(sorted(kinds.map((k) => k.id)));
  });

  it('the kinds marked purged are exactly the lifecycle purge index scope', async () => {
    const idx = await rows<{ def: string }>(
      `select pg_get_indexdef(i.indexrelid) as def
         from pg_index i join pg_class c on c.oid = i.indexrelid
        where c.relname = 'media_uploads_identity_purge_pending_idx'`,
    );
    expect(idx).toHaveLength(1);
    const inIndex = sorted([...idx[0]!.def.matchAll(/'([a-z_]+)'::/g)].map((m) => m[1]!));
    const purged = sorted(
      Object.entries(MEDIA_KINDS)
        .filter(([, k]) => k.purgedOnDeletion)
        .map(([kind]) => kind),
    );
    expect(purged).toEqual(inIndex);
  });

  it('the public-media residual is recorded explicitly (KNOWN RESIDUAL LEAK)', () => {
    expect(PUBLIC_MEDIA_RESIDUAL.length).toBeGreaterThan(0);
    for (const kind of PUBLIC_MEDIA_RESIDUAL) {
      const k = MEDIA_KINDS[kind as keyof typeof MEDIA_KINDS];
      expect(k.public && !k.purgedOnDeletion, kind).toBe(true);
    }
  });
});

describe('(g) the policy is declared honestly', () => {
  it('the window is 365 days and longer than the deletion grace', () => {
    expect(RETENTION_WINDOW_DAYS).toBe(365);
    expect(RETENTION_WINDOWS.restrictedMetadata.days).toBe(RETENTION_WINDOW_DAYS);
    expect(RETENTION_WINDOW_DAYS).toBeGreaterThan(RETENTION_WINDOWS.deletionGrace.days);
  });

  it('a window no code enforces says so, instead of passing for a policy', () => {
    expect(RETENTION_WINDOWS.restrictedMetadata.enforcedBy).toBe('declared_not_enforced');
    expect(RETENTION_WINDOWS.verificationRecordings.enforcedBy).toBe('declared_not_enforced');
    for (const w of Object.values(RETENTION_WINDOWS))
      expect(w.enforcedBy.length).toBeGreaterThan(5);
  });

  it('there is no legal-hold mechanism yet, and the map says so', () => {
    expect(LEGAL_HOLD).toBe('not_implemented');
  });

  it('the GoTrue phone is restricted metadata, never a compliance claim', () => {
    expect(PROVIDER_METADATA.gotruePhone.class).toBe('restricted');
    expect(PROVIDER_METADATA.gotruePhone.windowDays).toBe(RETENTION_WINDOW_DAYS);
    expect(PROVIDER_METADATA.gotruePhone.complianceClaim).toBe(false);
  });

  it('every conflict names its plan step; platform data is n/a and nothing else is', () => {
    for (const [table, rule] of Object.entries(MAP)) {
      if (rule.status === 'conflict')
        expect(rule.plan, `${table} conflict needs a plan`).toBeTruthy();
      expect(rule.status === 'n/a', table).toBe(rule.class === 'platform');
    }
  });
});
