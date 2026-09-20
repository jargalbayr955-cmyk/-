'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createDotMarker, createTruckMarker, freeMapStyle, loadFreeMap, validCoords } from '@/lib/client/free-map'

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
  const mapRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(0)
  const mapInstanceRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
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
    let finished = false
    let inFlight = false
    const fetchTracking = async () => {
      if (stopped || finished || inFlight || document.visibilityState !== 'visible') return
      inFlight = true
      try {
        const res = await fetch('/api/order/tracking', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({order_id:orderId}), cache:'no-store' })
        if (!res.ok || stopped) return
        const body = await res.json()
        if (body.order) {
          setOrder(body.order)
          finished = ['completed', 'cancelled'].includes(body.order.status)
          if (validCoords(body.order.from_lat, body.order.from_lng)) { setUserLat(Number(body.order.from_lat)); setUserLng(Number(body.order.from_lng)) }
        }
        const lat = Number(body.driver?.lat), lng = Number(body.driver?.lng)
        if (validCoords(body.driver?.lat, body.driver?.lng)) { setDriverLat(lat); setDriverLng(lng); setDriverLocationUpdatedAt(body.driver?.location_updated_at || null) }
      } catch {} finally { inFlight = false }
    }
    fetchTracking()
    const interval = setInterval(fetchTracking, 5000)
    return () => { stopped = true; clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (!mapRef.current || userLat == null || userLng == null || mapInstanceRef.current) return
    let cancelled=false
    ;(async()=>{
      try{
        const ml=await loadFreeMap()
        if(cancelled||!mapRef.current)return
        const map=new ml.Map({container:mapRef.current,style:freeMapStyle(),center:[userLng,userLat],zoom:14,attributionControl:{}})
        map.addControl(new ml.NavigationControl({showCompass:false}),'top-right')
        userMarkerRef.current=new ml.Marker({element:createDotMarker('#2563eb',18,'Таны байршил')}).setLngLat([userLng,userLat]).addTo(map)
        mapInstanceRef.current=map
        setMapReady(n => n + 1)
      }catch{}
    })()
    return()=>{cancelled=true;driverMarkerRef.current?.remove?.();driverMarkerRef.current=null;userMarkerRef.current?.remove?.();userMarkerRef.current=null;mapInstanceRef.current?.remove?.();mapInstanceRef.current=null;hasFitRouteRef.current=false}
  }, [userLat, userLng])

  useEffect(() => {
    const map=mapInstanceRef.current
    const ml=window.maplibregl
    if(!map||!ml||driverLat==null||driverLng==null||userLat==null||userLng==null)return

    if(driverMarkerRef.current)driverMarkerRef.current.setLngLat([driverLng,driverLat])
    else driverMarkerRef.current=new ml.Marker({element:createTruckMarker('Жолооч')}).setLngLat([driverLng,driverLat]).addTo(map)

    const km=calcDistance(userLat,userLng,driverLat,driverLng)
    setDistance(km);setEtaMinutes(null)

    const routeData={type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[userLng,userLat],[driverLng,driverLat]]}}
    const existing=map.getSource?.('driver-route')
    if(existing?.setData)existing.setData(routeData)
    else if(map.isStyleLoaded?.()){
      map.addSource('driver-route',{type:'geojson',data:routeData})
      map.addLayer({id:'driver-route-line',type:'line',source:'driver-route',paint:{'line-color':'#e8433a','line-width':5,'line-opacity':.9}})
    } else {
      map.once('load',()=>{
        if(!map.getSource('driver-route')){
          map.addSource('driver-route',{type:'geojson',data:routeData})
          map.addLayer({id:'driver-route-line',type:'line',source:'driver-route',paint:{'line-color':'#e8433a','line-width':5,'line-opacity':.9}})
        }
      })
    }

    if(!hasFitRouteRef.current){
      const bounds=new ml.LngLatBounds();bounds.extend([userLng,userLat]);bounds.extend([driverLng,driverLat]);map.fitBounds(bounds,{padding:55,maxZoom:16,duration:500});hasFitRouteRef.current=true
    }
  }, [driverLat, driverLng, userLat, userLng, mapReady])

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
                  {locationStale ? '⚠️ Жолоочийн GPS 2 минутаас удаан шинэчлэгдээгүй' : `${distance ? `📍 ${distance} км шулуун зайтай${etaMinutes ? ` · ~${etaMinutes} мин` : ''} · ` : ''}Таны байршил руу явж байна`}
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
