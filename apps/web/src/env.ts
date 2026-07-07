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

  // Canonical origin of this deployment. Used to build auth links (magic
  // links, confirmation, reset) in self-sent emails — never derived from
  // request headers (host-header injection would poison auth links).
  APP_URL: urlString().default('http://localhost:3000'),

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

  // Transactional email. Auth emails (magic links, confirmations, resets)
  // are sent by the app itself — not by Supabase SMTP — so link expiry can be
  // enforced app-side (10-minute magic links vs 60-minute reset links, §26).
  // 'auto' = resend in production, console (log the link) in development.
  EMAIL_API_KEY: z.string().min(1),
  EMAIL_PROVIDER: z.enum(['auto', 'resend', 'console']).default('auto'),
  EMAIL_FROM: z.string().min(1).default('Xidig <onboarding@resend.dev>'),
  // Signing secret for the provider's delivery webhooks (Resend → Svix,
  // "whsec_..."). Empty = webhook endpoint disabled (returns 503).
  EMAIL_WEBHOOK_SECRET: z.string().default(''),

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
  // AI moderation pre-scan (§15/§24). 'auto' = anthropic in production,
  // console (log + skip) in development — same selection idea as
  // EMAIL_PROVIDER. 'console' never blocks content; unscanned content ships
  // with verdict 'skipped'.
  AI_MODERATION_PROVIDER: z.enum(['auto', 'anthropic', 'console']).default('auto'),

  // Shared secret for scheduled-job routes (/api/cron/*). Vercel Cron sends
  // it as `Authorization: Bearer <CRON_SECRET>` automatically when the env
  // var is set. Empty = cron endpoints disabled (503), matching the
  // EMAIL_WEBHOOK_SECRET pattern.
  CRON_SECRET: z.string().default(''),

  // Web Push / VAPID (§22 PWA push; §26 push = DMs/mentions/replies). All
  // optional: unset = push DISABLED (in-app notifications still work), same
  // fail-safe posture as CRON_SECRET/EMAIL_WEBHOOK_SECRET. Generate a keypair
  // with `npx web-push generate-vapid-keys` (see docs/runbook.md). The public
  // key is also exposed to the browser (mirror) so the client can subscribe;
  // the private key is server-only. Subject is a `mailto:` or https contact.
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default(''),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().default(''),
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
 * `SKIP_ENV_VALIDATION` (set by the `build` script, and by the dev launcher)
 * only suppresses the *throw* — it must NOT skip schema parsing wholesale, or
 * every `.default()` silently vanishes and load-bearing vars like `APP_URL`
 * come through `undefined` (which breaks auth-link construction). So: always
 * parse; apply the validated result (defaults included) whenever the env is
 * valid; fall back to raw `process.env` only when validation genuinely fails
 * AND skipping is requested (i.e. `next build` without real secrets).
 */
function resolveEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (result.success) return result.data;
  if (skipValidation) return process.env as unknown as Env;
  return parseEnv(process.env); // re-run to throw the readable, aggregated error
}

export const env: Env = resolveEnv();
