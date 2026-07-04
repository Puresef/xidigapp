# Xidig

Monorepo for Xidig v1.0.

## Stack

- **pnpm workspaces** — no Turborepo.
- **apps/web** — Next.js (App Router, TypeScript, `src/`, `@/*` alias).
- **packages/db** — Supabase clients (server + browser) and migrations.
- **packages/ui** — shared React components.
- **packages/config** — shared strict `tsconfig.base.json`, ESLint, and Prettier config.

## Requirements

- Node `>=22` (see `.nvmrc`)
- pnpm (pinned via `packageManager`; run `corepack enable` or install pnpm)

## Quickstart

```bash
pnpm install
cp .env.example .env   # then fill in values
pnpm dev
```

A fresh clone passes with no manual steps:

```bash
pnpm install
pnpm test
pnpm build
```

## Scripts (root)

| Script              | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `pnpm dev`          | Run the web app in dev mode                             |
| `pnpm build`        | Build all packages/apps                                 |
| `pnpm test`         | Run the Vitest suite once                               |
| `pnpm lint`         | Lint the whole repo (ESLint flat config)                |
| `pnpm typecheck`    | Typecheck every package with `tsc --noEmit`             |
| `pnpm format`       | Format with Prettier                                    |
| `pnpm db:gen-types` | Regenerate Supabase types (needs `SUPABASE_PROJECT_ID`) |

## Environment

Every variable is validated at boot by [`apps/web/src/env.ts`](apps/web/src/env.ts).
A missing or malformed required value makes the app fail fast with a clear error.
`next build` runs with `SKIP_ENV_VALIDATION=true`, so building never requires
real secrets. See [`docs/runbook.md`](docs/runbook.md).

## CI

`.github/workflows/ci.yml` runs on every PR: `install → lint → typecheck → test
→ build`. Configure branch protection to require the **CI** check so failures
block merge.
