/**
 * Regenerate src/database.types.ts from the migrations — no Supabase project
 * or Docker needed. Boots the same embedded-postgres harness the tests use
 * (roles + auth stub + all migrations) and introspects pg_catalog, emitting
 * the same `Database` shape `supabase gen types typescript` produces, so the
 * types always match the migration chain in this repo.
 *
 * Run from packages/db:  pnpm gen-types:local
 *
 * Once a hosted Supabase project exists, `pnpm gen-types` (Supabase CLI
 * against the project ref) should produce equivalent output; this script is
 * the offline source of truth until then.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';

import { createTestDatabase } from '../src/testing/harness';

const OUT_FILE = fileURLToPath(new URL('../src/database.types.ts', import.meta.url));

interface ColumnInfo {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: boolean;
  has_default: boolean;
}

interface EnumInfo {
  enum_name: string;
  labels: string[];
}

interface FunctionInfo {
  proname: string;
  args: { name: string; type_udt: string }[];
  retset: boolean;
  /** Scalar return udt, or null when the function returns a table/record. */
  ret_udt: string | null;
  /** OUT/TABLE columns when returning a record. */
  out_cols: { name: string; type_udt: string }[];
}

function tsType(udt: string, enums: Map<string, string>): string {
  if (udt.startsWith('_')) {
    return `${tsType(udt.slice(1), enums)}[]`;
  }
  if (enums.has(udt)) return `Database['public']['Enums']['${udt}']`;
  switch (udt) {
    case 'text':
    case 'citext':
    case 'varchar':
    case 'uuid':
    case 'timestamptz':
    case 'timestamp':
    case 'date':
    case 'time':
      return 'string';
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'json':
    case 'jsonb':
      return 'Json';
    default:
      throw new Error(`No TypeScript mapping for Postgres type "${udt}" — extend tsType().`);
  }
}

async function introspect(client: pg.Client) {
  // Objects owned by extensions (citext ships operators/functions into
  // public) are not part of the app schema — exclude via pg_depend.
  const columns = await client.query<ColumnInfo>(`
    select c.relname as table_name,
           a.attname as column_name,
           t.typname as udt_name,
           not a.attnotnull as is_nullable,
           (a.atthasdef or a.attidentity <> '') as has_default
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
    order by c.relname, a.attnum
  `);

  const enums = await client.query<EnumInfo>(`
    select t.typname as enum_name,
           array_agg(e.enumlabel::text order by e.enumsortorder) as labels
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname
    order by t.typname
  `);

  const functions = await client.query<FunctionInfo>(`
    select p.proname,
           p.proretset as retset,
           case when rt.typtype = 'p' then null else rt.typname end as ret_udt,
           coalesce((
             -- oidvector subscripts are 0-based; proargnames is 1-based
             select jsonb_agg(jsonb_build_object(
                      'name', coalesce(p.proargnames[i + 1], 'arg' || (i + 1)),
                      'type_udt', it.typname) order by i)
             from generate_subscripts(p.proargtypes, 1) i
             join pg_type it on it.oid = p.proargtypes[i]
           ), '[]'::jsonb) as args,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', p.proargnames[i],
                      'type_udt', ot.typname) order by i)
             from unnest(p.proallargtypes) with ordinality as u(oid, i)
             join pg_type ot on ot.oid = u.oid
             where p.proargmodes[i] in ('o', 't')
           ), '[]'::jsonb) as out_cols
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type rt on rt.oid = p.prorettype
    where n.nspname = 'public'
      and rt.typname <> 'trigger'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
    order by p.proname
  `);

  return { columns: columns.rows, enums: enums.rows, functions: functions.rows };
}

function render(data: Awaited<ReturnType<typeof introspect>>): string {
  const enumNames = new Map(data.enums.map((e) => [e.enum_name, e.enum_name]));

  const tables = new Map<string, ColumnInfo[]>();
  for (const col of data.columns) {
    const cols = tables.get(col.table_name) ?? [];
    cols.push(col);
    tables.set(col.table_name, cols);
  }

  const lines: string[] = [];
  const push = (indent: number, text: string) => lines.push(`${'  '.repeat(indent)}${text}`);

  push(0, `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]`);
  push(0, ``);
  push(0, `export type Database = {`);
  push(1, `public: {`);
  push(2, `Tables: {`);

  for (const [table, cols] of [...tables.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    push(3, `${table}: {`);
    push(4, `Row: {`);
    for (const c of cols) {
      push(5, `${c.column_name}: ${tsType(c.udt_name, enumNames)}${c.is_nullable ? ' | null' : ''}`);
    }
    push(4, `}`);
    push(4, `Insert: {`);
    for (const c of cols) {
      const optional = c.is_nullable || c.has_default;
      push(
        5,
        `${c.column_name}${optional ? '?' : ''}: ${tsType(c.udt_name, enumNames)}${c.is_nullable ? ' | null' : ''}`,
      );
    }
    push(4, `}`);
    push(4, `Update: {`);
    for (const c of cols) {
      push(5, `${c.column_name}?: ${tsType(c.udt_name, enumNames)}${c.is_nullable ? ' | null' : ''}`);
    }
    push(4, `}`);
    push(4, `Relationships: []`);
    push(3, `}`);
  }

  push(2, `}`);
  push(2, `Views: Record<string, never>`);
  push(2, `Functions: {`);
  for (const fn of data.functions) {
    const args =
      fn.args.length === 0
        ? `Record<PropertyKey, never>`
        : `{ ${fn.args.map((a) => `${a.name}: ${tsType(a.type_udt, enumNames)}`).join('; ')} }`;
    let returns: string;
    if (fn.ret_udt === null || fn.out_cols.length > 0) {
      const record = `{ ${fn.out_cols.map((c) => `${c.name}: ${tsType(c.type_udt, enumNames)}`).join('; ')} }`;
      returns = fn.retset ? `${record}[]` : record;
    } else {
      const scalar = fn.ret_udt === 'void' ? 'undefined' : tsType(fn.ret_udt, enumNames);
      returns = fn.retset ? `${scalar}[]` : scalar;
    }
    push(3, `${fn.proname}: {`);
    push(4, `Args: ${args}`);
    push(4, `Returns: ${returns}`);
    push(3, `}`);
  }
  push(2, `}`);
  push(2, `Enums: {`);
  for (const e of data.enums) {
    push(3, `${e.enum_name}: ${e.labels.map((l) => JSON.stringify(l)).join(' | ')}`);
  }
  push(2, `}`);
  push(2, `CompositeTypes: Record<string, never>`);
  push(1, `}`);
  push(0, `}`);
  push(0, ``);
  push(0, `export type Tables<T extends keyof Database['public']['Tables']> =`);
  push(1, `Database['public']['Tables'][T]['Row']`);
  push(0, `export type TablesInsert<T extends keyof Database['public']['Tables']> =`);
  push(1, `Database['public']['Tables'][T]['Insert']`);
  push(0, `export type TablesUpdate<T extends keyof Database['public']['Tables']> =`);
  push(1, `Database['public']['Tables'][T]['Update']`);
  push(0, `export type Enums<T extends keyof Database['public']['Enums']> =`);
  push(1, `Database['public']['Enums'][T]`);
  push(0, ``);

  return lines.join('\n');
}

const HEADER = `// AUTO-GENERATED from the migrations in supabase/migrations — do not edit.
//
// Regenerate with \`pnpm gen-types:local\` (embedded-postgres, no Supabase
// project or Docker needed). Once a hosted project exists, \`pnpm gen-types\`
// against the project ref should produce an equivalent Database shape.
`;

const db = await createTestDatabase();
try {
  const data = await introspect(db.admin);
  writeFileSync(OUT_FILE, `${HEADER}\n${render(data)}`);
  console.log(`Wrote ${OUT_FILE} (${data.columns.length} columns, ${data.functions.length} functions)`);
} finally {
  await db.stop();
}
