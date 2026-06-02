// SnackHub push messages (shared/domain/push.js). Its own scope (/push/), so it never takes
// the place of the demo's mock service worker at the site root. It only shows messages and
// opens their page; it caches nothing.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {
    m = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(m.title || 'SnackHub', {
      body: m.body || 'You have a new message.',
      icon: '/assets/brand/icon-192.png',
      badge: '/assets/brand/icon-192.png',
      tag: m.tag || undefined,
      renotify: Boolean(m.tag),
      data: { url: typeof m.url === 'string' && m.url.startsWith('/') ? m.url : '/' },
    }),
  );
});

// open the message's page: an open SnackHub tab is reused, otherwise a new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
      if (tab) return tab.focus().then((c) => c.navigate?.(url) ?? c);
      return self.clients.openWindow(url);
    }),
  );
});
