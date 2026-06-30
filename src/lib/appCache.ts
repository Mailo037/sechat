const APP_CACHE_PREFIX = "sechat"

export type ClearAppCacheResult = {
  cacheCount: number
  serviceWorkerCount: number
}

export async function clearAppCache(): Promise<ClearAppCacheResult> {
  const cacheNames = "caches" in window ? await window.caches.keys() : []
  const appCacheNames = cacheNames.filter((name) =>
    name.startsWith(APP_CACHE_PREFIX)
  )

  await Promise.all(appCacheNames.map((name) => window.caches.delete(name)))

  let serviceWorkerCount = 0
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const sameOriginRegistrations = registrations.filter((registration) => {
      try {
        return new URL(registration.scope).origin === window.location.origin
      } catch {
        return false
      }
    })

    const unregisterResults = await Promise.all(
      sameOriginRegistrations.map((registration) => registration.unregister())
    )
    serviceWorkerCount = unregisterResults.filter(Boolean).length
  }

  return {
    cacheCount: appCacheNames.length,
    serviceWorkerCount,
  }
}

export function reloadAppAfterCacheClear() {
  window.location.reload()
}
