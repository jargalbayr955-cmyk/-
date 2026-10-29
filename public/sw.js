self.addEventListener('push', function(event) {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* Still show a notification for a malformed payload. */ }
  if (!data || typeof data !== 'object') data = {}
  const isDriverChat = data.type === 'DRIVER_CHAT'
  const title = data.title || 'Ачилт'
  const options = {
    body: data.body || (isDriverChat ? 'Шинэ зурвас ирлээ.' : 'Шинэ захиалга ирлээ!'),
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-32x32.png',
    tag: data.tag || undefined,
    vibrate: isDriverChat ? [120, 80, 120] : [300, 100, 300, 100, 300, 100, 500],
    data: { url: data.url || '/driver' },
    actions: [
      { action: 'open', title: 'Нээх' },
      { action: 'close', title: 'Хаах' }
    ]
  }

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      return clients.matchAll({ type: 'window' }).then(clientList => {
        clientList.forEach(client => {
          if (isDriverChat) {
            // Chat must never trigger the urgent customer-order horn or NEW_ORDER flow.
            client.postMessage({ type: 'DRIVER_CHAT' })
            return
          }
          if (data.type !== 'ORDER_SELECTED') client.postMessage({ type: 'PLAY_HORN' })
          client.postMessage({ type: 'NEW_ORDER' })
        })
      })
    })
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  if (event.action === 'close') return

  const targetUrl = event.notification.data?.url || '/driver'
  const fullUrl = self.location.origin + targetUrl

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Аль хэдийн нээлттэй driver tab байвал тэр tab-г focus хийх
      for (const client of clientList) {
        if (client.url.includes('/driver') && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(fullUrl)
    })
  )
})
