/* Keep existing timer/task notification clicks useful when system delivery uses the worker. */
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const app = windows.find(client => client.url.startsWith(self.registration.scope) && client.visibilityState === 'visible')
      || windows.find(client => client.url.startsWith(self.registration.scope))
    if (app) await app.focus()
    else await self.clients.openWindow(self.registration.scope)
  })())
})
