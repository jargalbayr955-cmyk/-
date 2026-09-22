'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import { createDotMarker, createTruckMarker, freeMapStyle, loadFreeMap, mapErrorMessage, ULAANBAATAR } from '@/lib/client/free-map'
import type { PickupPoint } from '@/lib/order-offers'

export function OrderConnectionMap({ pickup, driver, driverLabel = 'Жолооч' }: {
  pickup: PickupPoint | null; driver: PickupPoint | null; driverLabel?: string
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pickupMarker = useRef<Marker | null>(null), driverMarker = useRef<Marker | null>(null)
  const latest = useRef({ pickup, driver, driverLabel })
  const updateMap = useRef<(() => void) | null>(null)
  const [error, setError] = useState('')

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
          if (map.isStyleLoaded()) {
            const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: p && d ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[d.lng, d.lat], [p.lng, p.lat]] } }] : [] }
            const source = map.getSource('order-connection') as GeoJSONSource | undefined
            if (source) source.setData(data)
            else {
              map.addSource('order-connection', { type: 'geojson', data })
              map.addLayer({ id: 'order-connection-line', source: 'order-connection', type: 'line', paint: { 'line-color': '#e8433a', 'line-width': 3, 'line-dasharray': [2, 2] } })
            }
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
        map.on('idle', () => { if (!cancelled) setError('') })
        observer = new ResizeObserver(() => map.resize())
        observer.observe(container.current)
        sync()
      } catch (cause) { if (!cancelled) setError(mapErrorMessage(cause)) }
    })()
    return () => {
      cancelled = true; observer?.disconnect(); updateMap.current = null
      pickupMarker.current?.remove(); driverMarker.current?.remove()
      pickupMarker.current = null; driverMarker.current = null
      mapRef.current?.remove(); mapRef.current = null
    }
  }, [])

  return <div className="order-connection-map">
    <div ref={container} className="order-connection-canvas" aria-label="Ачуулах байршил болон сонгогдсон жолоочийн газрын зураг" />
    {error && <p className="connection-map-error" role="alert">{error}</p>}
  </div>
}
