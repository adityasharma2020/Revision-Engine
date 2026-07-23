/* Service-worker notification handlers. Kept separate so Workbox can import it. */
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'UPSC Revision Engine', {
    body: payload.body || 'You have a new study update.',
    icon: new URL('app-icon-192.png', self.registration.scope).href,
    badge: new URL('notification-badge.png', self.registration.scope).href,
    tag: payload.tag || 'study-update',
    renotify: true,
    actions: Array.isArray(payload.actions) ? payload.actions.map(({ action, title }) => ({ action, title })) : [],
    data: { url: payload.url || './', actions: payload.actions || [] },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const selectedAction = event.notification.data?.actions?.find((item) => item.action === event.action);
  const destination = new URL(selectedAction?.url || event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) { existing.navigate(destination); return existing.focus(); }
    return self.clients.openWindow(destination);
  }));
});
