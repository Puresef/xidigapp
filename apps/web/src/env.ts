import { z } from 'zod';

/**
 * Version-agnostic URL validator. Avoids depending on Zod's `.url()` /
 * `z.url()` (which moved between Zod 3 and 4) by validating with the WHATWG
 * `URL` constructor directly.
 */
const isUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const urlString = (): z.ZodString =>
  z.string().refine(isUrl, { message: 'must be a valid URL' }) as unknown as z.ZodString;

/**
 * A URL var for an OPTIONAL external service: an empty string is allowed
 * (feature disabled / degrades gracefully — the app must still boot), but a
 * NON-empty value must be a well-formed URL so a typo is still caught. Defaults
 * to '' when unset.
 */
const optionalUrl = (): z.ZodDefault<z.ZodString> =>
  z
    .string()
    .refine((v) => v === '' || isUrl(v), { message: 'must be empty or a valid URL' })
    .default('') as unknown as z.ZodDefault<z.ZodString>;

/** An optional secret/key for an external service — unset means disabled. */
const optionalKey = (): z.ZodDefault<z.ZodString> => z.string().default('');

/**
 * A URL var that has a sensible fallback default. Crucially, an EMPTY string
 * (e.g. a blank Vercel env value, or a copied-but-uncommented `.env.example`
 * line) is treated as UNSET, so the default applies and the app still boots —
 * rather than hard-failing validation on `''`. A non-empty value must still be
 * a well-formed URL so a typo is caught. This is the "no hard-fail boot" intent
 * for optional-with-default URLs (required URLs like SUPABASE_URL stay strict).
 */
const urlWithDefault = (fallback: string): z.ZodType<string> =>
  z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().refine(isUrl, { message: 'must be a valid URL' }).default(fallback),
  ) as z.ZodType<string>;

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
  APP_URL: urlWithDefault('http://localhost:3000'),

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
  // Optional: unset ⇒ auth emails fall back to console-logging the link
  // (getEmailProvider) so the app still boots and links are retrievable from
  // logs. Set it before inviting real members.
  EMAIL_API_KEY: optionalKey(),
  EMAIL_PROVIDER: z.enum(['auto', 'resend', 'console']).default('auto'),
  EMAIL_FROM: z.string().min(1).default('Xidig <onboarding@resend.dev>'),
  // Signing secret for the provider's delivery webhooks (Resend → Svix,
  // "whsec_..."). Empty = webhook endpoint disabled (returns 503).
  EMAIL_WEBHOOK_SECRET: z.string().default(''),

  // Front-door contact intake destination (docs/front-door-plan.md §3).
  // Optional: unset ⇒ /contact renders a waitlist fallback and the API
  // refuses with contact_unavailable — fail-safe, never a hard error page.
  CONTACT_INBOX: optionalKey(),

  // Maps (optional — the map degrades / uses OSM tiles without it)
  MAPTILER_KEY: optionalKey(),

  // Meilisearch (optional — directory/global search falls back to Postgres
  // trigram; unset just disables any Meilisearch ranking layer)
  MEILISEARCH_HOST: optionalUrl(),
  MEILISEARCH_API_KEY: optionalKey(),

  // PostHog (optional — analytics disables cleanly when POSTHOG_KEY is unset)
  POSTHOG_KEY: optionalKey(),
  POSTHOG_HOST: urlWithDefault('https://us.i.posthog.com'),

  // Upstash (optional — rate limiting disables (fail-open) when unset/not https)
  UPSTASH_REDIS_REST_URL: optionalUrl(),
  UPSTASH_REDIS_REST_TOKEN: optionalKey(),

  // Sentry (error monitoring): server/edge use SENTRY_DSN, the browser client
  // uses the NEXT_PUBLIC_ mirror (same reasoning as the Supabase keys above —
  // Next.js only inlines NEXT_PUBLIC_-prefixed vars into client bundles). A
  // DSN is not secret; it identifies where to send events, nothing more.
  // SENTRY_AUTH_TOKEN (build-time-only, used by withSentryConfig to upload
  // source maps) is intentionally NOT in this schema — see next.config.ts.
  // Optional: unset ⇒ Sentry.init gets an empty DSN and disables itself
  // (no-op), so monitoring is off but the app still boots.
  SENTRY_DSN: optionalUrl(),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl(),

  // AI provider key for the active moderation provider (see below). For
  // 'openai' this is an OpenAI API key (the omni-moderation endpoint is free);
  // for 'anthropic' it's an Anthropic key. Phase 8 generation/seeding will add
  // its own provider key separately. Optional: unset ⇒ moderation falls back to
  // the console provider (content ships unscanned as 'skipped', fail-open).
  AI_API_KEY: optionalKey(),
  // AI moderation pre-scan (§15/§24). 'openai' = OpenAI omni-moderation (free,
  // multimodal text+image — recommended in production); 'anthropic' = Claude
  // Haiku; 'auto' = anthropic in production, console in development; 'console'
  // = log + skip. 'console' never blocks content; unscanned content ships with
  // verdict 'skipped' (fail-open).
  AI_MODERATION_PROVIDER: z.enum(['auto', 'openai', 'anthropic', 'console']).default('auto'),

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
