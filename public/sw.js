self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Ачилт'
  const options = {
    body: data.body || 'Шинэ захиалга ирлээ!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-32x32.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/driver' },
    actions: [
      { action: 'open', title: 'Нээх' },
      { action: 'close', title: 'Хаах' }
    ]
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  if (event.action === 'open' || !event.action) {
    event.waitUntil(clients.openWindow(event.notification.data.url || '/driver'))
  }
})
