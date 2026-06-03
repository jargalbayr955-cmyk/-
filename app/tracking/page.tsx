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
  const mapRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const lineRef = useRef<any>(null)
  const intervalRef = useRef<any>(null)
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
        const { data: ord } = await supabase.from('orders').select().eq('id', orderId).single()
        if (ord) setOrder(ord)
      }
      if (driverId) {
        const { data: drv } = await supabase.from('drivers').select('lat, lng').eq('id', driverId).single()
        if (drv?.lat) {
          setDriverLat(drv.lat)
          setDriverLng(drv.lng)
        }
      }
    }

    fetchTracking()
    intervalRef.current = setInterval(fetchTracking, 5000)
    return () => clearInterval(intervalRef.current)
  }, [])

  // Leaflet map initialize
  useEffect(() => {
    if (!userLat || !userLng || mapInstanceRef.current) return

    const L = require('leaflet')
    require('leaflet/dist/leaflet.css')

    // Fix default icon
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    })

    const map = L.map(mapRef.current).setView([userLat, userLng], 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)

    // User marker (blue)
    const userIcon = L.divIcon({
      html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: ''
    })
    userMarkerRef.current = L.marker([userLat, userLng], { icon: userIcon })
      .addTo(map)
      .bindPopup('Таны байршил')

    mapInstanceRef.current = map
  }, [userLat, userLng])

  // Update driver marker and line
  useEffect(() => {
    if (!mapInstanceRef.current || !driverLat || !driverLng || !userLat || !userLng) return

    const L = require('leaflet')

    // Driver marker (truck)
    const truckIcon = L.divIcon({
      html: '<div style="font-size:28px;line-height:1">🚛</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      className: ''
    })

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLat, driverLng])
    } else {
      driverMarkerRef.current = L.marker([driverLat, driverLng], { icon: truckIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup('Жолооч')
    }

    // Line between user and driver
    if (lineRef.current) {
      lineRef.current.setLatLngs([[userLat, userLng], [driverLat, driverLng]])
    } else {
      lineRef.current = L.polyline([[userLat, userLng], [driverLat, driverLng]], {
        color: '#e8433a',
        weight: 3,
        dashArray: '8, 8',
        opacity: 0.8
      }).addTo(mapInstanceRef.current)
    }

    // Fit both markers in view
    const bounds = L.latLngBounds([[userLat, userLng], [driverLat, driverLng]])
    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] })

    // Distance
    setDistance(calcDistance(userLat, userLng, driverLat, driverLng))
  }, [driverLat, driverLng, userLat, userLng])

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between z-10">
        <button onClick={() => router.back()} className="text-gray-400 text-sm">← Буцах</button>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <span className="font-medium text-sm">Live Tracking</span>
        </div>
        <div className="w-16"></div>
      </div>

      {/* Map */}
      <div ref={mapRef} style={{flex: 1, minHeight: '400px', zIndex: 0}}></div>

      {/* Bottom info */}
      <div className="bg-white border-t border-gray-100 p-4 z-10">
        {/* Distance */}
        {distance && (
          <div className="bg-red-50 rounded-2xl p-3 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚛</span>
              <div>
                <p className="text-sm font-medium">{order?.driver_name || 'Жолооч'}</p>
                <p className="text-xs text-gray-400">Таны байршил руу явж байна</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-red-500 font-medium text-lg">{distance} км</p>
              <p className="text-xs text-gray-400">зайтай байна</p>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-xs text-gray-500">Таны байршил</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🚛</span>
            <span className="text-xs text-gray-500">Жолооч</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5" style={{background:'#e8433a', borderTop: '2px dashed #e8433a'}}></div>
            <span className="text-xs text-gray-500">Зам</span>
          </div>
        </div>

        {order?.driver_phone && (
          <a
            href={'tel:' + order.driver_phone}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-medium text-sm text-white"
            style={{background:'#e8433a'}}
          >
            📞 Жолоочтой холбогдох
          </a>
        )}
      </div>
    </div>
  )
}
