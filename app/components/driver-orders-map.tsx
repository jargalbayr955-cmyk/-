'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { createTruckMarker, freeMapStyle, loadFreeMap, mapErrorMessage, ULAANBAATAR } from '@/lib/client/free-map'
import { pickupPoint, pointDistance, offerDistance, type PickupPoint } from '@/lib/order-offers'
import { vehicleLabel, type DriverOrder } from '@/lib/driver-orders'
import { driverServiceLabel } from '@/lib/service-types'
import type { DriverPeer } from './driver-chat-panel'

type OrderMarker = { marker: Marker; button: HTMLButtonElement; label: HTMLElement; distance: HTMLElement }
type PeerMarker = { marker: Marker; button: HTMLButtonElement; name: HTMLElement; detail: HTMLElement; headlights: HTMLElement }

export function DriverOrdersMap({ driver, fresh, orders, selectedId, onSelect, peers = [], selectedPeerId = null, onPeerSelect = () => {} }: {
  driver: PickupPoint | null
  fresh: boolean
  orders: DriverOrder[]
  selectedId: string | null
  onSelect: (id: string) => void
  peers?: DriverPeer[]
  selectedPeerId?: string | null
  onPeerSelect?: (id: string) => void
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const truckRef = useRef<Marker | null>(null)
  const trafficLayerRef = useRef<any>(null)
  const markers = useRef(new Map<string, OrderMarker>())
  const peerMarkers = useRef(new Map<string, PeerMarker>())
  const latest = useRef({ driver, fresh, orders, selectedId, onSelect, peers, selectedPeerId, onPeerSelect })
  const syncRef = useRef<(() => void) | null>(null)
  const framed = useRef('')
  const [error, setError] = useState('')

  useEffect(() => {
    latest.current = { driver, fresh, orders, selectedId, onSelect, peers, selectedPeerId, onPeerSelect }
    syncRef.current?.()
  }, [driver, fresh, orders, selectedId, onSelect, peers, selectedPeerId, onPeerSelect])

  useEffect(() => {
    let cancelled = false, observer: ResizeObserver | undefined
    const markerStore = markers.current
    const peerMarkerStore = peerMarkers.current
    void (async () => {
      try {
        const ml = await loadFreeMap()
        if (cancelled || !container.current) return
        const start = latest.current.driver || ULAANBAATAR
        const map = new ml.Map({ container: container.current, style: freeMapStyle(), center: [start.lng, start.lat], zoom: 14, attributionControl: {} })
        mapRef.current = map
        map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')

        const rawGoogleMap = (map as any).rawMap
        if (rawGoogleMap && window.google?.maps) {
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
            trafficLayerRef.current = traffic
          }
        }

        const sync = () => {
          if (cancelled) return
          const { driver: position, fresh: current, orders: rows, selectedId: chosen, peers: visiblePeers, selectedPeerId: chosenPeer } = latest.current
          if (position) {
            if (!truckRef.current) truckRef.current = new ml.Marker({ element: createTruckMarker('Та') }).setLngLat([position.lng, position.lat]).addTo(map)
            truckRef.current.setLngLat([position.lng, position.lat])
            const element = truckRef.current.getElement()
            element.style.opacity = current ? '1' : '.55'
            element.setAttribute('aria-label', current ? 'Таны байршил' : 'Таны сүүлд илгээсэн байршил')
          } else { truckRef.current?.remove(); truckRef.current = null }

          const peerIds = new Set<string>()
          for (const peer of visiblePeers) {
            if (!Number.isFinite(peer.lat) || !Number.isFinite(peer.lng)) continue
            peerIds.add(peer.id)
            let item = peerMarkerStore.get(peer.id)
            if (!item) {
              const button = document.createElement('button')
              button.type = 'button'
              button.style.cssText = 'border:1px solid rgba(255,255,255,.24);border-radius:14px;background:rgba(12,15,20,.94);color:#fff;padding:5px 9px 6px;min-width:92px;max-width:154px;display:grid;gap:1px;box-shadow:0 8px 24px rgba(0,0,0,.38);cursor:pointer;text-align:center;line-height:1.05;backdrop-filter:blur(8px)'
              const vehicle = document.createElement('span')
              vehicle.textContent = '🚛'
              vehicle.setAttribute('aria-hidden', 'true')
              vehicle.style.cssText = 'font-size:19px;line-height:18px;display:block'
              const headlights = document.createElement('span')
              headlights.className = 'driver-peer-headlights'
              headlights.textContent = '●   ●'
              headlights.setAttribute('aria-hidden', 'true')
              headlights.style.cssText = 'height:5px;font-size:7px;line-height:5px;color:#ffe45c;text-shadow:0 0 4px #fff59d,0 0 9px #ffd54f;letter-spacing:1px;visibility:hidden'
              headlights.animate?.([
                { filter:'brightness(.45)', transform:'scale(.94)' },
                { filter:'brightness(2.4)', transform:'scale(1.12)' },
                { filter:'brightness(.45)', transform:'scale(.94)' },
              ], { duration:850, iterations:Infinity, easing:'ease-in-out' })
              const name = document.createElement('strong')
              name.style.cssText = 'font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block'
              const detail = document.createElement('small')
              detail.style.cssText = 'font-size:9px;color:#a8b1bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block'
              button.append(vehicle, headlights, name, detail)
              button.addEventListener('click', event => { event.stopPropagation(); latest.current.onPeerSelect(peer.id) })
              item = { button, name, detail, headlights, marker: new ml.Marker({ element: button, anchor: 'bottom' }).setLngLat([peer.lng, peer.lat]).addTo(map) }
              peerMarkerStore.set(peer.id, item)
            }
            const online = peer.available && peer.fresh
            item.marker.setLngLat([peer.lng, peer.lat])
            item.name.textContent = peer.name
            item.detail.textContent = `${online ? '● Онлайн' : '○ Сүүлд'} · ${driverServiceLabel(peer.service_type, peer.car_type)}`
            item.detail.style.color = online ? '#70e39b' : '#9aa4b1'
            item.headlights.style.visibility = online ? 'visible' : 'hidden'
            item.button.style.opacity = peer.fresh ? '1' : '.72'
            item.button.style.borderColor = peer.id === chosenPeer ? '#e8433a' : online ? 'rgba(34,197,94,.65)' : 'rgba(255,255,255,.24)'
            item.button.style.outline = peer.id === chosenPeer ? '2px solid rgba(232,67,58,.35)' : 'none'
            item.button.setAttribute('aria-label', `${peer.name}, ${driverServiceLabel(peer.service_type, peer.car_type)}, ${online ? 'онлайн' : 'сүүлд харагдсан'}. Чат нээх`)
          }
          for (const [id, item] of peerMarkerStore) if (!peerIds.has(id)) { item.marker.remove(); peerMarkerStore.delete(id) }

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
      trafficLayerRef.current?.setMap?.(null); trafficLayerRef.current = null
      for (const item of markerStore.values()) item.marker.remove()
      for (const item of peerMarkerStore.values()) item.marker.remove()
      markerStore.clear(); peerMarkerStore.clear(); truckRef.current?.remove(); truckRef.current = null
      mapRef.current?.remove(); mapRef.current = null; framed.current = ''
    }
  }, [])

  return <>
    <div ref={container} className="driver-map-canvas" aria-label="Таны байршил, бусад жолооч болон захиалгын газрын зураг" />
    {error && <p className="driver-map-error" role="alert">{error}</p>}
  </>
}
