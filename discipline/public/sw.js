// Истикама service worker: офлайн-оболочка + push-уведомления
const CACHE = 'istiqama-v8';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname === '/version.json') return;
  if (url.origin === location.origin) {
    // сеть в первую очередь (свежая версия), кэш — если нет интернета
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
  }
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Истикама', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Истикама', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' }, tag: d.tag || undefined,
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = new URL(url, self.location.origin).searchParams.get('open');
    for (const c of list) { if ('focus' in c) { if (open) c.postMessage({ open }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
