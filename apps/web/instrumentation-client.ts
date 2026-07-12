// Client Sentry FORWARDING STUB (front-door standard §4.2; Warya 12 Jul):
// this file is bundled into every page, so it must NOT import '@sentry/nextjs'
// — statically OR dynamically. Measured under Turbopack (Next 16): this module
// is a special entry whose dynamic import() targets are hoisted into the eager
// chunk set on every route, so even `import('./src/lib/sentry-client')` here
// shipped the ~71KB gz SDK closure to anonymous visitors. The real client
// setup therefore lives with the signed-in app chrome instead:
//
//   - SentryBoot (src/components/sentry-boot.tsx) statically imports
//     lib/sentry-client and mounts inside AppChrome — whose next/dynamic
//     chunk is already proven to load ONLY for signed-in viewers (§4.1 8a).
//     After init it publishes the router-transition hook on a window handle.
//   - Signed-out visitors: AppChrome never loads, the handle is never set,
//     and this stub stays a no-op. Their error coverage is server-side Sentry
//     (instrumentation.ts onRequestError, untouched) plus global-error.tsx's
//     lazy on-fatal-error capture.
//
// Next.js requires onRouterTransitionStart to be exported from THIS module at
// module scope, which is exactly why deferring Sentry.init() alone evicts
// nothing (§4.2) — the export kept the SDK statically imported. The stub keeps
// the export but forwards through the window handle: a no-op until the real
// SDK loads, and forever a no-op for signed-out visitors. Transitions that
// happen before the chrome chunk lands are dropped — monitoring is
// best-effort, the page never waits for it.

export const onRouterTransitionStart = (href: string, navigationType: string): void => {
  if (typeof window === 'undefined') return;
  window.__xidigSentryRouterTransition?.(href, navigationType);
};
