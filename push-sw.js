/* Phone notifications. Loaded by the app service worker. */
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'FlowField'
  const body = typeof payload.body === 'string' ? payload.body : ''
  const tag = typeof payload.tag === 'string' && payload.tag ? payload.tag : 'flowfield'
  const url = typeof payload.url === 'string' ? payload.url : ''
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      icon: 'icons/icon-192.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data && event.notification.data.url
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const scope = self.registration.scope
      for (const client of windows) {
        if (!client.url.startsWith(scope)) continue
        await client.focus()
        if (target && typeof client.navigate === 'function') {
          try {
            await client.navigate(target)
          } catch {
            if (target) await self.clients.openWindow(target)
          }
        }
        return
      }
      if (target) await self.clients.openWindow(target)
    })(),
  )
})
