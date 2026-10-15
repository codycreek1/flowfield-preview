/*! © 2026 FlowField Pro. All rights reserved. */
/* Phone notifications. Loaded by the app service worker. */
var APP_BADGE_CACHE = 'flowfield-app-badge'
var APP_BADGE_URL = '/flowfield-app-badge'
var APP_BADGE_MESSAGE = 'flowfield-badge'
var BADGE_CAP = 999999

function normalizeBadgeCount(count) {
  if (typeof count !== 'number' || !isFinite(count) || count <= 0) return 0
  return Math.min(Math.floor(count), BADGE_CAP)
}

/** Exact `badge` from a push wins. Anything else raises the last cached count by one. */
function badgeCountFromPush(cached, badge) {
  if (typeof badge === 'number' && isFinite(badge) && badge >= 0) {
    return Math.min(Math.floor(badge), BADGE_CAP)
  }
  return Math.min(normalizeBadgeCount(cached) + 1, BADGE_CAP)
}

/** Closed app: set the badge. Open app: leave it so the page can match the bell. */
function badgeForPush(appOpen, cached, badge) {
  if (appOpen) return null
  return badgeCountFromPush(cached, badge)
}

function badgeHosts() {
  var hosts = []
  if (self.registration) hosts.push(self.registration)
  if (self.navigator) hosts.push(self.navigator)
  return hosts
}

async function applySwBadge(count) {
  var n = normalizeBadgeCount(count)
  var hosts = badgeHosts()
  for (var i = 0; i < hosts.length; i += 1) {
    var host = hosts[i]
    if (n === 0 && typeof host.clearAppBadge === 'function') {
      try {
        await host.clearAppBadge()
        return
      } catch {
        // Try setAppBadge(0) on this host, then the other host.
      }
    }
    if (typeof host.setAppBadge !== 'function') continue
    try {
      await host.setAppBadge(n)
      return
    } catch {
      // Try the other host. Badging is unsupported or permission is missing.
    }
  }
}

async function readCachedBadge() {
  try {
    var cache = await caches.open(APP_BADGE_CACHE)
    var hit = await cache.match(APP_BADGE_URL)
    if (!hit) return 0
    var n = Number(await hit.text())
    return normalizeBadgeCount(n)
  } catch {
    return 0
  }
}

async function writeCachedBadge(count) {
  var cache = await caches.open(APP_BADGE_CACHE)
  await cache.put(APP_BADGE_URL, new Response(String(count), { headers: { 'content-type': 'text/plain' } }))
}

async function visibleClients() {
  if (!self.clients || typeof self.clients.matchAll !== 'function') return []
  var windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  var visible = []
  for (var i = 0; i < windows.length; i += 1) {
    if (windows[i].visibilityState === 'visible') visible.push(windows[i])
  }
  return visible
}

async function syncPushBadge(payload) {
  var visible = []
  try {
    visible = await visibleClients()
  } catch {
    visible = []
  }
  if (visible.length) {
    for (var i = 0; i < visible.length; i += 1) {
      try {
        if (typeof visible[i].postMessage === 'function') visible[i].postMessage({ type: 'flowfield-push' })
      } catch {
        // The open page still matches the badge to the bell on its own.
      }
    }
    return
  }
  var next = badgeForPush(false, await readCachedBadge(), payload && payload.badge)
  if (next === null) return
  await writeCachedBadge(next)
  await applySwBadge(next)
}

self.addEventListener('push', (event) => {
  var payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }
  var title = typeof payload.title === 'string' && payload.title ? payload.title : 'FlowField'
  var body = typeof payload.body === 'string' ? payload.body : ''
  var tag = typeof payload.tag === 'string' && payload.tag ? payload.tag : 'flowfield'
  var url = typeof payload.url === 'string' ? payload.url : ''
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: body,
        tag: tag,
        data: { url: url },
        icon: 'icons/icon-192.png',
      }),
      syncPushBadge(payload).catch(function () {
        // A badge failure must not block the notification.
      }),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  var target = event.notification.data && event.notification.data.url
  event.waitUntil(
    (async () => {
      var windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      var scope = self.registration.scope
      for (var i = 0; i < windows.length; i += 1) {
        var client = windows[i]
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

self.addEventListener('message', (event) => {
  var data = event.data
  if (!data || data.type !== APP_BADGE_MESSAGE || typeof data.count !== 'number') return
  var count = normalizeBadgeCount(data.count)
  var done = (async () => {
    await writeCachedBadge(count)
    await applySwBadge(count)
  })().catch(function () {
    // The page also sets the badge. A worker failure leaves that in place.
  })
  if (event.waitUntil) event.waitUntil(done)
})

// Read by scripts/check-app-badge.ts. The page does not call these.
self.flowfieldBadgeCountFromPush = badgeCountFromPush
self.flowfieldBadgeForPush = badgeForPush
