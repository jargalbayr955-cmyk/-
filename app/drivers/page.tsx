'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type DriverSlot = {
  invite_id: string
  driver_id: string
  rank: number
  invite_status: 'active' | 'offered'
  invited_at: string
  expires_at: string
  driver_name: string | null
  car_type: string | null
  lat: number | null
  lng: number | null
  distance_km: number | null
  offer: { id: string; price: number } | null
}

type SortMode = 'nearest' | 'cheapest'

export default function DriversPage() {
  const [slots, setSlots] = useState<DriverSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('nearest')
  const [dots, setDots] = useState('.')
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const driverMarkersRef = useRef<Map<string, any>>(new Map())
  const router = useRouter()

  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const oid = localStorage.getItem('current_order_id')
    setOrderId(oid)
    setFromAddress(localStorage.getItem('fromAddress') || localStorage.getItem('from') || '')
    setToAddress(localStorage.getItem('dest') || '')
    const lat = Number(localStorage.getItem('fromLat'))
    const lng = Number(localStorage.getItem('fromLng'))
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      setUserLat(lat)
      setUserLng(lng)
    } else {
      navigator.geolocation.getCurrentPosition(
        p => { setUserLat(p.coords.latitude); setUserLng(p.coords.longitude) },
        () => {}
      )
    }
  }, [])

  const fetchSlots = useCallback(async () => {
    if (!orderId) return
    try {
      const res = await fetch('/api/order/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
        cache: 'no-store',
      })
      if (!res.ok) return
      const body = await res.json()
      if (body.order_status && body.order_status !== 'pending') {
        if (body.selected_driver_id) {
          localStorage.setItem('tracking_driver_id', body.selected_driver_id)
          router.replace('/tracking')
        }
        return
      }
      setSlots(Array.isArray(body.slots) ? body.slots : [])
      setLoading(false)
    } catch {}
  }, [orderId, router])

  useEffect(() => {
    if (!orderId) return
    fetchSlots()
    // Sensitive tables are not exposed to anonymous Realtime in V5.
    // Poll only while this screen is active; server-side indexes keep this cheap.
    const interval = setInterval(() => { if (document.visibilityState === 'visible') fetchSlots() }, 5_000)
    return () => clearInterval(interval)
  }, [orderId, fetchSlots])

  useEffect(() => {
    if (!mapRef.current || userLat == null || userLng == null || mapInstanceRef.current) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    import('leaflet').then(L => {
      const Leaflet = L.default
      const map = Leaflet.map(mapRef.current!, { zoomControl: true }).setView([userLat, userLng], 14)
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      const tile = token
        ? Leaflet.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${token}`, { attribution: '© Mapbox © OpenStreetMap', tileSize: 512, zoomOffset: -1, maxZoom: 19 })
        : Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 })
      tile.addTo(map)
      const userIcon = Leaflet.divIcon({
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>',
        iconSize: [18, 18], iconAnchor: [9, 9], className: '',
      })
      userMarkerRef.current = Leaflet.marker([userLat, userLng], { icon: userIcon }).addTo(map).bindTooltip('Таны байршил')
      mapInstanceRef.current = map
    })
    const markerStore = driverMarkersRef.current
    return () => {
      if (mapInstanceRef.current) mapInstanceRef.current.remove()
      mapInstanceRef.current = null
      markerStore.clear()
    }
  }, [userLat, userLng])

  useEffect(() => {
    if (!mapInstanceRef.current) return
    let cancelled = false
    import('leaflet').then(L => {
      if (cancelled) return
      const Leaflet = L.default
      const liveIds = new Set<string>()
      const bounds: [number, number][] = []
      if (userLat != null && userLng != null) bounds.push([userLat, userLng])

      slots.forEach((slot, idx) => {
        if (slot.lat == null || slot.lng == null) return
        liveIds.add(slot.driver_id)
        bounds.push([slot.lat, slot.lng])
        const hasOffer = !!slot.offer
        const priceText = hasOffer ? `₮${slot.offer!.price.toLocaleString()}` : 'Үнэ хүлээж байна'
        const kmText = slot.distance_km != null ? `${slot.distance_km} км` : ''
        const html = `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-2px)">
          <div style="font-size:30px;line-height:1;filter:drop-shadow(0 3px 4px rgba(0,0,0,.55))">🚛</div>
          <div style="margin-top:2px;background:${hasOffer ? '#e8433a' : '#151519'};color:white;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:3px 7px;white-space:nowrap;font-size:11px;font-weight:800;box-shadow:0 3px 12px rgba(0,0,0,.35)">${hasOffer ? `${priceText} · ${kmText}` : `#${idx + 1} · ${kmText}`}</div>
        </div>`
        const icon = Leaflet.divIcon({ html, iconSize: [110, 55], iconAnchor: [55, 27], className: '' })
        const existing = driverMarkersRef.current.get(slot.driver_id)
        if (existing) {
          existing.setLatLng([slot.lat, slot.lng])
          existing.setIcon(icon)
        } else {
          const marker = Leaflet.marker([slot.lat, slot.lng], { icon }).addTo(mapInstanceRef.current)
          marker.bindPopup(hasOffer ? `${priceText} · ${kmText}` : `Ойрын ачигч · ${kmText}`)
          driverMarkersRef.current.set(slot.driver_id, marker)
        }
      })

      for (const [driverId, marker] of driverMarkersRef.current.entries()) {
        if (!liveIds.has(driverId)) {
          marker.remove()
          driverMarkersRef.current.delete(driverId)
        }
      }
      if (bounds.length > 1) {
        mapInstanceRef.current.fitBounds(Leaflet.latLngBounds(bounds), { padding: [45, 45], maxZoom: 15 })
      }
    })
    return () => { cancelled = true }
  }, [slots, userLat, userLng])

  const offers = useMemo(() => {
    const list = slots.filter(s => s.offer)
    return [...list].sort((a, b) => {
      if (sortMode === 'cheapest') return (a.offer?.price || Infinity) - (b.offer?.price || Infinity)
      return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity)
    })
  }, [slots, sortMode])

  const acceptOffer = async (slot: DriverSlot) => {
    if (!orderId || !slot.offer) return
    setAccepting(slot.offer.id)
    try {
      const res = await fetch('/api/order/accept-offer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, offer_id: slot.offer.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(body.error || 'Энэ захиалгын сонголт аль хэдийн хийгдсэн байна')
        await fetchSlots()
        return
      }
      localStorage.setItem('tracking_driver_id', slot.driver_id)
      router.push('/tracking')
    } finally {
      setAccepting(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060608', color: 'white' }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: '7px 12px', color: 'white' }}>← Буцах</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>Ойрын 5 ачигч</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>
            {offers.length ? `${offers.length} үнийн санал ирсэн` : `Үнийн санал хүлээж байна${dots}`}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#ff7a70', fontWeight: 800 }}>{slots.length}/5</div>
      </div>

      <div ref={mapRef} style={{ height: '45vh', minHeight: 320, background: '#111' }} />

      <div style={{ padding: 16 }}>
        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>АВАХ ГАЗАР</div>
          <div style={{ fontSize: 13, marginTop: 3 }}>{fromAddress || 'GPS байршил'}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 9 }}>ХҮРЭХ ГАЗАР</div>
          <div style={{ fontSize: 13, marginTop: 3 }}>{toAddress || '-'}</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setSortMode('nearest')} style={{ flex: 1, borderRadius: 12, padding: '10px 8px', border: sortMode === 'nearest' ? '1px solid #e8433a' : '1px solid rgba(255,255,255,.08)', background: sortMode === 'nearest' ? 'rgba(232,67,58,.14)' : 'rgba(255,255,255,.04)', color: 'white', fontWeight: 700 }}>📍 Хамгийн ойр</button>
          <button onClick={() => setSortMode('cheapest')} style={{ flex: 1, borderRadius: 12, padding: '10px 8px', border: sortMode === 'cheapest' ? '1px solid #e8433a' : '1px solid rgba(255,255,255,.08)', background: sortMode === 'cheapest' ? 'rgba(232,67,58,.14)' : 'rgba(255,255,255,.04)', color: 'white', fontWeight: 700 }}>₮ Хамгийн хямд</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'rgba(255,255,255,.45)' }}>Ойрын жолооч нарыг хайж байна{dots}</div>
        ) : offers.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 14, padding: 18, textAlign: 'center', color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
            Газрын зураг дээр ойрын {slots.length || 0} ачигч харагдаж байна. Үнэ бичсэн даруйд үнэ болон км нь энд гарна. 60 секундэд үнэ өгөөгүй жолооч дараагийн ойрын жолоочоор солигдоно.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {offers.map((slot, idx) => (
              <div key={slot.driver_id} style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 32 }}>🚛</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{slot.driver_name || `Ачигч ${idx + 1}`}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 3 }}>📍 {slot.distance_km ?? '-'} км зайтай</div>
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 900 }}>₮{slot.offer!.price.toLocaleString()}</div>
                </div>
                <button disabled={!!accepting} onClick={() => acceptOffer(slot)} style={{ width: '100%', marginTop: 12, border: 0, borderRadius: 12, padding: 12, background: '#e8433a', color: 'white', fontWeight: 800, cursor: 'pointer', opacity: accepting ? .65 : 1 }}>
                  {accepting === slot.offer!.id ? 'Сонгож байна...' : 'Энэ ачигчийг сонгох'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
