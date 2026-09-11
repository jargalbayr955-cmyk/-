'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function TrackingPage() {
  const [order, setOrder] = useState<any>(null)
  const [driverLat, setDriverLat] = useState<number | null>(null)
  const [driverLng, setDriverLng] = useState<number | null>(null)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [distance, setDistance] = useState<string | null>(null)
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null)
  const [driverLocationUpdatedAt, setDriverLocationUpdatedAt] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(0)
  const [mapReady, setMapReady] = useState(false)
  const mapRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const lineRef = useRef<any>(null)
  const markerAnimationRef = useRef<number | null>(null)
  const hasFitRouteRef = useRef(false)
  const router = useRouter()

  const calcDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2)
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1)
  }

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    setMapReady(true)
  }, [])

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && localStorage.getItem('phone_called') === '1') {
        localStorage.removeItem('phone_called')
        // Утасны дуудлага хийсэн нь захиалга дууссан гэсэн үг биш.
        // Захиалгыг зөвхөн жолооч server-side transaction-аар дуусгана.
        localStorage.removeItem('phone_called')
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  useEffect(() => {
    const fromLat = parseFloat(localStorage.getItem('fromLat') || '0')
    const fromLng = parseFloat(localStorage.getItem('fromLng') || '0')
    const orderId = localStorage.getItem('current_order_id')
    if (fromLat && fromLng) { setUserLat(fromLat); setUserLng(fromLng) }
    if (!orderId) return

    let stopped = false
    const fetchTracking = async () => {
      try {
        const res = await fetch('/api/order/tracking', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({order_id:orderId}), cache:'no-store' })
        if (!res.ok || stopped) return
        const body = await res.json()
        if (body.order) {
          setOrder(body.order)
          if (body.order.from_lat && body.order.from_lng) { setUserLat(Number(body.order.from_lat)); setUserLng(Number(body.order.from_lng)) }
        }
        const lat = Number(body.driver?.lat), lng = Number(body.driver?.lng)
        if (Number.isFinite(lat) && Number.isFinite(lng)) { setDriverLat(lat); setDriverLng(lng); setDriverLocationUpdatedAt(body.driver?.location_updated_at || null) }
      } catch {}
    }
    fetchTracking()
    const interval = setInterval(fetchTracking, 5000)
    return () => { stopped = true; clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (!mapReady || !userLat || !userLng || mapInstanceRef.current) return
    import('leaflet').then((L) => {
      const Leaflet = L.default
      delete (Leaflet.Icon.Default.prototype as any)._getIconUrl
      Leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      const map = Leaflet.map(mapRef.current!).setView([userLat, userLng], 14)
      ;(() => {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
          return token
            ? Leaflet.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}@2x?access_token=${token}`, { attribution: '© Mapbox © OpenStreetMap', tileSize: 512, zoomOffset: -1, crossOrigin: true, maxZoom: 19 })
            : Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 })
        })().addTo(map)
      const userIcon = Leaflet.divIcon({
        html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8], className: ''
      })
      userMarkerRef.current = Leaflet.marker([userLat, userLng], { icon: userIcon }).addTo(map).bindPopup('Таны байршил')
      mapInstanceRef.current = map
    })
  }, [mapReady, userLat, userLng])

  useEffect(() => {
    if (!mapInstanceRef.current || !driverLat || !driverLng || !userLat || !userLng) return
    let cancelled = false
    import('leaflet').then(async (L) => {
      const Leaflet = L.default
      const truckIcon = Leaflet.divIcon({
        html: '<div style="font-size:30px;line-height:1;filter:drop-shadow(0 3px 4px rgba(0,0,0,.7))">🚛</div>',
        iconSize: [34, 34], iconAnchor: [17, 17], className: ''
      })
      if (driverMarkerRef.current) {
        if (markerAnimationRef.current) cancelAnimationFrame(markerAnimationRef.current)
        const start = driverMarkerRef.current.getLatLng()
        const started = performance.now()
        const duration = 1800
        const animate = (now: number) => {
          const t = Math.min(1, (now - started) / duration)
          const eased = 1 - Math.pow(1 - t, 3)
          const lat = start.lat + (driverLat - start.lat) * eased
          const lng = start.lng + (driverLng - start.lng) * eased
          driverMarkerRef.current?.setLatLng([lat, lng])
          if (t < 1) markerAnimationRef.current = requestAnimationFrame(animate)
        }
        markerAnimationRef.current = requestAnimationFrame(animate)
      } else driverMarkerRef.current = Leaflet.marker([driverLat, driverLng], { icon: truckIcon }).addTo(mapInstanceRef.current).bindPopup('Жолооч')

      let points:any[] = [[userLat, userLng], [driverLat, driverLng]]
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (token) {
        try {
          const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${driverLng},${driverLat};${userLng},${userLat}?geometries=geojson&overview=full&access_token=${token}`
          const res = await fetch(url)
          const data = await res.json()
          const route = data?.routes?.[0]
          if (route?.geometry?.coordinates?.length) {
            points = route.geometry.coordinates.map((c:number[]) => [c[1], c[0]])
            setDistance((route.distance / 1000).toFixed(1))
            setEtaMinutes(Math.max(1, Math.round(route.duration / 60)))
          } else {
            setDistance(calcDistance(userLat, userLng, driverLat, driverLng)); setEtaMinutes(null)
          }
        } catch { setDistance(calcDistance(userLat, userLng, driverLat, driverLng)); setEtaMinutes(null) }
      } else { setDistance(calcDistance(userLat, userLng, driverLat, driverLng)); setEtaMinutes(null) }
      if (cancelled) return
      if (lineRef.current) lineRef.current.setLatLngs(points)
      else lineRef.current = Leaflet.polyline(points, { color: '#e8433a', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(mapInstanceRef.current)
      if (!hasFitRouteRef.current) {
        const bounds = Leaflet.latLngBounds(points)
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
        hasFitRouteRef.current = true
      }
    })
    return () => { cancelled = true }
  }, [driverLat, driverLng, userLat, userLng])

  useEffect(() => () => {
    if (markerAnimationRef.current) cancelAnimationFrame(markerAnimationRef.current)
  }, [])

  useEffect(() => {
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const locationAgeSeconds = driverLocationUpdatedAt && nowMs ? Math.max(0, Math.round((nowMs - new Date(driverLocationUpdatedAt).getTime()) / 1000)) : null
  const locationStale = locationAgeSeconds != null && locationAgeSeconds > 120

  return (
    <div style={{minHeight:'100vh', background:'#060608', display:'flex', flexDirection:'column'}}>

      {/* Header */}
      <div style={{padding:'14px 20px', background:'rgba(0,0,0,0.8)', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:1000, position:'relative'}}>
        <button onClick={() => router.back()} style={{background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'7px 14px', color:'rgba(255,255,255,0.6)', fontSize:'13px', cursor:'pointer', fontWeight:'600'}}>← Буцах</button>
        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
          <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#e8433a', animation:'pulse 1.5s infinite'}}/>
          <span style={{color:'white', fontWeight:'700', fontSize:'14px'}}>Live Tracking</span>
        </div>
        <div style={{width:'60px'}}/>
      </div>

      {/* Map */}
      <div ref={mapRef} style={{height:'45vh', minHeight:'280px'}}/>

      {/* Bottom */}
      <div style={{background:'#060608', borderTop:'1px solid rgba(255,255,255,0.06)', padding:'16px', zIndex:1000, position:'relative', flex:1}}>

        {/* Жолоочийн мэдээлэл */}
        {order?.driver_name ? (
          <div style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'14px 16px', marginBottom:'14px'}}>
            <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
              <div style={{width:'46px', height:'46px', borderRadius:'50%', background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#ff6b5b', fontSize:'18px', fontWeight:'800', flexShrink:0}}>
                {order.driver_name.charAt(0)}
              </div>
              <div style={{flex:1}}>
                <p style={{color:'white', fontWeight:'800', fontSize:'17px', margin:0, letterSpacing:'-0.3px'}}>{order.driver_name}</p>
                <p style={{color:'rgba(255,255,255,0.4)', fontSize:'13px', margin:'3px 0 0'}}>
                  {locationStale ? '⚠️ Жолоочийн GPS 2 минутаас удаан шинэчлэгдээгүй' : `${distance ? `📍 ${distance} км зайтай${etaMinutes ? ` · ~${etaMinutes} мин` : ''} · ` : ''}Таны байршил руу явж байна`}
                </p>
              </div>
              {distance && (
                <div style={{textAlign:'right'}}>
                  <p style={{color:'#e8433a', fontWeight:'800', fontSize:'20px', margin:0}}>{distance}</p>
                  <p style={{color:'rgba(255,255,255,0.3)', fontSize:'11px', margin:'2px 0 0'}}>км</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'16px', padding:'14px', marginBottom:'14px', textAlign:'center'}}>
            <p style={{color:'rgba(255,255,255,0.3)', fontSize:'13px', margin:0}}>Жолоочийн байршил хүлээж байна...</p>
          </div>
        )}

        {/* Legend */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'20px', marginBottom:'14px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#3b82f6'}}/>
            <span style={{color:'rgba(255,255,255,0.4)', fontSize:'12px'}}>Таны байршил</span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontSize:'14px'}}>🚛</span>
            <span style={{color:'rgba(255,255,255,0.4)', fontSize:'12px'}}>Жолооч</span>
          </div>
        </div>

        {/* Дуудлага товч */}
        {order?.driver_phone ? (
          <div>

            <a href={'tel:' + order.driver_phone} onClick={() => {
              // Утас дарсан гэдгийг тэмдэглэх
              localStorage.setItem('phone_called', '1')
            }} style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:'12px',
              borderRadius:'16px', padding:'16px',
              background:'#e8433a', color:'white', textDecoration:'none',
              animation:'btnPulse 2s ease-in-out infinite'
            }}>
              <span style={{fontSize:'22px'}}>📞</span>
              <div style={{textAlign:'left'}}>
                <p style={{color:'rgba(0,0,0,0.7)', fontSize:'13px', margin:'0 0 4px', fontWeight:'700'}}>Та залгаж баталгаажуулна уу</p>
                <p style={{color:'white', fontWeight:'900', fontSize:'20px', margin:0, letterSpacing:'2px'}}>{order.driver_phone}</p>
              </div>
            </a>
          </div>
        ) : (
          <div style={{background:'rgba(255,255,255,0.03)', borderRadius:'14px', padding:'14px', textAlign:'center'}}>
            <p style={{color:'rgba(255,255,255,0.25)', fontSize:'13px', margin:0}}>Жолоочийн мэдээлэл хүлээж байна...</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        @keyframes btnPulse {
          0%,100%{box-shadow:0 6px 25px rgba(232,67,58,0.4)}
          50%{box-shadow:0 6px 40px rgba(232,67,58,0.75)}
        }
      `}</style>
    </div>
  )
}
