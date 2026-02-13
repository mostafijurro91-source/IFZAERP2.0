
const CACHE_NAME = 'ifza-pwa-v4.1.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 🔔 Listen for background push events
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'IFZA Electronics', message: 'নতুন একটি নোটিফিকেশন এসেছে!' };
  
  const options = {
    body: data.message,
    icon: 'https://r.jina.ai/i/0f7939be338446b5a32b904586927500',
    badge: 'https://r.jina.ai/i/0f7939be338446b5a32b904586927500',
    vibrate: [200, 100, 200],
    data: { url: './index.html' },
    actions: [
      { action: 'open', title: 'চেক করুন ➔' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
