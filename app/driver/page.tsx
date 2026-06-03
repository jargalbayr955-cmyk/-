'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function DriverPage() {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [driver, setDriver] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [locMsg, setLocMsg] = useState('')
  const [offerPrices, setOfferPrices] = useState<{[key: string]: string}>({})
  const [sentOffers, setSentOffers] = useState<{[key: string]: boolean}>({})
  const [newOrderAlert, setNewOrderAlert] = useState(false)
  const prevOrderIds = useRef<string[]>([])

  const handleLogin = async () => {
    if (!phone || !pin) return setError('Дугаар болон PIN оруулна уу')
    setLoading(true)
    setError('')
    const { data } = await supabase.from('drivers').select().eq('phone', phone).eq('pin', pin)
    if (!data || data.length === 0) {
      setError('Дугаар эсвэл PIN буруу байна')
    } else {
      setDriver(data[0])
    }
    setLoading(false)
  }

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, created_at, from_address, to_address, from_lat, from_lng, status')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) {
      const newIds = data.map((o: any) => o.id)
      const hasNew = newIds.some((id: string) => !prevOrderIds.current.includes(id))
      if (hasNew && prevOrderIds.current.length > 0) {
        setNewOrderAlert(true)
        setTimeout(() => setNewOrderAlert(false), 3000)
      }
      prevOrderIds.current = newIds
      setOrders(data)
    }
  }

  const updateLocation = () => {
    if (!driver) return
    setLocating(true)
    setLocMsg('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await supabase.from('drivers').update({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          available: true
        }).eq('id', driver.id)
        setLocMsg('Байршил шинэчлэгдлээ!')
        setLocating(false)
      },
      () => { setLocMsg('Байршил тогтоох боломжгүй'); setLocating(false) }
    )
  }

  const toggleAvailable = async () => {
    const newVal = !driver.available
    await supabase.from('drivers').update({ available: newVal }).eq('id', driver.id)
    setDriver({ ...driver, available: newVal })
  }

  const sendOffer = async (order: any) => {
    const price = offerPrices[order.id]
    if (!price) return alert('Үнэ оруулна уу')
    await supabase.from('offers').insert({
      order_id: order.id,
      driver_id: driver.id,
      driver_name: driver.name,
      driver_phone: driver.phone,
      car_type: driver.car_type,
      price: parseInt(price),
      status: 'pending',
      driver_lat: driver.lat || null,
      driver_lng: driver.lng || null
    })
    setSentOffers({ ...sentOffers, [order.id]: true })
  }

  const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    if (!lat1 || !lng1 || !lat2 || !lng2) return null
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2)
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1)
  }

  useEffect(() => {
    if (!driver) return
    fetchOrders()
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
        setNewOrderAlert(true)
        setTimeout(() => setNewOrderAlert(false), 3000)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [driver])

  if (!driver) {
    return (
      <div className="min-h-screen flex flex-col" style={{background:'#0f0f1a'}}>
        <div className="flex-1 px-6 pt-16 pb-10">
          <div className="text-center mb-10">
            <div className="text-5xl mb-3">🚛</div>
            <h1 className="text-white text-2xl font-medium">Ачилт</h1>
            <p className="text-sm mt-1" style={{color:'rgba(255,255,255,0.4)'}}>Жолоочийн апп</p>
          </div>
          <input type="tel" placeholder="Утасны дугаар" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-2xl px-4 py-3.5 mb-3 text-sm outline-none" style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}} />
          <input type="password" placeholder="4 оронтой PIN" maxLength={4} value={pin} onChange={e => setPin(e.target.value)} className="w-full rounded-2xl px-4 py-3.5 mb-4 text-sm outline-none" style={{background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}} />
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <button onClick={handleLogin} disabled={loading} className="w-full rounded-2xl py-4 font-medium text-sm text-white disabled:opacity-50" style={{background:'#e8433a'}}>
            {loading ? 'Нэвтэрч байна...' : 'Нэвтрэх'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {newOrderAlert && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-2xl shadow-lg text-sm font-medium animate-bounce">
          🚛 Шинэ захиалга ирлээ!
        </div>
      )}
      <div className="bg-white px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">{driver.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{driver.car_type}</p>
          </div>
          <button onClick={toggleAvailable} className={"text-xs rounded-xl px-4 py-2 font-medium " + (driver.available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
            {driver.available ? '🟢 Ажиллаж байна' : '⚫ Амарч байна'}
          </button>
        </div>
      </div>
      <div className="px-4 pt-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <p className="font-medium text-sm mb-3">📍 Байршил шинэчлэх</p>
          <button onClick={updateLocation} disabled={locating} className="w-full rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-50" style={{background:'#e8433a'}}>
            {locating ? 'Байршил тогтоож байна...' : 'Одоогийн байршил илгээх'}
          </button>
          {locMsg && <p className="text-xs text-center mt-2 text-green-600">{locMsg}</p>}
        </div>
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-sm">Захиалгууд <span className="text-red-500 ml-1">({orders.length})</span></p>
          <button onClick={fetchOrders} className="text-xs text-red-500">↺ Шинэчлэх</button>
        </div>
        {orders.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">⏳</div>
            <p className="text-gray-400 text-sm">Одоогоор захиалга байхгүй</p>
            <p className="text-gray-300 text-xs mt-1">Шинэ захиалга ирэхэд автоматаар харагдана</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const dist = getDistance(driver.lat, driver.lng, o.from_lat, o.from_lng)
              return (
                <div key={o.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs bg-red-50 text-red-500 rounded-lg px-2 py-1 font-medium">🆕 Шинэ</span>
                    <div className="flex items-center gap-2">
                      {dist && <span className="text-xs text-blue-500 font-medium">📍 {dist} км</span>}
                      <span className="text-xs text-gray-400">
                        {new Date(o.created_at).toLocaleTimeString('mn-MN', {hour:'2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                      <div>
                        <p className="text-xs text-gray-400">Авах газар</p>
                        <p className="text-sm font-medium text-gray-700">{o.from_address || 'GPS байршил'}</p>
                      </div>
                    </div>
                    <div className="w-px h-3 bg-gray-300 ml-1"></div>
                    <div className="flex items-start gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                      <div>
                        <p className="text-xs text-gray-400">Хүргэх газар</p>
                        <p className="text-sm font-medium text-gray-700">{o.to_address || '-'}</p>
                      </div>
                    </div>
                  </div>
                  {sentOffers[o.id] ? (
                    <div className="bg-green-50 rounded-xl py-3 text-center">
                      <p className="text-green-600 text-sm font-medium">✅ Санал илгээгдлээ!</p>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input type="number" placeholder="Үнэ оруулна уу (₮)" value={offerPrices[o.id] || ''} onChange={e => setOfferPrices({...offerPrices, [o.id]: e.target.value})} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                      <button onClick={() => sendOffer(o)} className="rounded-xl px-4 py-2.5 text-sm font-medium text-white" style={{background:'#e8433a'}}>
                        Илгээх
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
