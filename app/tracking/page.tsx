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
  const [mode, setMode] = useState<'user' | 'driver'>('user')
  const router = useRouter()
  const intervalRef = useRef<any>(null)

  useEffect(() => {
    const orderId = localStorage.getItem('current_order_id')
    const driverId = localStorage.getItem('tracking_driver_id')
    const fromLat = parseFloat(localStorage.getItem('fromLat') || '0')
    const fromLng = parseFloat(localStorage.getItem('fromLng') || '0')

    if (fromLat && fromLng) {
      setUserLat(fromLat)
      setUserLng(fromLng)
    }

    // Determine mode: driver or user
    const driverData = localStorage.getItem('driver_session')
    if (driverData) setMode('driver')

    if (!orderId) return

    const fetchTracking = async () => {
      // Get order info
      const { data: orderData } = await supabase
        .from('orders')
        .select()
        .eq('id', orderId)
        .single()
      if (orderData) setOrder(orderData)

      // Get driver location from drivers table
      if (driverId) {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('lat, lng')
          .eq('id', driverId)
          .single()
        if (driverData?.lat) {
          setDriverLat(driverData.lat)
          setDriverLng(driverData.lng)
        }
      } else if (orderData?.driver_phone) {
        // Find driver by phone
        const { data: driverInfo } = await supabase
          .from('drivers')
          .select('lat, lng')
          .eq('phone', orderData.driver_phone)
          .single()
        if (driverInfo?.lat) {
          setDriverLat(driverInfo.lat)
          setDriverLng(driverInfo.lng)
        }
      }
    }

    fetchTracking()
    intervalRef.current = setInterval(fetchTracking, 5000)
    return () => clearInterval(intervalRef.current)
  }, [])

  // Build map URL with both markers
  const getMapUrl = () => {
    if (!userLat || !userLng) return null

    const markers = []
    if (userLat && userLng) markers.push(`${userLat},${userLng}`)

    const centerLat = driverLat ? (userLat + driverLat) / 2 : userLat
    const centerLng = driverLng ? (userLng + driverLng) / 2 : userLng
    const zoom = driverLat ? 13 : 15

    // Use OpenStreetMap with markers
    let url = `https://www.openstreetmap.org/export/embed.html?bbox=${centerLng - 0.02},${centerLat - 0.02},${centerLng + 0.02},${centerLat + 0.02}&layer=mapnik&marker=${userLat},${userLng}`

    return url
  }

  const mapUrl = getMapUrl()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-gray-400 text-sm">← Буцах</button>
        <h1 className="font-medium text-sm">Live Tracking</h1>
        <div className="w-16"></div>
      </div>

      {/* Map */}
      <div className="relative flex-1" style={{minHeight: '400px'}}>
        {mapUrl ? (
          <iframe
            key={`${driverLat}-${driverLng}`}
            width="100%"
            height="100%"
            style={{border: 0, minHeight: '400px'}}
            src={mapUrl}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200" style={{minHeight: '400px'}}>
            <p className="text-gray-400 text-sm">Газрын зураг ачааллаж байна...</p>
          </div>
        )}

        {/* Live indicator */}
        <div className="absolute top-3 right-3 bg-red-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          LIVE
        </div>

        {/* Driver marker info */}
        {driverLat && driverLng && (
          <div className="absolute bottom-3 left-3 right-3 bg-white rounded-2xl p-3 shadow-lg">
            <div className="flex items-center gap-2">
              <div className="text-2xl">🚛</div>
              <div className="flex-1">
                <p className="text-sm font-medium">{order?.driver_name || 'Жолооч'}</p>
                <p className="text-xs text-gray-400">Таны байршил руу явж байна</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">5 сек тутамд шинэчлэгдэнэ</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-white p-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-xs text-gray-500">Таны байршил</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-xs text-gray-500">Жолооч 🚛</span>
          </div>
        </div>

        {order?.driver_phone && (
          <a
            href={'tel:' + order.driver_phone}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 font-medium text-sm text-white"
            style={{background:'#e8433a'}}
          >
            📞 Жолоочтой холбогдох
          </a>
        )}
      </div>
    </div>
  )
}
