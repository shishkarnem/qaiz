import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

interface SwClients {
  matchAll(options?: { type?: 'window' | 'worker' | 'sharedworker' | 'all'; includeUncontrolled?: boolean }): Promise<any[]>;
  openWindow(url: string): Promise<any>;
}

interface SwRegistration {
  showNotification(title: string, options?: any): Promise<void>;
}

interface SwScope {
  __WB_MANIFEST: Array<any>;
  location: Location;
  clients: SwClients;
  registration: SwRegistration;
  skipWaiting(): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void): void;
}

const sw = self as unknown as SwScope;

cleanupOutdatedCaches();
precacheAndRoute((self as unknown as SwScope).__WB_MANIFEST || []);

sw.addEventListener('install', () => {
  sw.skipWaiting().catch(() => {});
});

sw.addEventListener('activate', (event: any) => {
  event.waitUntil(
    (async () => {
      const clientsApi = sw.clients as any;
      if (clientsApi && typeof clientsApi.claim === 'function') {
        await clientsApi.claim();
      }
    })()
  );
});

// Cache local images and icons with CacheFirst
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' && url.origin === sw.location.origin,
  new CacheFirst({
    cacheName: 'qaiz-local-images-v1',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

// Cache JS/CSS/worker chunks with StaleWhileRevalidate
registerRoute(
  ({ request }) =>
    request.destination === 'style' || request.destination === 'script' || request.destination === 'font',
  new StaleWhileRevalidate({
    cacheName: 'qaiz-static-assets-v1',
  })
);

// Network-first for dynamic game/news/blog API GET calls (never cache auth/mutations)
registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    url.origin === sw.location.origin &&
    (url.pathname.startsWith('/api/posts') || url.pathname.startsWith('/api/games')),
  new NetworkFirst({
    cacheName: 'qaiz-public-api-v1',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 24 * 60 * 60,
      }),
    ],
  })
);

// Incoming Web Push notification handler (Android, Desktop, iOS 16.4+ PWA)
sw.addEventListener('push', (event: any) => {
  let payload: any = {
    title: 'Квайз (qAIz)',
    body: 'У вас новое уведомление',
    url: '/profile/notifications',
    tag: 'qaiz-push',
    icon: '/pwa-192x192.png',
    badge: '/icon-96x96.png',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      try {
        payload.body = event.data.text();
      } catch (_) {}
    }
  }

  event.waitUntil(
    sw.registration.showNotification(payload.title || 'Квайз (qAIz)', {
      body: payload.body || '',
      icon: payload.icon || '/pwa-192x192.png',
      badge: payload.badge || '/icon-96x96.png',
      tag: payload.tag || 'qaiz-push',
      renotify: true,
      vibrate: [120, 60, 120],
      data: {
        url: payload.url || '/profile/notifications',
        type: payload.type || 'system_news',
      },
    })
  );
});

// Notification click handler: focus open tab or open target route
sw.addEventListener('notificationclick', (event: any) => {
  event.notification?.close();
  const targetUrl = String(event.notification?.data?.url || '/profile/notifications');

  event.waitUntil(
    (async () => {
      const allClients = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if (client.url && client.url.startsWith(sw.location.origin)) {
          if (typeof client.navigate === 'function') {
            await client.navigate(targetUrl).catch(() => {});
          }
          if (typeof client.focus === 'function') {
            return client.focus();
          }
        }
      }

      return sw.clients.openWindow(targetUrl);
    })()
  );
});
