'use client'

export type RoadPoint = { lat: number; lng: number }

const validPoint = (point: RoadPoint) => Number.isFinite(point.lat) && Number.isFinite(point.lng)

async function googleMaps(timeoutMs = 3000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const maps = (window as any).google?.maps
    if (maps?.importLibrary) return maps
    await new Promise(resolve => window.setTimeout(resolve, 80))
  }
  throw new Error('route_provider_unavailable')
}

export async function roadDistanceBetween(origin: RoadPoint, destination: RoadPoint) {
  if (typeof window === 'undefined' || !validPoint(origin) || !validPoint(destination)) {
    throw new Error('invalid_route_points')
  }

  const maps = await googleMaps()
  const routesLibrary = await maps.importLibrary('routes')
  const Route = routesLibrary?.Route
  if (!Route?.computeRoutes) throw new Error('route_provider_unavailable')

  const result = await Route.computeRoutes({
    origin,
    destination,
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_AWARE',
    fields: ['distanceMeters'],
  })
  const meters = Number(result?.routes?.[0]?.distanceMeters)
  if (!Number.isFinite(meters) || meters < 0) throw new Error('route_distance_unavailable')
  return meters
}

export function roadDistanceText(meters: number | null) {
  if (meters == null || !Number.isFinite(meters)) return '—'
  const km = meters / 1000
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} км`
}
