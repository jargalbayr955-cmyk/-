'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { createDotMarker, freeMapStyle, loadFreeMap, mapErrorMessage, ULAANBAATAR } from '@/lib/client/free-map'
import { DriverSlot, offerDistance, offerPrice, PickupPoint } from '@/lib/order-offers'

type OfferMarker = { marker: Marker; button: HTMLButtonElement; price: HTMLElement; distance: HTMLElement }

export function OfferMap({ pickup, offers, selectedDriverId, onSelect }: {
  pickup: PickupPoint | null
  offers: DriverSlot[]
  selectedDriverId: string | null
  onSelect: (driverId: string) => void
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pickupMarker = useRef<Marker | null>(null)
  const markers = useRef(new Map<string, OfferMarker>())
  const fittedPoints = useRef('')
  const selectRef = useRef(onSelect)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { selectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    let cancelled = false
    const markerStore = markers.current
    void (async () => {
      try {
        const ml = await loadFreeMap()
        if (cancelled || !container.current) return
        const map = new ml.Map({ container: container.current, style: freeMapStyle(), center: [ULAANBAATAR.lng, ULAANBAATAR.lat], zoom: 12, attributionControl: {} })
        map.on('error', () => setError('Газрын зураг ачаалахад алдаа гарлаа. Холболтоо шалгана уу.'))
        map.on('idle', () => setError(''))
        mapRef.current = map
        setReady(true)
      } catch (cause) {
        if (!cancelled) setError(mapErrorMessage(cause))
      }
    })()
    return () => {
      cancelled = true
      pickupMarker.current?.remove()
      pickupMarker.current = null
      for (const { marker } of markerStore.values()) marker.remove()
      markerStore.clear()
      mapRef.current?.remove()
      mapRef.current = null
      fittedPoints.current = ''
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current, ml = window.maplibregl
    if (!ready || !map || !ml) return
    if (pickup) {
      if (!pickupMarker.current) pickupMarker.current = new ml.Marker({ element: createDotMarker('#2563eb', 20, 'Ачуулах байршил') }).setLngLat([pickup.lng, pickup.lat]).addTo(map)
      else pickupMarker.current.setLngLat([pickup.lng, pickup.lat])
    }

    const live = new Set<string>()
    for (const slot of offers) {
      if (!slot.offer || slot.lat == null || slot.lng == null) continue
      live.add(slot.driver_id)
      let item = markers.current.get(slot.driver_id)
      if (!item) {
        // A real button supports tapping, keyboard selection, and safe text labels.
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'offer-map-marker'
        const truck = document.createElement('span')
        truck.className = 'offer-map-truck'
        truck.textContent = '🚛'
        truck.setAttribute('aria-hidden', 'true')
        const price = document.createElement('strong')
        const distance = document.createElement('span')
        distance.className = 'offer-map-distance'
        button.append(truck, price, distance)
        button.addEventListener('click', event => { event.stopPropagation(); selectRef.current(slot.driver_id) })
        const marker = new ml.Marker({ element: button, anchor: 'bottom' }).setLngLat([slot.lng, slot.lat]).addTo(map)
        item = { marker, button, price, distance }
        markers.current.set(slot.driver_id, item)
      }
      item.marker.setLngLat([slot.lng, slot.lat])
      item.price.textContent = offerPrice(slot.offer.price)
      item.distance.textContent = offerDistance(slot.distance_km)
      item.button.setAttribute('aria-label', `${slot.driver_name || 'Жолооч'}, ${item.price.textContent}, ${item.distance.textContent}. Санал харах`)
      item.button.setAttribute('aria-pressed', String(selectedDriverId === slot.driver_id))
    }
    for (const [id, item] of markers.current) {
      if (!live.has(id)) { item.marker.remove(); markers.current.delete(id) }
    }

    // Frame new offers once; polling must not repeatedly undo the user's map pan/zoom.
    const key = `${pickup?.lat},${pickup?.lng}|${offers.map(slot => slot.offer?.id).sort().join(',')}`
    if (key !== fittedPoints.current && pickup) {
      fittedPoints.current = key
      if (offers.length) {
        const bounds = new ml.LngLatBounds([pickup.lng, pickup.lat], [pickup.lng, pickup.lat])
        for (const slot of offers) if (slot.lng != null && slot.lat != null) bounds.extend([slot.lng, slot.lat])
        const height = container.current?.clientHeight || 600
        map.fitBounds(bounds, { padding: { top: Math.min(210, height * .32), bottom: Math.min(190, height * .29), left: 76, right: 76 }, maxZoom: 15, duration: 500 })
      } else map.easeTo({ center: [pickup.lng, pickup.lat], zoom: 14, duration: 400 })
    }
  }, [pickup, offers, selectedDriverId, ready])

  return <>
    <div ref={container} className="offers-map-canvas" aria-label="Ачуулах байршил болон жолоочийн үнийн саналын газрын зураг" />
    {error && <p className="offers-map-error" role="alert">{error}</p>}
  </>
}
