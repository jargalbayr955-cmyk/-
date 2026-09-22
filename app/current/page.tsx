'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createDotMarker, freeMapStyle, loadFreeMap, mapErrorMessage, ULAANBAATAR } from '@/lib/client/free-map'
import { AdminAccess, BrandAccess } from '../components/access-shortcuts'
import { CustomerAccount } from '../components/customer-account'

type LocationPoint = { lat: number; lng: number }
type FieldErrors = { dest?: boolean; carType?: boolean; carMark?: boolean }

function pointLabel(point: LocationPoint | null) {
  if (!point) return 'Ачих цэгээ газрын зураг дээр сонгоно уу'
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
}

export default function CurrentPage() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const latestLocation = useRef<LocationPoint | null>(null)
  const gpsRequest = useRef(0)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [location, setLocation] = useState<LocationPoint | null>(null)
  const [gpsError, setGpsError] = useState(false)
  const [locating, setLocating] = useState(true)
  const [mapError, setMapError] = useState('')
  const [dest, setDest] = useState('')
  const [carType, setCarType] = useState('')
  const [carMark, setCarMark] = useState('')
  const [extraAddress, setExtraAddress] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)

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
        setGpsError(false)
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
        setGpsError(false)
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
      setGpsError(true)
      setLocating(false)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (request !== gpsRequest.current) return
        setGpsError(false)
        setLocating(false)
        setMarker(pos.coords.latitude, pos.coords.longitude, true)
      },
      () => {
        if (request !== gpsRequest.current) return
        setGpsError(true)
        setLocating(false)
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 15000 },
    )
  }, [setMarker])

  useEffect(() => {
    let mounted = true
    void initMap(() => mounted)
    requestLocation()
    return () => {
      mounted = false
      gpsRequest.current += 1
      markerRef.current?.remove?.()
      markerRef.current = null
      mapInstanceRef.current?.remove?.()
      mapInstanceRef.current = null
    }
  }, [initMap, requestLocation])

  const handleSearch = async () => {
    if (submitting) return
    const nextErrors: FieldErrors = {}
    if (!dest.trim()) nextErrors.dest = true
    if (!carType) nextErrors.carType = true
    if (!carMark.trim()) nextErrors.carMark = true
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length) {
      const id = nextErrors.dest ? 'field-dest' : nextErrors.carType ? 'field-cartype' : 'field-carmark'
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
      return
    }
    if (!location) {
      setGpsError(true)
      alert('Ачих цэгээ газрын зураг дээр сонгоно уу.')
      return
    }

    const coords = pointLabel(location)
    const fromAddress = extraAddress.trim() ? `${extraAddress.trim()} (${coords})` : `Газрын зураг дээр сонгосон цэг (${coords})`

    setSubmitting(true)
    try {
      localStorage.setItem('fromLat', String(location.lat))
      localStorage.setItem('fromLng', String(location.lng))
      localStorage.setItem('fromAddress', fromAddress)
      localStorage.setItem('dest', dest.trim())

      const res = await fetch('/api/order/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_address: fromAddress,
          to_address: dest.trim(),
          from_lat: location.lat,
          from_lng: location.lng,
          car_type: carType,
          car_mark: carMark.trim(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.order?.id) {
        if (res.status === 401) return router.push('/login')
        alert(body.error || 'Захиалга үүсгэхэд алдаа гарлаа')
        return
      }
      localStorage.setItem('current_order_id', body.order.id)
      router.push('/drivers')
    } catch {
      alert('Сүлжээний алдаа гарлаа. Дахин оролдоно уу.')
    } finally {
      setSubmitting(false)
    }
  }

  const ready = Boolean(location && dest.trim() && carType && carMark.trim())
  const address = pointLabel(location)

  return (
    <main className="current-map-page">
      <div ref={mapRef} className="current-map-canvas" aria-label="Ачих байршлын газрын зураг" />
      <div className="current-map-vignette" />

      <header className="current-map-header">
        <div className="current-brand-row">
          <div className="brand-wrap"><BrandAccess /><div className="brand-name">Ачилт</div></div>
          <AdminAccess />
        </div>
        <CustomerAccount />
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

      {location && !sheetOpen && (
        <div className="current-location-chip">
          <span className="current-location-chip-dot" />
          <div><strong>Ачих цэг</strong><span>{address}</span><small>Тэмдэглэгээг чирэх эсвэл газрын зураг дээр дарж байршлаа өөрчилнө</small></div>
        </div>
      )}

      {!sheetOpen && (
        <div className="current-cta-wrap">
          <button className="current-search-banner" type="button" onClick={() => setSheetOpen(true)}>
            <span className="current-search-banner-icon">🚛</span>
            <span className="current-search-banner-copy"><strong>Жолооч хайх</strong><small>Хамгийн ойр байгаа машинуудыг санал болгоно</small></span>
            <span className="current-search-banner-arrow">→</span>
          </button>
        </div>
      )}

      {sheetOpen && <button className="current-sheet-backdrop" aria-label="Хаах" onClick={() => setSheetOpen(false)} />}

      <section className={`current-order-sheet ${sheetOpen ? 'is-open' : ''}`} aria-hidden={!sheetOpen} inert={!sheetOpen}>
        <div className="current-sheet-handle" />
        <div className="current-sheet-head">
          <div><span className="current-sheet-kicker">АЧИЛТЫН ЗАХИАЛГА</span><h1>Жолооч хайх</h1></div>
          <button type="button" onClick={() => setSheetOpen(false)} className="current-sheet-close" aria-label="Хаах">×</button>
        </div>

        <div className="current-sheet-scroll">
          <div className="current-from-card">
            <div className="current-field-label"><span className="blue-dot"/>АЧИХ ЦЭГ</div>
            <strong>{address}</strong>
            <input value={extraAddress} onChange={(e) => setExtraAddress(e.target.value)} placeholder="Ойролцоох байр, орц, тайлбар (заавал биш)" />
            {gpsError && <p className="current-map-note">GPS зөвшөөрөөгүй бол газрын зураг дээр дарж ачих цэгээ сонгоно уу.</p>}
          </div>

          <div id="field-dest" className={`current-input-card ${errors.dest ? 'has-error' : ''}`}>
            <label htmlFor="destination"><span className="red-dot"/>ХҮРЭХ ГАЗАР</label>
            <input id="destination" value={dest} onChange={(e) => { setDest(e.target.value); setErrors(p => ({...p,dest:false})) }} placeholder="Хүрэх хаягаа бичнэ үү" autoComplete="street-address" />
          </div>
          {errors.dest && <p className="current-field-error">Хүрэх газраа оруулна уу</p>}

          <div id="field-cartype" className="current-section-block">
            <div className="current-section-title">МАШИНЫ ТӨРӨЛ</div>
            <div className="current-car-grid">
              {[
                { id:'butten', label:'Бүтэн ачигч', icon:'🚛', desc:'Тэвш дээр бүтнээр нь ачна' },
                { id:'chiregch', label:'Чирэгч', icon:'🔧', desc:'Дугуйнаас чирж тээвэрлэнэ' },
              ].map(type => (
                <button key={type.id} type="button" className={`current-car-option ${carType===type.id?'is-selected':''} ${errors.carType?'has-error':''}`} onClick={() => { setCarType(type.id); setErrors(p=>({...p,carType:false})) }}>
                  <span className="current-car-icon">{type.icon}</span>
                  <span className="current-car-copy"><strong>{type.label}</strong><small>{type.desc}</small></span>
                  <span className="current-radio"><i/></span>
                </button>
              ))}
            </div>
            {errors.carType && <p className="current-field-error">Машины төрлөө сонгоно уу</p>}
          </div>

          <div id="field-carmark" className={`current-input-card ${errors.carMark?'has-error':''}`}>
            <label htmlFor="car-mark">🚗 МАШИНЫ МАРК, НЭР</label>
            <input id="car-mark" value={carMark} onChange={(e)=>{setCarMark(e.target.value);setErrors(p=>({...p,carMark:false}))}} placeholder="Жишээ: Toyota Camry" />
          </div>
          {errors.carMark && <p className="current-field-error">Машины маркаа оруулна уу</p>}

          <div className="current-offer-note"><span>⚡</span><p><strong>Ойр байгаа 8 жолоочид хүсэлт очно.</strong><br/>Жолооч нар 10 минутын дотор үнэ санал болгоно.</p></div>
        </div>

        <div className="current-sheet-footer">
          <button type="button" className="current-final-search" onClick={handleSearch} disabled={submitting}>
            {submitting ? 'Захиалга үүсгэж байна...' : ready ? 'Ойр жолооч хайх →' : 'Мэдээллээ бөглөөд жолооч хайх'}
          </button>
        </div>
      </section>
    </main>
  )
}
