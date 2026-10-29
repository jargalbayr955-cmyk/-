'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import { createDotMarker, createTruckMarker, freeMapStyle, loadFreeMap, mapErrorMessage, ULAANBAATAR } from '@/lib/client/free-map'
import type { PickupPoint } from '@/lib/order-offers'

function readGooglePoint(point: any): { lat: number; lng: number } | null {
  const lat = Number(typeof point?.lat === 'function' ? point.lat() : point?.lat)
  const lng = Number(typeof point?.lng === 'function' ? point.lng() : point?.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

function distanceText(km: number) {
  return km < 1 ? `${Math.max(1, Math.round(km * 1000))} м` : `${km.toFixed(km < 10 ? 1 : 0)} км`
}

export function OrderConnectionMap({ pickup, driver, driverLabel = 'Жолооч' }: {
  pickup: PickupPoint | null; driver: PickupPoint | null; driverLabel?: string
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pickupMarker = useRef<Marker | null>(null), driverMarker = useRef<Marker | null>(null)
  const trafficLayer = useRef<any>(null)
  const latest = useRef({ pickup, driver, driverLabel })
  const updateMap = useRef<(() => void) | null>(null)
  const routeTimer = useRef<number | null>(null)
  const routeSeq = useRef(0)
  const lastRouteAt = useRef(0)
  const [error, setError] = useState('')
  const [roadDistanceKm, setRoadDistanceKm] = useState<number | null>(null)

  useEffect(() => {
    latest.current = { pickup, driver, driverLabel }
    updateMap.current?.()
  }, [pickup, driver, driverLabel])

  useEffect(() => {
    let cancelled = false, observer: ResizeObserver | undefined
    let framedPickup = false, framedBoth = false

    void (async () => {
      try {
        const ml = await loadFreeMap()
        if (cancelled || !container.current) return
        const start = latest.current.pickup || ULAANBAATAR
        const map = new ml.Map({ container: container.current, style: freeMapStyle(), center: [start.lng, start.lat], zoom: 14, attributionControl: {} })
        mapRef.current = map
        map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')

        const rawGoogleMap = (map as any).rawMap
        const googleMode = Boolean(rawGoogleMap && window.google?.maps)
        if (googleMode) {
          rawGoogleMap.setOptions({
            mapTypeId: window.google.maps.MapTypeId?.HYBRID || 'hybrid',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: false,
            clickableIcons: true,
            gestureHandling: 'greedy',
            backgroundColor: '#0b0f12',
          })
          const TrafficLayer = window.google.maps.TrafficLayer
          if (TrafficLayer) {
            const traffic = new TrafficLayer()
            traffic.setMap(rawGoogleMap)
            trafficLayer.current = traffic
          }
        }

        const setRoadData = (coordinates: number[][]) => {
          const data: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: coordinates.length > 1 ? [{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates },
            }] : [],
          }
          const source = map.getSource('order-road-path') as GeoJSONSource | undefined
          if (source) source.setData(data)
          else {
            map.addSource('order-road-path', { type: 'geojson', data })
            map.addLayer({
              id: 'order-road-path-line',
              source: 'order-road-path',
              type: 'line',
              paint: { 'line-color': '#4285f4', 'line-width': 6, 'line-opacity': .95 },
            })
          }
        }

        // Straight connection is a legacy non-Google fallback only. Production Google mode waits for a real road route.
        const setLegacyConnectionData = (p: PickupPoint | null, d: PickupPoint | null) => {
          if (!map.isStyleLoaded()) return
          const data: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: p && d ? [{
              type: 'Feature', properties: {},
              geometry: { type: 'LineString', coordinates: [[d.lng, d.lat], [p.lng, p.lat]] },
            }] : [],
          }
          const source = map.getSource('order-connection') as GeoJSONSource | undefined
          if (source) source.setData(data)
          else {
            map.addSource('order-connection', { type: 'geojson', data })
            map.addLayer({ id: 'order-connection-line', source: 'order-connection', type: 'line', paint: { 'line-color': '#e8433a', 'line-width': 3 } })
          }
        }

        const computeRoadRoute = async () => {
          if (cancelled || !googleMode) return
          const { pickup: p, driver: d, driverLabel: label } = latest.current
          if (!p || !d || !window.google?.maps?.importLibrary) {
            setRoadData([])
            setRoadDistanceKm(null)
            return
          }

          const seq = ++routeSeq.current
          lastRouteAt.current = Date.now()
          try {
            const routesLibrary = await window.google.maps.importLibrary('routes')
            let routePath: Array<{ lat: number; lng: number }> = []
            let distanceMeters = 0
            let durationMinutes: number | null = null

            const Route = routesLibrary?.Route
            if (Route?.computeRoutes) {
              try {
                const result = await Route.computeRoutes({
                  origin: { lat: d.lat, lng: d.lng },
                  destination: { lat: p.lat, lng: p.lng },
                  travelMode: 'DRIVING',
                  routingPreference: 'TRAFFIC_AWARE',
                  language: 'mn',
                  fields: ['path', 'distanceMeters', 'durationMillis'],
                })
                const route = result?.routes?.[0]
                routePath = (route?.path || []).map(readGooglePoint).filter(Boolean) as Array<{ lat: number; lng: number }>
                distanceMeters = Number(route?.distanceMeters || 0)
                durationMinutes = Number.isFinite(Number(route?.durationMillis)) ? Math.round(Number(route.durationMillis) / 60000) : null
              } catch { /* Fall through to the legacy road directions service below. */ }
            }

            if (routePath.length < 2 || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
              const DirectionsService = routesLibrary?.DirectionsService || window.google.maps.DirectionsService
              if (!DirectionsService) throw new Error('Road routing unavailable')
              const service = new DirectionsService()
              const legacy = await service.route({
                origin: { lat: d.lat, lng: d.lng },
                destination: { lat: p.lat, lng: p.lng },
                travelMode: window.google.maps.TravelMode?.DRIVING || 'DRIVING',
                drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
              })
              const legacyRoute = legacy?.routes?.[0]
              routePath = (legacyRoute?.overview_path || []).map(readGooglePoint).filter(Boolean) as Array<{ lat: number; lng: number }>
              const legs = Array.isArray(legacyRoute?.legs) ? legacyRoute.legs : []
              distanceMeters = legs.reduce((sum: number, leg: any) => sum + Number(leg?.distance?.value || 0), 0)
              const durationSeconds = legs.reduce((sum: number, leg: any) => sum + Number(leg?.duration_in_traffic?.value || leg?.duration?.value || 0), 0)
              durationMinutes = durationSeconds > 0 ? Math.round(durationSeconds / 60) : null
            }

            if (cancelled || seq !== routeSeq.current) return
            if (routePath.length < 2 || !Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error('No driving route')
            const km = distanceMeters / 1000
            setRoadData(routePath.map(point => [point.lng, point.lat]))
            setRoadDistanceKm(km)
            setError('')
            window.dispatchEvent(new CustomEvent('achilt:road-route', {
              detail: { source: 'order-connection', distanceKm: km, durationMinutes },
            }))

            if (label === 'Та') {
              const driverDistance = document.querySelector<HTMLElement>('.driver-connection-price span')
              if (driverDistance) driverDistance.textContent = `${distanceText(km)} · авто замаар`
            }
          } catch {
            if (cancelled || seq !== routeSeq.current) return
            setRoadData([])
            setRoadDistanceKm(null)
            setError('Авто замын маршрут түр тооцоологдсонгүй. Дахин шинэчилж байна…')
          }
        }

        const scheduleRoadRoute = () => {
          if (!googleMode) return
          if (routeTimer.current != null) window.clearTimeout(routeTimer.current)
          const wait = Math.max(0, 15_000 - (Date.now() - lastRouteAt.current))
          routeTimer.current = window.setTimeout(() => {
            routeTimer.current = null
            void computeRoadRoute()
          }, wait)
        }

        const sync = () => {
          if (cancelled) return
          const { pickup: p, driver: d, driverLabel: label } = latest.current
          if (p) {
            pickupMarker.current ??= new ml.Marker({ element: createDotMarker('#2563eb', 20, 'Ачуулах байршил') }).setLngLat([p.lng, p.lat]).addTo(map)
            pickupMarker.current.setLngLat([p.lng, p.lat])
          } else { pickupMarker.current?.remove(); pickupMarker.current = null }
          if (d) {
            driverMarker.current ??= new ml.Marker({ element: createTruckMarker(label) }).setLngLat([d.lng, d.lat]).addTo(map)
            driverMarker.current.setLngLat([d.lng, d.lat])
          } else { driverMarker.current?.remove(); driverMarker.current = null }

          if (googleMode) {
            if (p && d) scheduleRoadRoute()
            else {
              if (routeTimer.current != null) window.clearTimeout(routeTimer.current)
              routeTimer.current = null
              setRoadData([])
              setRoadDistanceKm(null)
            }
          } else {
            setLegacyConnectionData(p, d)
          }

          if (p && d && !framedBoth) {
            framedBoth = true; framedPickup = true
            const bounds = new ml.LngLatBounds([p.lng, p.lat], [p.lng, p.lat]).extend([d.lng, d.lat])
            map.fitBounds(bounds, { padding: { top: 70, bottom: 65, left: 55, right: 55 }, maxZoom: 15, duration: 400 })
          } else if (p && !framedPickup) {
            framedPickup = true
            map.easeTo({ center: [p.lng, p.lat], zoom: 14, duration: 400 })
          }
        }

        updateMap.current = sync
        map.on('load', sync)
        map.on('error', () => { if (!cancelled) setError('Газрын зураг ачаалахад алдаа гарлаа. Холболтоо шалгана уу.') })
        observer = new ResizeObserver(() => map.resize())
        observer.observe(container.current)
        sync()
      } catch (cause) { if (!cancelled) setError(mapErrorMessage(cause)) }
    })()

    return () => {
      cancelled = true
      routeSeq.current += 1
      if (routeTimer.current != null) window.clearTimeout(routeTimer.current)
      routeTimer.current = null
      observer?.disconnect()
      updateMap.current = null
      trafficLayer.current?.setMap?.(null)
      trafficLayer.current = null
      pickupMarker.current?.remove(); driverMarker.current?.remove()
      pickupMarker.current = null; driverMarker.current = null
      mapRef.current?.remove(); mapRef.current = null
    }
  }, [])

  return <div className="order-connection-map">
    <div ref={container} className="order-connection-canvas" aria-label="Ачуулах байршил болон сонгогдсон жолоочийн авто замын маршрут" />
    {roadDistanceKm != null && <div style={{
      position: 'absolute', zIndex: 20, left: 14, bottom: 14, padding: '8px 12px', borderRadius: 999,
      color: '#202124', background: 'rgba(255,255,255,.96)', boxShadow: '0 2px 10px rgba(0,0,0,.24)',
      fontSize: 13, fontWeight: 900,
    }}>Авто замаар · {distanceText(roadDistanceKm)}</div>}
    {error && <p className="connection-map-error" role="alert">{error}</p>}
  </div>
}
