/* Service-worker notification handlers. Kept separate so Workbox can import it. */
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() }; }
  const options = {
    body: payload.body || 'You have a new study update.',
    icon: new URL('app-icon-192.png', self.registration.scope).href,
    badge: new URL('notification-badge.png', self.registration.scope).href,
    tag: payload.tag || 'study-update',
    renotify: true,
    ...(payload.image ? { image: payload.image } : {}),
    ...(Number.isFinite(payload.timestamp) ? { timestamp: payload.timestamp } : {}),
    actions: Array.isArray(payload.actions) ? payload.actions.map(({ action, title }) => ({ action, title })) : [],
    data: { url: payload.url || './', actions: payload.actions || [], imageAlt: payload.imageAlt || '' },
  };
  event.waitUntil((async () => {
    try {
      await self.registration.showNotification(payload.title || 'Revision Engine', options);
    } catch (error) {
      // A remote image can disappear after dispatch. Preserve the useful text
      // notification instead of losing the entire delivery.
      if (!options.image) throw error;
      delete options.image;
      await self.registration.showNotification(payload.title || 'Revision Engine', options);
    }
  })());
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
