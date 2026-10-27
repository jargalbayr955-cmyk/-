'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createDotMarker, freeMapStyle, loadFreeMap, mapErrorMessage, ULAANBAATAR } from '@/lib/client/free-map'
import { CustomerAccount } from '../components/customer-account'
import { CustomerOrderSheet } from '../components/customer-order-sheet'
import { useScreenHistory } from '@/lib/client/use-screen-history'
import { isBookingScreen, readBookingDraft } from '@/lib/client/booking-draft'
import { readScreen } from '@/lib/client/navigation'

type LocationPoint = { lat: number; lng: number }
type LocationIssue = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | ''

export default function CurrentPage() {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const trafficLayerRef = useRef<any>(null)
  const latestLocation = useRef<LocationPoint | null>(null)
  const gpsRequest = useRef(0)

  const booking = useScreenHistory('booking', 'map', isBookingScreen)
  const [location, setLocation] = useState<LocationPoint | null>(null)
  const [locating, setLocating] = useState(true)
  const [locationIssue, setLocationIssue] = useState<LocationIssue>('')
  const [mapError, setMapError] = useState('')
  const [trafficAvailable, setTrafficAvailable] = useState(false)
  const [trafficEnabled, setTrafficEnabled] = useState(true)

  const setMarker = useCallback((lat: number, lng: number, fly = false) => {
    latestLocation.current = { lat, lng }
    setLocation({ lat, lng })
    setLocationIssue('')
    const map = mapInstanceRef.current
    const ml = window.maplibregl
    if (!map || !ml) return

    if (!markerRef.current) {
      markerRef.current = new ml.Marker({ element: createDotMarker('#1a73e8', 22), draggable: true })
        .setLngLat([lng, lat])
        .addTo(map)
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current.getLngLat()
        gpsRequest.current += 1
        setLocating(false)
        setLocationIssue('')
        latestLocation.current = { lat: pos.lat, lng: pos.lng }
        setLocation({ lat: pos.lat, lng: pos.lng })
      })
    } else {
      markerRef.current.setLngLat([lng, lat])
    }

    if (fly) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 600 })
  }, [])

  const toggleTraffic = useCallback(() => {
    const rawGoogleMap = mapInstanceRef.current?.rawMap
    const layer = trafficLayerRef.current
    if (!rawGoogleMap || !layer) return
    setTrafficEnabled((enabled) => {
      const next = !enabled
      layer.setMap(next ? rawGoogleMap : null)
      return next
    })
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
        zoom: 13,
        attributionControl: {},
      })
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')
      map.on('click', (e: any) => {
        gpsRequest.current += 1
        setLocating(false)
        setLocationIssue('')
        setMarker(e.lngLat.lat, e.lngLat.lng)
      })
      map.on('error', () => setMapError('Газрын зураг ачаалахад түр алдаа гарлаа'))
      map.on('idle', () => setMapError(''))
      mapInstanceRef.current = map

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
          setTrafficEnabled(true)
          setTrafficAvailable(true)
        }
      }

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
      setLocationIssue('unsupported')
      return
    }
    setLocating(true)
    setLocationIssue('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (request !== gpsRequest.current) return
        setLocating(false)
        setLocationIssue('')
        setMarker(pos.coords.latitude, pos.coords.longitude, true)
      },
      (failure) => {
        if (request !== gpsRequest.current) return
        setLocating(false)
        setLocationIssue(failure.code === failure.PERMISSION_DENIED ? 'denied' : failure.code === failure.TIMEOUT ? 'timeout' : 'unavailable')
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 15000 },
    )
  }, [setMarker])

  useEffect(() => {
    if (!navigator.permissions?.query) return
    let active = true
    let status: PermissionStatus | undefined
    const onChange = () => {
      if (!active || !status) return
      if (status.state === 'denied') {
        setLocating(false)
        setLocationIssue('denied')
      } else if (status.state === 'granted' && !latestLocation.current) {
        requestLocation()
      } else if (status.state === 'prompt') {
        setLocationIssue('')
      }
    }
    navigator.permissions.query({ name: 'geolocation' }).then((value) => {
      if (!active) return
      status = value
      status.addEventListener('change', onChange)
      onChange()
    }).catch(() => {})
    return () => {
      active = false
      status?.removeEventListener('change', onChange)
    }
  }, [requestLocation])

  useEffect(() => {
    let mounted = true
    void initMap(() => mounted)
    const restored = readScreen('booking')?.value !== 'map' ? readBookingDraft()?.location : null
    if (restored) { setMarker(restored.lat, restored.lng, true); setLocating(false) }
    else requestLocation()
    return () => {
      mounted = false
      gpsRequest.current += 1
      trafficLayerRef.current?.setMap?.(null)
      trafficLayerRef.current = null
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

      {trafficAvailable && (
        <button
          type="button"
          onClick={toggleTraffic}
          aria-pressed={trafficEnabled}
          aria-label="Замын хөдөлгөөний мэдээлэл"
          style={{
            position: 'absolute',
            zIndex: 500,
            right: 16,
            bottom: 'calc(190px + env(safe-area-inset-bottom))',
            minHeight: 42,
            padding: '0 14px',
            border: '1px solid rgba(60,64,67,.18)',
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            color: '#202124',
            background: 'rgba(255,255,255,.96)',
            boxShadow: '0 2px 10px rgba(60,64,67,.24)',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span aria-hidden="true">{trafficEnabled ? '🟢' : '⚪'}</span>
          Замын хөдөлгөөн
        </button>
      )}

      <span style={{
        position: 'absolute', zIndex: 500, right: 74, bottom: 'calc(143px + env(safe-area-inset-bottom))',
        padding: '7px 10px', borderRadius: 999, color: '#fff', background: 'rgba(7,9,13,.82)',
        backdropFilter: 'blur(10px)', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', pointerEvents: 'none',
      }}>Таны одоогийн байршилд заах</span>
      <button className="current-recenter-btn" type="button" onClick={requestLocation} aria-label="Миний байршил руу очих" aria-busy={locating} title={locationIssue === 'denied' ? 'Байршлын зөвшөөрлөө Allow болгоно уу' : 'Таны одоогийн байршилд заах'}>
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
