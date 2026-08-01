/*
 * Xidig service worker — Web Push receiver (§22 PWA push).
 *
 * We send PAYLOAD-LESS pushes (privacy: no message body leaves the server), so
 * this shows a generic "new activity" notification and, on click, opens the
 * app. The text is intentionally static English here — a service worker can't
 * read the app locale — and generic, so it never leaks who messaged you.
 */

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Xidig', {
      body: 'You have new activity on Xidig.',
      tag: 'xidig-activity',
      renotify: false,
      // Branded notification icon — same install-identity asset set (the
      // #0077cc mark on the dawn plate). No `badge`: a spec-correct badge is a
      // monochrome silhouette, which would be new art — deliberately skipped.
      icon: '/icon-192.png',
      data: { url: '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/notifications';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              /* cross-origin or unsupported — fall through to focus */
            }
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })(),
  );
});
