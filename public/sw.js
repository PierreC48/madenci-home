self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let p = {};
  try {
    p = event.data?.json() || {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(p.title || 'Aile Evi', {
      body: p.body || 'Ailenizin listesinde bir değişiklik var.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: p.tag || 'aile-update',
      data: { url: '/?notifications=1' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate('/?notifications=1');
        await existing.focus();
      } else {
        await self.clients.openWindow('/?notifications=1');
      }
    })()
  );
});
