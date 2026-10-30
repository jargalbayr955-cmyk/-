self.addEventListener('push', function(event) {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* Still show a notification for a malformed payload. */ }
  if (!data || typeof data !== 'object') data = {}
  const isDriverChat = data.type === 'DRIVER_CHAT'
  const isUrgentOrder = data.type === 'ORDER_INVITE' || data.type === 'ORDER_SELECTED'
  const title = data.title || 'Ачилт'
  const options = {
    body: data.body || (isDriverChat ? 'Шинэ зурвас ирлээ.' : 'Шинэ захиалга ирлээ!'),
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-32x32.png',
    tag: data.tag || undefined,
    renotify: isUrgentOrder,
    requireInteraction: isUrgentOrder,
    silent: false,
    vibrate: isDriverChat ? [120, 80, 120] : [300, 100, 300, 100, 300, 100, 500],
    data: { url: data.url || '/driver', delivery_id: data.delivery_id || null, order_id: data.order_id || null },
    actions: [
      { action: 'open', title: 'Нээх' },
      { action: 'close', title: 'Хаах' }
    ]
  }

  const acknowledge = data.delivery_id
    ? fetch('/api/push/ack', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_id: data.delivery_id }),
      }).catch(() => null)
    : Promise.resolve(null)

  event.waitUntil(Promise.all([
    acknowledge,
    self.registration.showNotification(title, options).then(() => {
      return clients.matchAll({ type: 'window' }).then(clientList => {
        clientList.forEach(client => {
          if (isDriverChat) {
            // Chat must never trigger the urgent customer-order horn or NEW_ORDER flow.
            client.postMessage({ type: 'DRIVER_CHAT' })
            return
          }
          if (data.type !== 'ORDER_SELECTED') client.postMessage({ type: 'PLAY_HORN' })
          client.postMessage({ type: 'NEW_ORDER', orderId: data.order_id || null })
        })
      })
    })
  ]))
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  if (event.action === 'close') return

  const targetUrl = event.notification.data?.url || '/driver'
  const fullUrl = self.location.origin + targetUrl

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async function(clientList) {
      for (const client of clientList) {
        if (!client.url.startsWith(self.location.origin) || !('focus' in client)) continue
        client.postMessage({ type: 'NEW_ORDER', orderId: event.notification.data?.order_id || null })
        if ('navigate' in client && client.url !== fullUrl) {
          try {
            const navigated = await client.navigate(fullUrl)
            return navigated ? navigated.focus() : client.focus()
          } catch {
            return client.focus()
          }
        }
        return client.focus()
      }
      return clients.openWindow(fullUrl)
    })
  )
})
