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
  if (event.action === 'close') return

  const targetUrl = event.notification.data?.url || '/driver'
  const fullUrl = self.location.origin + targetUrl

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Аль хэдийн нээлттэй tab байвал тэр tab-г focus хийх
      for (const client of clientList) {
        if (client.url.includes('/driver') && 'focus' in client) {
          return client.focus()
        }
      }
      // Байхгүй бол шинэ tab нээх
      return clients.openWindow(fullUrl)
    })
  )
})
