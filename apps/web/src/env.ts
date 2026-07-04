import { z } from 'zod';

/**
 * Version-agnostic URL validator. Avoids depending on Zod's `.url()` /
 * `z.url()` (which moved between Zod 3 and 4) by validating with the WHATWG
 * `URL` constructor directly.
 */
const urlString = (): z.ZodString =>
  z.string().refine(
    (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'must be a valid URL' },
  ) as unknown as z.ZodString;

/**
 * The full set of environment variables the app requires. Every key here must
 * also appear in `.env.example`. Keys with a `.default()` are optional; all
 * others are required and the app will refuse to boot without them.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase (server-only — safe to use the secret key with these)
  SUPABASE_URL: urlString(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),

  // Supabase (browser-exposed mirror of the two values above). Next.js only
  // inlines NEXT_PUBLIC_-prefixed vars into client bundles, so these must be
  // set to the *same* URL/publishable-key as a separate literal env var — see
  // src/lib/supabase-browser.ts, which reads these directly instead of
  // importing this module.
  NEXT_PUBLIC_SUPABASE_URL: urlString(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),

  // Transactional email
  EMAIL_API_KEY: z.string().min(1),

  // Maps
  MAPTILER_KEY: z.string().min(1),

  // Meilisearch (search)
  MEILISEARCH_HOST: urlString(),
  MEILISEARCH_API_KEY: z.string().min(1),

  // PostHog (analytics)
  POSTHOG_KEY: z.string().min(1),
  POSTHOG_HOST: urlString().default('https://us.i.posthog.com'),

  // Upstash (Redis / rate limiting)
  UPSTASH_REDIS_REST_URL: urlString(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Sentry (error monitoring): server/edge use SENTRY_DSN, the browser client
  // uses the NEXT_PUBLIC_ mirror (same reasoning as the Supabase keys above —
  // Next.js only inlines NEXT_PUBLIC_-prefixed vars into client bundles). A
  // DSN is not secret; it identifies where to send events, nothing more.
  // SENTRY_AUTH_TOKEN (build-time-only, used by withSentryConfig to upload
  // source maps) is intentionally NOT in this schema — see next.config.ts.
  SENTRY_DSN: urlString(),
  NEXT_PUBLIC_SENTRY_DSN: urlString(),

  // AI provider
  AI_API_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate an environment source. Throws a single, readable error listing every
 * offending variable — never a raw ZodError.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `❌ Invalid or missing environment variables:\n${details}\n\n` +
        `Copy .env.example to .env and fill in the required values. ` +
        `See docs/runbook.md for details.`,
    );
  }

  return result.data;
}

const skipValidation =
  process.env.SKIP_ENV_VALIDATION === 'true' || process.env.SKIP_ENV_VALIDATION === '1';

/**
 * The validated, typed environment. Importing this module fails fast (throws) at
 * runtime boot if configuration is missing or malformed.
 *
 * Validation is skipped when `SKIP_ENV_VALIDATION` is set, which the `build`
 * script does so that `next build` can run without real secrets. At actual boot
 * (`next start` / `next dev`) the flag is unset, so validation runs — see
 * `src/instrumentation.ts`.
 */
export const env: Env = skipValidation ? (process.env as unknown as Env) : parseEnv(process.env);
