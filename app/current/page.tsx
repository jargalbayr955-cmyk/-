'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createDotMarker, freeMapStyle, loadFreeMap, mapErrorMessage, ULAANBAATAR } from '@/lib/client/free-map'
import { CustomerAccount } from '../components/customer-account'
import { CustomerOrderSheet } from '../components/customer-order-sheet'
import { useScreenHistory } from '@/lib/client/use-screen-history'
import { isBookingScreen, readBookingDraft } from '@/lib/client/booking-draft'
import { readScreen } from '@/lib/client/navigation'

type LocationPoint = { lat: number; lng: number }

export default function CurrentPage() {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const latestLocation = useRef<LocationPoint | null>(null)
  const gpsRequest = useRef(0)

  const booking = useScreenHistory('booking', 'map', isBookingScreen)
  const [location, setLocation] = useState<LocationPoint | null>(null)
  const [locating, setLocating] = useState(true)
  const [mapError, setMapError] = useState('')

  const setMarker = useCallback((lat: number, lng: number, fly = false) => {
    latestLocation.current = { lat, lng }
    setLocation({ lat, lng })
    const map = mapInstanceRef.current
    const ml = window.maplibregl
    if (!map || !ml) return

    if (!markerRef.current) {
      markerRef.current = new ml.Marker({ element: createDotMarker('#e8433a', 22), draggable: true })
        .setLngLat([lng, lat])
        .addTo(map)
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current.getLngLat()
        gpsRequest.current += 1
        setLocating(false)
        latestLocation.current = { lat: pos.lat, lng: pos.lng }
        setLocation({ lat: pos.lat, lng: pos.lng })
      })
    } else {
      markerRef.current.setLngLat([lng, lat])
    }

    if (fly) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 600 })
  }, [])

  const initMap = useCallback(async (isMounted: () => boolean) => {
    if (!mapRef.current || mapInstanceRef.current) return
    try {
      const ml = await loadFreeMap()
      if (!isMounted() || !mapRef.current || mapInstanceRef.current) return
      const map = new ml.Map({
        container: mapRef.current,
        style: freeMapStyle(),
        center: [ULAANBAATAR.lng, ULAANBAATAR.lat],
        zoom: 12,
        attributionControl: {},
      })
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')
      map.on('click', (e: any) => {
        // A late GPS response must never replace a pickup chosen on the map.
        gpsRequest.current += 1
        setLocating(false)
        setMarker(e.lngLat.lat, e.lngLat.lng)
      })
      map.on('error', () => setMapError('Газрын зураг ачаалахад түр алдаа гарлаа'))
      map.on('idle', () => setMapError(''))
      mapInstanceRef.current = map
      if (latestLocation.current) setMarker(latestLocation.current.lat, latestLocation.current.lng, true)
    } catch (error) {
      if (!isMounted()) return
      console.error('Map initialization failed', error)
      setMapError(mapErrorMessage(error))
    }
  }, [setMarker])

  const requestLocation = useCallback(() => {
    const request = ++gpsRequest.current
    if (!navigator.geolocation) {
      setLocating(false)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (request !== gpsRequest.current) return
        setLocating(false)
        setMarker(pos.coords.latitude, pos.coords.longitude, true)
      },
      () => {
        if (request !== gpsRequest.current) return
        setLocating(false)
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 15000 },
    )
  }, [setMarker])

  useEffect(() => {
    let mounted = true
    void initMap(() => mounted)
    const restored = readScreen('booking')?.value !== 'map' ? readBookingDraft()?.location : null
    if (restored) { setMarker(restored.lat, restored.lng, true); setLocating(false) }
    else requestLocation()
    return () => {
      mounted = false
      gpsRequest.current += 1
      markerRef.current?.remove?.()
      markerRef.current = null
      mapInstanceRef.current?.remove?.()
      mapInstanceRef.current = null
    }
  }, [initMap, requestLocation, setMarker])

  return (
    <main className="current-map-page">
      <div ref={mapRef} className="current-map-canvas" aria-label="Ачих байршлын газрын зураг" />
      <div className="current-map-vignette" />

      <header className="current-map-header">
        <div className="current-brand-row">
          <CustomerAccount />
        </div>
        <div className="current-map-instructions">
          <h1>Ачуулах байршлаа газрын зураг дээр сонгоно уу.</h1>
          <p>Хамгийн ойр байгаа машинуудыг санал болгоно.</p>
        </div>
      </header>

      {mapError && <div className="current-map-error">{mapError}</div>}

      {!location && (
        <div className="current-location-status" role="status">
            <strong>{locating ? 'Таны байршлыг тогтоож байна' : 'Газрын зураг дээр ачих цэгээ сонгоно уу'}</strong>
            <span>{locating ? 'Байршлын зөвшөөрөл асуувал зөвшөөрнө үү. Эсвэл газрын зураг дээр дарж цэгээ сонгоорой.' : 'GPS байршил олдсонгүй. Газрын зураг дээр дарж эсвэл байршлын товчоор дахин оролдоно уу.'}</span>
        </div>
      )}

      <button className="current-recenter-btn" type="button" onClick={requestLocation} aria-label="Миний байршил руу очих" aria-busy={locating}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
        </svg>
      </button>

      <div className="current-cta-wrap">
        <button className="current-search-banner" type="button" onClick={() => {
          const draft = readBookingDraft()
          if (draft?.orderId && draft.location) setMarker(draft.location.lat, draft.location.lng, true)
          booking.navigate('vehicle')
        }}>
          <span className="current-search-banner-icon">🚛</span>
          <span className="current-search-banner-copy"><strong>Жолооч хайх</strong><small>Хамгийн ойр байгаа машинуудыг санал болгоно</small></span>
          <span className="current-search-banner-arrow">→</span>
        </button>
      </div>

      <CustomerOrderSheet screen={booking.screen} location={location} onNavigate={booking.navigate} onBack={booking.back} onClose={booking.close} />
    </main>
  )
}
