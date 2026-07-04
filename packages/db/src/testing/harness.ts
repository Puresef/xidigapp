import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

/** Rows are returned untyped; tests assert on shapes explicitly. */
export type Row = Record<string, unknown>;

export interface JwtClaims {
  /** auth.uid() — the signed-in user's id. */
  sub?: string;
  role?: string;
}

export interface TestDatabase {
  /** Superuser connection to the migrated database (bypasses RLS). */
  admin: pg.Client;
  /** Superuser connection string (e.g. for the Supabase CLI type generator). */
  connectionString: string;
  /**
   * Run `fn` inside a transaction as a Postgres role with the given JWT
   * claims — exactly how PostgREST executes a request. Commits on success so
   * later blocks can observe the writes; rolls back and rethrows on error.
   */
  withRole<T>(
    role: 'anon' | 'authenticated' | 'service_role',
    claims: JwtClaims | null,
    fn: (tx: pg.Client) => Promise<T>,
  ): Promise<T>;
  /** Shorthand for withRole('authenticated', { sub: userId }, fn). */
  asUser<T>(userId: string, fn: (tx: pg.Client) => Promise<T>): Promise<T>;
  /**
   * Create an auth.users row (as GoTrue would) and return its id. Fires the
   * on_auth_user_created trigger — so without an open signup grant this
   * throws unless `gateBypass` is set.
   */
  createAuthUser(input: {
    email?: string;
    phone?: string;
    password?: boolean;
    gateBypass?: boolean;
  }): Promise<string>;
  /** Issue an open signup grant (as the API's service role would). */
  createSignupGrant(input: {
    email?: string;
    phone?: string;
    inviteId?: string;
    waitlistEntryId?: string;
    expiresInMinutes?: number;
  }): Promise<string>;
  stop(): Promise<void>;
}

/**
 * Boot a disposable Postgres 17 with a Supabase-shaped environment and all
 * migrations applied:
 *
 *   * roles `anon` / `authenticated` (RLS-subject) and `service_role`
 *     (BYPASSRLS), plus Supabase's default privileges (GRANT ALL on new
 *     public-schema objects to all three — which is exactly why migrations
 *     must REVOKE and re-grant precisely);
 *   * an `auth` schema stub: auth.users (the columns our triggers touch) and
 *     auth.uid() reading request.jwt.claims, as PostgREST sets it;
 *   * every file in supabase/migrations, in filename order.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const databaseDir = await mkdtemp(path.join(tmpdir(), 'xidig-pg-'));
  const port = 40000 + Math.floor(Math.random() * 20000);

  const cluster = new EmbeddedPostgres({
    databaseDir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent: false,
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    // Keep postgres/initdb chatter out of test output; real failures surface
    // as thrown errors from start()/queries.
    onLog: () => {},
    onError: () => {},
  });

  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase('xidig_test');

  const admin = cluster.getPgClient('xidig_test');
  await admin.connect();

  try {
    await bootstrapSupabaseEnvironment(admin);
    await applyMigrations(admin);
  } catch (error) {
    await admin.end().catch(() => {});
    await cluster.stop().catch(() => {});
    await rm(databaseDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  const withRole = async <T>(
    role: 'anon' | 'authenticated' | 'service_role',
    claims: JwtClaims | null,
    fn: (tx: pg.Client) => Promise<T>,
  ): Promise<T> => {
    await admin.query('begin');
    try {
      // set_config(..., true) scopes both to the transaction, mirroring
      // PostgREST's per-request `SET LOCAL role` + claims.
      await admin.query(`select set_config('role', $1, true)`, [role]);
      await admin.query(`select set_config('request.jwt.claims', $1, true)`, [
        claims ? JSON.stringify(claims) : '',
      ]);
      const result = await fn(admin);
      await admin.query('commit');
      return result;
    } catch (error) {
      await admin.query('rollback');
      throw error;
    }
  };

  return {
    admin,
    connectionString: `postgresql://postgres:postgres@127.0.0.1:${port}/xidig_test`,
    withRole,
    asUser: (userId, fn) => withRole('authenticated', { sub: userId, role: 'authenticated' }, fn),

    async createAuthUser({ email, phone, password = false, gateBypass = false }) {
      const appMeta = gateBypass ? { xidig_gate_bypass: 'true' } : {};
      const result = await admin.query(
        `insert into auth.users (email, phone, encrypted_password, raw_app_meta_data)
         values ($1, $2, $3, $4) returning id`,
        [
          email ?? null,
          phone ?? null,
          password ? '$2a$10$fake.hash.for.tests.only' : null,
          JSON.stringify(appMeta),
        ],
      );
      return (result.rows[0] as { id: string }).id;
    },

    async createSignupGrant({ email, phone, inviteId, waitlistEntryId, expiresInMinutes = 15 }) {
      const result = await admin.query(
        `insert into signup_grants (email, phone, invite_id, waitlist_entry_id, expires_at)
         values ($1, $2, $3, $4, now() + make_interval(mins => $5)) returning id`,
        [email ?? null, phone ?? null, inviteId ?? null, waitlistEntryId ?? null, expiresInMinutes],
      );
      return (result.rows[0] as { id: string }).id;
    },

    async stop() {
      await admin.end().catch(() => {});
      await cluster.stop().catch(() => {});
      await rm(databaseDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

async function bootstrapSupabaseEnvironment(client: pg.Client): Promise<void> {
  await client.query(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;

    grant usage on schema public to anon, authenticated, service_role;

    -- Supabase's default privileges: every new object in public is granted to
    -- all three client roles. Migrations therefore REVOKE + re-grant.
    alter default privileges in schema public
      grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on sequences to anon, authenticated, service_role;

    create schema auth;

    -- Minimal GoTrue-shaped auth.users: only the columns our triggers and
    -- helpers read. GoTrue stores phone WITHOUT the leading '+' — tests
    -- exercise that via normalize_auth_phone.
    create table auth.users (
      id                  uuid primary key default gen_random_uuid(),
      email               text,
      phone               text,
      encrypted_password  text,
      raw_app_meta_data   jsonb not null default '{}'::jsonb,
      raw_user_meta_data  jsonb not null default '{}'::jsonb,
      created_at          timestamptz not null default now(),
      updated_at          timestamptz not null default now()
    );

    -- PostgREST puts the JWT claims in request.jwt.claims; auth.uid() is
    -- Supabase's accessor for the 'sub' claim.
    create function auth.uid() returns uuid
    language sql stable
    as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;

    grant usage on schema auth to anon, authenticated, service_role;
  `);
}

async function applyMigrations(client: pg.Client): Promise<void> {
  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
  }

  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await client.query(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
}
