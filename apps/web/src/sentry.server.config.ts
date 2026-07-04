import * as Sentry from '@sentry/nextjs';

import { env } from './env';

// Node.js server runtime init. Imported by instrumentation.ts's register()
// after env validation has already run, so `env` is guaranteed valid here.
Sentry.init({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  includeLocalVariables: true,
  enableLogs: true,
});
