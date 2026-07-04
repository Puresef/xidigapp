import * as Sentry from '@sentry/nextjs';

/**
 * Next.js runs `register()` once when the server process boots. Importing the
 * env module here forces validation at startup, so a misconfigured deployment
 * fails fast with a clear error instead of failing later on a random request.
 *
 * Env validation runs first and unconditionally (both runtimes), then Sentry
 * is initialized per runtime — sentry.server.config.ts / sentry.edge.config.ts
 * import { env } from './env', which is only safe once validation has passed.
 */
export async function register(): Promise<void> {
  await import('./env');

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
