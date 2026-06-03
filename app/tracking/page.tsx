'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function TrackingPage() {
  const [order, setOrder] = useState<any>(null)
  const [driverLat, setDriverLat] = useState<number | null>(null)
  const [driverLng, setDriverLng] = useState<number | null>(null)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [distance, setDistance] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const mapRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const lineRef = useRef<any>(null)
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
    const fromLat = parseFloat(localStorage.getItem('fromLat') || '0')
    const fromLng = parseFloat(localStorage.getItem('fromLng') || '0')
    const orderId = localStorage.getItem('current_order_id')
    const driverId = localStorage.getItem('tracking_driver_id')

    if (fromLat && fromLng) {
      setUserLat(fromLat)
      setUserLng(fromLng)
    }

    const fetchTracking = async () => {
      if (orderId) {
        const { data: ord } = await supabase
          .from('orders')
          .select('id, driver_name, driver_phone, driver_id, from_address, to_address, status')
          .eq('id', orderId)
          .single()
        if (ord) setOrder(ord)
        const trackId = driverId || ord?.driver_id
        if (trackId) {
          const { data: drv } = await supabase.from('drivers').select('lat, lng').eq('id', trackId).single()
          if (drv?.lat) {
            setDriverLat(drv.lat)
            setDriverLng(drv.lng)
          }
        }
      }
    }

    fetchTracking()
    const interval = setInterval(fetchTracking, 5000)
    return () => clearInterval(interval)
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
      Leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }).addTo(map)
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
    import('leaflet').then((L) => {
      const Leaflet = L.default
      const truckIcon = Leaflet.divIcon({
        html: '<div style="font-size:28px;line-height:1">🚛</div>',
        iconSize: [32, 32], iconAnchor: [16, 16], className: ''
      })
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverLat, driverLng])
      } else {
        driverMarkerRef.current = Leaflet.marker([driverLat, driverLng], { icon: truckIcon }).addTo(mapInstanceRef.current).bindPopup('Жолооч')
      }
      if (lineRef.current) {
        lineRef.current.setLatLngs([[userLat, userLng], [driverLat, driverLng]])
      } else {
        lineRef.current = Leaflet.polyline([[userLat, userLng], [driverLat, driverLng]], {
          color: '#e8433a', weight: 3, dashArray: '10, 8', opacity: 0.9
        }).addTo(mapInstanceRef.current)
      }
      const bounds = Leaflet.latLngBounds([[userLat, userLng], [driverLat, driverLng]])
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60] })
      setDistance(calcDistance(userLat, userLng, driverLat, driverLng))
    })
  }, [driverLat, driverLng, userLat, userLng])

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
                  {distance ? `📍 ${distance} км зайтай · ` : ''}Таны байршил руу явж байна
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
            <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', marginBottom:'10px'}}>
              <div style={{flex:1, height:'1px', background:'rgba(255,255,255,0.06)'}}/>
              <p style={{color:'rgba(255,255,255,0.35)', fontSize:'12px', margin:0, whiteSpace:'nowrap'}}>
                Та залгаж баталгаажуулна уу
              </p>
              <div style={{flex:1, height:'1px', background:'rgba(255,255,255,0.06)'}}/>
            </div>
            <a href={'tel:' + order.driver_phone} style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:'12px',
              borderRadius:'16px', padding:'16px',
              background:'#e8433a', color:'white', textDecoration:'none',
              animation:'btnPulse 2s ease-in-out infinite'
            }}>
              <span style={{fontSize:'22px'}}>📞</span>
              <p style={{color:'white', fontWeight:'800', fontSize:'18px', margin:0, letterSpacing:'2px'}}>{order.driver_phone}</p>
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
