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

// Early-error buffer for signed-in members (adversarial-review fix): between
// this module's pre-hydration execution and SentryBoot's init (hydration +
// the AppChrome chunk fetch — a real window on the slow connections this
// product targets), window 'error'/'unhandledrejection' events would
// otherwise be silently lost — the SDK attaches its global handlers only at
// init, and global-error.tsx sees render-tree errors only. Buffer them here
// (capped, listeners detached at drain) so initSentryClient can replay them.
// Signed-out visitors attach nothing: the buffer would never drain.
if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  // Signed-in detection is cookie-presence only (the Supabase auth cookie) —
  // the same signal the shell branches on, re-checked in initSentryClient.
  /(?:^|;\s*)sb-[^=]*-auth-token[^=]*=/.test(document.cookie)
) {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    if (errors.length < 20) errors.push(event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (errors.length < 20) errors.push(event.reason);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.__xidigSentryEarlyErrors = {
    errors,
    detach() {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    },
  };
}
