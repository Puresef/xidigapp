/**
 * Embedded-Postgres test harness for migration + RLS validation.
 *
 * Boots a real Postgres 17 cluster, recreates the parts of the Supabase
 * environment the migrations depend on (anon/authenticated/service_role
 * roles, the auth schema with a stubbed auth.users + auth.uid(), and
 * Supabase's broad default privileges), then applies every migration in
 * packages/db/supabase/migrations in filename order.
 *
 * RLS is exercised the same way PostgREST does it: SET LOCAL ROLE + a
 * request.jwt.claims GUC carrying the sub claim, inside a transaction.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';
import type pg from 'pg';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');

/**
 * Mirrors the Supabase runtime environment closely enough for the migrations
 * and RLS tests to be meaningful:
 *  - the three PostgREST roles, with service_role carrying BYPASSRLS;
 *  - broad default privileges for tables/sequences/functions in public
 *    (Supabase grants these, which is exactly why the migrations must
 *    explicitly revoke and re-grant column-level rights);
 *  - auth.users with the columns GoTrue maintains that our triggers and
 *    helpers read (email, phone WITHOUT the leading '+', encrypted_password,
 *    raw_app_meta_data);
 *  - auth.uid() reading the sub claim from request.jwt.claims.
 */
const SUPABASE_STUB_SQL = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  grant usage on schema public to anon, authenticated, service_role;

  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public
    grant execute on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;

  create table auth.users (
    id                  uuid primary key default gen_random_uuid(),
    email               text unique,
    phone               text unique,
    encrypted_password  text,
    raw_app_meta_data   jsonb not null default '{}'::jsonb,
    raw_user_meta_data  jsonb not null default '{}'::jsonb,
    email_confirmed_at  timestamptz,
    phone_confirmed_at  timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
  );

  create function auth.uid()
  returns uuid
  language sql stable
  as $fn$
    select case
      when coalesce(current_setting('request.jwt.claims', true), '') = '' then null
      else nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
    end
  $fn$;
`;

export type DbRole = 'anon' | 'authenticated' | 'service_role';

export interface TestHarness {
  /** Superuser client — table owner, bypasses RLS. Use for seeding/inspection. */
  root: pg.Client;
  /**
   * Run `fn` inside a transaction with SET LOCAL ROLE `role` and (optionally)
   * a JWT sub claim, exactly like a PostgREST request. Commits on success,
   * rolls back on error (and always resets role/claims either way).
   */
  as<T>(
    role: DbRole,
    uid: string | null,
    fn: (query: (text: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>,
  ): Promise<T>;
  stop(): Promise<void>;
}

export async function startHarness(): Promise<TestHarness> {
  const dataDir = await mkdtemp(join(tmpdir(), 'xidig-pg-'));
  const port = 54100 + Math.floor(Math.random() * 400);

  const cluster = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
  });

  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase('xidig_test');

  const root = cluster.getPgClient('xidig_test');
  await root.connect();

  await root.query(SUPABASE_STUB_SQL);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await root.query(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }

  return {
    root,
    async as(role, uid, fn) {
      await root.query('begin');
      try {
        if (uid !== null) {
          await root.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: uid, role }),
          ]);
        }
        await root.query(`select set_config('role', $1, true)`, [role]);
        const result = await fn((text, params) => root.query(text, params));
        await root.query('commit');
        return result;
      } catch (error) {
        await root.query('rollback');
        throw error;
      }
    },
    async stop() {
      await root.end().catch(() => undefined);
      await cluster.stop();
      await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
