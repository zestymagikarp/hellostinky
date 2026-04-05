// Service Worker — handles push notifications and offline caching

self.addEventListener('install', e => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Push notification received
self.addEventListener('push', e => {
  const data = e.data?.json() || {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'HelloStinky', {
      body: data.body || "Time to pick your meals for the week!",
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      actions: [
        { action: 'open', title: 'Pick meals now' },
        { action: 'dismiss', title: 'Later' }
      ]
    })
  )
})

// Notification clicked
self.addEventListener('notificationclick', e => {
  e.notification.close()
  if (e.action === 'dismiss') return
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url === '/' && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow('/')
    })
  )
})

// Cache app shell for offline use
const CACHE = 'hellostinky-v1'
const PRECACHE = ['/', '/index.html']

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    )
  }
})
