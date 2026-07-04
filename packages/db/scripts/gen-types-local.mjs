/**
 * Generate src/database.types.ts WITHOUT a remote Supabase project or Docker:
 * boots an embedded Postgres 17, replays the Supabase environment stub + all
 * migrations (same as the test harness), then points the Supabase CLI's type
 * generator at it via --db-url.
 *
 * Usage: pnpm --filter @xidig/db gen-types:local
 */
import { execSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const migrationsDir = join(pkgRoot, 'supabase', 'migrations');

const STUB_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    phone text unique,
    encrypted_password text,
    raw_app_meta_data jsonb not null default '{}'::jsonb,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    email_confirmed_at timestamptz,
    phone_confirmed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $fn$
    select case
      when coalesce(current_setting('request.jwt.claims', true), '') = '' then null
      else nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
    end
  $fn$;
`;

const dataDir = await mkdtemp(join(tmpdir(), 'xidig-gentypes-'));
const port = 54600 + Math.floor(Math.random() * 300);

const cluster = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: false,
});

try {
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase('xidig_types');

  const client = cluster.getPgClient('xidig_types');
  await client.connect();
  await client.query(STUB_SQL);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await client.query(await readFile(join(migrationsDir, file), 'utf8'));
    console.log(`applied ${file}`);
  }
  await client.end();

  const dbUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/xidig_types`;
  console.log('generating types…');
  execSync(
    `pnpm dlx supabase@latest gen types typescript --db-url "${dbUrl}" --schema public > src/database.types.ts`,
    { cwd: pkgRoot, stdio: ['ignore', 'inherit', 'inherit'], shell: '/bin/bash' },
  );
  console.log('wrote src/database.types.ts');
} finally {
  await cluster.stop().catch(() => undefined);
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
}
