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

        // driver_id байхгүй бол order-оос авах
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

  // Init map
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
      Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map)

      const userIcon = Leaflet.divIcon({
        html: '<div style="background:#3b82f6;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        className: ''
      })

      userMarkerRef.current = Leaflet.marker([userLat, userLng], { icon: userIcon })
        .addTo(map)
        .bindPopup('Таны байршил')

      mapInstanceRef.current = map
    })
  }, [mapReady, userLat, userLng])

  // Update driver marker + line
  useEffect(() => {
    if (!mapInstanceRef.current || !driverLat || !driverLng || !userLat || !userLng) return

    import('leaflet').then((L) => {
      const Leaflet = L.default

      const truckIcon = Leaflet.divIcon({
        html: '<div style="font-size:30px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">🚛</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        className: ''
      })

      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverLat, driverLng])
      } else {
        driverMarkerRef.current = Leaflet.marker([driverLat, driverLng], { icon: truckIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup('Жолооч')
      }

      if (lineRef.current) {
        lineRef.current.setLatLngs([[userLat, userLng], [driverLat, driverLng]])
      } else {
        lineRef.current = Leaflet.polyline([[userLat, userLng], [driverLat, driverLng]], {
          color: '#e8433a',
          weight: 3,
          dashArray: '10, 8',
          opacity: 0.9
        }).addTo(mapInstanceRef.current)
      }

      const bounds = Leaflet.latLngBounds([[userLat, userLng], [driverLat, driverLng]])
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60] })
      setDistance(calcDistance(userLat, userLng, driverLat, driverLng))
    })
  }, [driverLat, driverLng, userLat, userLng])

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between" style={{zIndex: 1000, position: 'relative'}}>
        <button onClick={() => router.back()} className="text-gray-400 text-sm">← Буцах</button>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <span className="font-medium text-sm">Live Tracking</span>
        </div>
        <div className="w-16"></div>
      </div>

      <div ref={mapRef} style={{flex: 1, minHeight: '420px'}}></div>

      <div className="bg-white border-t border-gray-100 p-4" style={{zIndex: 1000, position: 'relative'}}>
        {distance && driverLat ? (
          <div className="bg-red-50 rounded-2xl p-3 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚛</span>
              <div>
                <p className="text-sm font-medium">{order?.driver_name || 'Жолооч'}</p>
                <p className="text-xs text-gray-400">Таны байршил руу явж байна</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-red-500 font-bold text-xl">{distance} км</p>
              <p className="text-xs text-gray-400">зайтай</p>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-3 mb-3 text-center">
            <p className="text-gray-400 text-sm">Жолоочийн байршил хүлээж байна...</p>
          </div>
        )}

        <div className="flex items-center justify-center gap-6 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-xs text-gray-500">Таны байршил</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🚛</span>
            <span className="text-xs text-gray-500">Жолооч</span>
          </div>
        </div>

        {order?.driver_phone ? (
          <a
            href={'tel:' + order.driver_phone}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-medium text-sm text-white"
            style={{background:'#e8433a'}}
          >
            📞 {order.driver_name} руу залгах ({order.driver_phone})
          </a>
        ) : (
          <div className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm text-gray-400 bg-gray-100">
            Жолоочийн мэдээлэл хүлээж байна...
          </div>
        )}
      </div>
    </div>
  )
}
