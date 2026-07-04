# Supabase

Database schema, migrations, and generated types for Xidig.

## Layout

- `migrations/` — SQL migrations applied in filename order. Create new ones with
  `supabase migration new <name>` (Supabase CLI).
- `../src/database.types.ts` — TypeScript types generated from the live schema.

## Common tasks

```bash
# Generate TypeScript types from a remote project (from the repo root):
SUPABASE_PROJECT_ID=<project-ref> pnpm db:gen-types

# Create a new migration:
supabase migration new add_widgets_table

# Apply migrations to the linked project:
supabase db push
```

The Supabase CLI is fetched on demand via `pnpm dlx` — it is intentionally not a
committed dependency. Install it globally if you prefer:
<https://supabase.com/docs/guides/cli>.
