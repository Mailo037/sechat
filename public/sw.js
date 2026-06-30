const CACHE_PREFIX = "sechat"
const CACHE_VERSION = "v5"
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`
const ASSET_CACHE = `${CACHE_PREFIX}-assets-${CACHE_VERSION}`
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`
const SHELL_URLS = [
  "/",
  "/site.webmanifest",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
]
const MAX_ASSET_ENTRIES = 90
const MAX_RUNTIME_ENTRIES = 60

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && !isCurrentCache(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SECHAT_CLEAR_CACHES") return

  event.waitUntil(
    clearAppCaches().then((deleted) => {
      event.source?.postMessage({
        type: "SECHAT_CACHES_CLEARED",
        deleted,
      })
    })
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (shouldPassThrough(request, url)) return

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE))
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE, MAX_ASSET_ENTRIES))
    return
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE, MAX_RUNTIME_ENTRIES))
})

function isCurrentCache(cacheName) {
  return [SHELL_CACHE, ASSET_CACHE, RUNTIME_CACHE].includes(cacheName)
}

function shouldPassThrough(request, url) {
  return (
    url.origin !== self.location.origin ||
    request.cache === "no-store" ||
    request.cache === "reload" ||
    request.headers.has("range") ||
    url.pathname.startsWith("/api/") ||
    isMediaRequest(url)
  )
}

async function clearAppCaches() {
  const keys = await caches.keys()
  const appKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX))
  await Promise.all(appKeys.map((key) => caches.delete(key)))
  return appKeys.length
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".woff2")
  )
}

function isMediaRequest(url) {
  return /\.(aac|flac|m4a|mp3|mp4|oga|ogg|opus|wav|webm|mov)(?:$|\?)/i.test(
    url.pathname
  )
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)
    if (response.ok) {
      safeCachePut(cache, request, response)
    }
    return response
  } catch {
    const cached = await cache.match(request)
    return cached ?? cache.match("/")
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    safeCachePut(cache, request, response)
    trimCache(cacheName, maxEntries)
  }
  return response
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) {
        safeCachePut(cache, request, response)
        trimCache(cacheName, maxEntries)
      }
      return response
    })
    .catch(() => cached ?? Response.error())

  return cached ?? fresh
}

function safeCachePut(cache, request, response) {
  const url = new URL(request.url)
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.cache === "no-store" ||
    request.cache === "reload" ||
    request.headers.has("range") ||
    response.status === 206 ||
    response.type === "opaque" ||
    response.type === "opaqueredirect"
  ) {
    return
  }

  cache.put(request, response.clone()).catch(() => undefined)
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return

  await cache.delete(keys[0])
  trimCache(cacheName, maxEntries)
}
