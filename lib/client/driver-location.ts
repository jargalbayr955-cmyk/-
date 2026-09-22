'use client'

import { pickupPoint, type PickupPoint } from '@/lib/order-offers'
import { createRequestSignal } from '@/lib/client/request-signal'

export type SavedDriverLocation = PickupPoint & { location_updated_at: string; available: boolean }
export async function saveDriverLocation(point: PickupPoint, available?: boolean, signal?: AbortSignal): Promise<SavedDriverLocation> {
  const request = createRequestSignal(12_000, signal)
  try {
    const response = await fetch('/api/driver/location', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...point, ...(available === undefined ? {} : { available }) }),
      signal: request.signal,
    })
    const body = await response.json().catch(error => { if (request.signal.aborted) throw error; return {} })
    if (!response.ok) throw new Error(body.error || 'Байршил серверт шинэчлэгдсэнгүй. Холболтоо шалгана уу.')
    return { ...point, location_updated_at: new Date().toISOString(), available: body.available }
  } finally { request.dispose() }
}

// Called only while working or on an accepted trip. The native app owns its GPS service.
export function watchDriverLocation(onLocation: (point: SavedDriverLocation) => void, onMessage: (message: string) => void) {
  if (!navigator.geolocation) { onMessage('Энэ browser байршил дэмжихгүй байна.'); return () => {} }
  let stopped = false, inFlight = false, lastAttempt = -Infinity
  const controller = new AbortController()
  const receive = async (position: GeolocationPosition) => {
    const point = pickupPoint(position.coords.latitude, position.coords.longitude)
    if (stopped || !point || Date.now() - position.timestamp > 60_000 || inFlight || Date.now() - lastAttempt < 15_000) return
    inFlight = true; lastAttempt = Date.now()
    try {
      const saved = await saveDriverLocation(point, undefined, controller.signal)
      if (!stopped) { onLocation(saved); onMessage('') }
    } catch (error) {
      if (!stopped) onMessage(error instanceof Error ? error.message : 'Сүлжээ тасарсан: байршил шинэчлэгдээгүй.')
    } finally { inFlight = false }
  }
  const failed = (error: GeolocationPositionError) => {
    if (!stopped) onMessage(error.code === 1
      ? 'Байршлын зөвшөөрөл хаалттай. Утасны тохиргооноос энэ сайтын байршлыг зөвшөөрнө үү.'
      : 'GPS дохио хүлээж байна. Байршил автоматаар дахин шалгагдана.')
  }
  const options = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  const refresh = () => { if (!stopped && document.visibilityState === 'visible') navigator.geolocation.getCurrentPosition(receive, failed, options) }
  const watch = navigator.geolocation.watchPosition(receive, failed, options)
  refresh()
  const heartbeat = setInterval(refresh, 45_000)
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('online', refresh)
  return () => {
    stopped = true; controller.abort(); clearInterval(heartbeat)
    navigator.geolocation.clearWatch(watch)
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('online', refresh)
  }
}
