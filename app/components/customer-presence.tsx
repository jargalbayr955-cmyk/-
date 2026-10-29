'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const CUSTOMER_ROUTE = /^\/(?:current|drivers|tracking|home)(?:\/|$)/
const LOCATION_EVENT = 'achilt:customer-location'

type LocationDetail = { lat: number; lng: number }

function validLocation(detail: unknown): LocationDetail | null {
  if (!detail || typeof detail !== 'object') return null
  const row = detail as Record<string, unknown>
  const lat = Number(row.lat), lng = Number(row.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

export function CustomerPresence() {
  const pathname = usePathname()

  useEffect(() => {
    if (!CUSTOMER_ROUTE.test(pathname)) return
    let cancelled = false, unauthorized = false
    let permission: PermissionStatus | null = null

    const post = async (location?: LocationDetail) => {
      if (cancelled || unauthorized) return
      try {
        const response = await fetch('/api/customer/presence', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(location || {}),
        })
        if (response.status === 401) unauthorized = true
      } catch { /* Presence is best-effort and must never block customer ordering. */ }
    }

    const ping = async () => {
      if (cancelled || unauthorized || document.visibilityState === 'hidden') return
      if (!navigator.geolocation) { await post(); return }
      try {
        if (!permission && navigator.permissions?.query) {
          permission = await navigator.permissions.query({ name: 'geolocation' })
          if (cancelled) return
          permission.addEventListener('change', ping)
        }
        if (permission?.state === 'granted') {
          navigator.geolocation.getCurrentPosition(
            pos => { void post({ lat: pos.coords.latitude, lng: pos.coords.longitude }) },
            () => { void post() },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
          )
          return
        }
      } catch { /* Browsers without permission query still send the heartbeat. */ }
      await post()
    }

    const onVisible = () => { if (document.visibilityState === 'visible') void ping() }
    const onLocation = (event: Event) => {
      const detail = validLocation((event as CustomEvent).detail)
      if (detail) void post(detail)
    }

    window.addEventListener(LOCATION_EVENT, onLocation)
    document.addEventListener('visibilitychange', onVisible)
    void ping()
    const timer = window.setInterval(() => { void ping() }, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      permission?.removeEventListener('change', ping)
      window.removeEventListener(LOCATION_EVENT, onLocation)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pathname])

  return null
}
