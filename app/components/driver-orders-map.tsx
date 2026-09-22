'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { createTruckMarker, freeMapStyle, loadFreeMap, mapErrorMessage, ULAANBAATAR } from '@/lib/client/free-map'
import { pickupPoint, pointDistance, offerDistance, type PickupPoint } from '@/lib/order-offers'
import { vehicleLabel, type DriverOrder } from '@/lib/driver-orders'

type OrderMarker = { marker: Marker; button: HTMLButtonElement; label: HTMLElement; distance: HTMLElement }

export function DriverOrdersMap({ driver, fresh, orders, selectedId, onSelect }: {
  driver: PickupPoint | null; fresh: boolean; orders: DriverOrder[]; selectedId: string | null; onSelect: (id: string) => void
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const truckRef = useRef<Marker | null>(null)
  const markers = useRef(new Map<string, OrderMarker>())
  const latest = useRef({ driver, fresh, orders, selectedId, onSelect })
  const syncRef = useRef<(() => void) | null>(null)
  const framed = useRef('')
  const [error, setError] = useState('')

  useEffect(() => {
    latest.current = { driver, fresh, orders, selectedId, onSelect }
    syncRef.current?.()
  }, [driver, fresh, orders, selectedId, onSelect])

  useEffect(() => {
    let cancelled = false, observer: ResizeObserver | undefined
    const markerStore = markers.current
    void (async () => {
      try {
        const ml = await loadFreeMap()
        if (cancelled || !container.current) return
        const start = latest.current.driver || ULAANBAATAR
        const map = new ml.Map({ container: container.current, style: freeMapStyle(), center: [start.lng, start.lat], zoom: 14, attributionControl: {} })
        mapRef.current = map
        const sync = () => {
          if (cancelled) return
          const { driver: position, fresh: current, orders: rows, selectedId: chosen } = latest.current
          if (position) {
            if (!truckRef.current) truckRef.current = new ml.Marker({ element: createTruckMarker('Та') }).setLngLat([position.lng, position.lat]).addTo(map)
            truckRef.current.setLngLat([position.lng, position.lat])
            const element = truckRef.current.getElement()
            element.style.opacity = current ? '1' : '.55'
            element.setAttribute('aria-label', current ? 'Таны байршил' : 'Таны сүүлд илгээсэн байршил')
          } else { truckRef.current?.remove(); truckRef.current = null }
          const ids = new Set<string>()
          for (const order of rows) {
            const point = pickupPoint(order.from_lat, order.from_lng)
            if (!point) continue
            ids.add(order.id)
            let item = markerStore.get(order.id)
            if (!item) {
              const button = document.createElement('button')
              button.type = 'button'; button.className = 'driver-order-marker'
              const icon = document.createElement('span'); icon.textContent = '📍'; icon.setAttribute('aria-hidden', 'true')
              const label = document.createElement('strong'), distance = document.createElement('small')
              button.append(icon, label, distance)
              button.addEventListener('click', event => { event.stopPropagation(); latest.current.onSelect(order.id) })
              item = { button, label, distance, marker: new ml.Marker({ element: button, anchor: 'bottom' }).setLngLat([point.lng, point.lat]).addTo(map) }
              markerStore.set(order.id, item)
            }
            const distance = pointDistance(position, point)
            item.marker.setLngLat([point.lng, point.lat])
            item.label.textContent = vehicleLabel(order.car_type)
            item.distance.textContent = distance === null ? 'Захиалга' : offerDistance(distance)
            item.button.setAttribute('aria-label', `${vehicleLabel(order.car_type)}. ${order.from_address || 'Ачих цэг'} → ${order.to_address || 'Хүргэх газар'}. Захиалга харах`)
            item.button.setAttribute('aria-pressed', String(order.id === chosen))
          }
          for (const [id, item] of markerStore) if (!ids.has(id)) { item.marker.remove(); markerStore.delete(id) }
          const selected = rows.find(row => row.id === chosen)
          const pickup = selected ? pickupPoint(selected.from_lat, selected.from_lng) : null
          const key = `${pickup ? chosen : ''}:${position ? 'driver' : ''}`
          // Fit both participants on first GPS or a newly selected order. GPS ticks don't undo a pan.
          if (framed.current !== key && (position || pickup)) {
            framed.current = key
            if (position && pickup) {
              const bounds = new ml.LngLatBounds([position.lng, position.lat], [pickup.lng, pickup.lat])
              const height = container.current?.clientHeight || 720
              const page = container.current?.parentElement
              const headerHeight = page?.querySelector('.driver-dispatch-header')?.getBoundingClientRect().height || 125
              const panelHeight = page?.querySelector('.driver-order-panel')?.getBoundingClientRect().height || 256
              map.fitBounds(bounds, { padding: { top: Math.min(headerHeight + 30, height * .3), bottom: Math.min(panelHeight + 44, height * .5), left: 65, right: 65 }, maxZoom: 15, duration: 400 })
            } else {
              const point = position || pickup!
              map.easeTo({ center: [point.lng, point.lat], zoom: 14, duration: 400 })
            }
          }
        }
        syncRef.current = sync
        map.on('load', sync)
        map.on('error', () => { if (!cancelled) setError('Газрын зураг ачаалахад алдаа гарлаа. Холболтоо шалгана уу.') })
        map.on('idle', () => { if (!cancelled) setError('') })
        observer = new ResizeObserver(() => map.resize()); observer.observe(container.current)
        sync()
      } catch (cause) { if (!cancelled) setError(mapErrorMessage(cause)) }
    })()
    return () => {
      cancelled = true; observer?.disconnect(); syncRef.current = null
      for (const item of markerStore.values()) item.marker.remove()
      markerStore.clear(); truckRef.current?.remove(); truckRef.current = null
      mapRef.current?.remove(); mapRef.current = null; framed.current = ''
    }
  }, [])

  return <>
    <div ref={container} className="driver-map-canvas" aria-label="Жолооч болон захиалга өгсөн хэрэглэгчдийн ачих цэгийн газрын зураг" />
    {error && <p className="driver-map-error" role="alert">{error}</p>}
  </>
}
