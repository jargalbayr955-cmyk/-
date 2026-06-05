'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const D = {
  bg: '#060608',
  card: 'rgba(255,255,255,0.05)',
  cardBorder: '1px solid rgba(255,255,255,0.08)',
  text: 'white',
  muted: 'rgba(255,255,255,0.4)',
  red: '#e8433a',
}

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
  const [sendingOffer, setSendingOffer] = useState<string | null>(null)
  const [newOrderAlert, setNewOrderAlert] = useState(false)
  const [acceptedOrder, setAcceptedOrder] = useState<any>(null)
  const prevOrderIds = useRef<string[]>([])
  const mapRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const lineRef = useRef<any>(null)
  const router = useRouter()

  const handleLogin = async () => {
    if (!phone || !pin) return setError('Дугаар болон PIN оруулна уу')
    setLoading(true)
    setError('')
    const { data } = await supabase.from('drivers').select().eq('phone', phone).eq('pin', pin)
    if (!data || data.length === 0) {
      setError('Дугаар эсвэл PIN буруу байна')
    } else {
      setDriver(data[0])
      localStorage.setItem('driver_session', JSON.stringify(data[0]))

    // Push notification subscription
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        // Эхлээд permission асуух
        const permission = await Notification.requestPermission()
        if (permission === 'granted') {
          const reg = await navigator.serviceWorker.register('/sw.js')
          await navigator.serviceWorker.ready
          const existing = await reg.pushManager.getSubscription()
          const sub = existing || await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: 'BKFi4446X2u9MHYCdvzChXDMroFJIUqCXtC-hHge7jzUzqnWW7qEx8pkl_r7TDTEVnHzdUPgID3eKgSbWLNBwlY'
          })
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driver_id: data[0].id, subscription: sub.toJSON() })
          })
        }
      } catch (e) {
        console.log('Push subscription failed:', e)
      }
    }
    }
    setLoading(false)
  }

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, created_at, from_address, to_address, from_lat, from_lng, status, car_type, car_mark')
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
        await supabase.from('drivers').update({ lat: pos.coords.latitude, lng: pos.coords.longitude, available: true }).eq('id', driver.id)
        setDriver({ ...driver, lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocMsg('Байршил шинэчлэгдлээ!')
        setLocating(false)
      },
      () => { setLocMsg('Байршил тогтоох боломжгүй'); setLocating(false) }
    )
  }

  useEffect(() => {
    if (!driver) return
    // Жолооч нэвтэрсний дараа 10 секунд тутамд GPS шинэчлэх
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await supabase.from('drivers').update({ lat: pos.coords.latitude, lng: pos.coords.longitude }).eq('id', driver.id)
        setDriver((d: any) => ({ ...d, lat: pos.coords.latitude, lng: pos.coords.longitude }))
        if (driverMarkerRef.current) driverMarkerRef.current.setLatLng([pos.coords.latitude, pos.coords.longitude])
        if (lineRef.current && acceptedOrder?.from_lat) lineRef.current.setLatLngs([[pos.coords.latitude, pos.coords.longitude], [acceptedOrder.from_lat, acceptedOrder.from_lng]])
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [driver])

  useEffect(() => {
    if (!acceptedOrder || !mapRef.current || mapInstanceRef.current) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    setTimeout(() => {
      import('leaflet').then((L) => {
        const Leaflet = L.default
        delete (Leaflet.Icon.Default.prototype as any)._getIconUrl
        Leaflet.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        })
        const userLat = acceptedOrder.from_lat
        const userLng = acceptedOrder.from_lng
        const drvLat = driver?.lat || userLat
        const drvLng = driver?.lng || userLng
        const map = Leaflet.map(mapRef.current!).setView([userLat || 47.9, userLng || 106.9], 13)
        Leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }).addTo(map)
        const userIcon = Leaflet.divIcon({ html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white"></div>', iconSize: [16,16], iconAnchor: [8,8], className: '' })
        userMarkerRef.current = Leaflet.marker([userLat, userLng], { icon: userIcon }).addTo(map).bindPopup('Хэрэглэгч')
        const truckIcon = Leaflet.divIcon({ html: '<div style="font-size:26px">🚛</div>', iconSize: [32,32], iconAnchor: [16,16], className: '' })
        driverMarkerRef.current = Leaflet.marker([drvLat, drvLng], { icon: truckIcon }).addTo(map).bindPopup('Та')
        lineRef.current = Leaflet.polyline([[drvLat, drvLng], [userLat, userLng]], { color: '#e8433a', weight: 3, dashArray: '10,8', opacity: 0.9 }).addTo(map)
        const bounds = Leaflet.latLngBounds([[drvLat, drvLng], [userLat, userLng]])
        map.fitBounds(bounds, { padding: [60, 60] })
        mapInstanceRef.current = map
      })
    }, 300)
  }, [acceptedOrder])

  useEffect(() => {
    if (!acceptedOrder && mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
      driverMarkerRef.current = null
      userMarkerRef.current = null
      lineRef.current = null
    }
  }, [acceptedOrder])

  const toggleAvailable = async () => {
    const newVal = !driver.available
    await supabase.from('drivers').update({ available: newVal }).eq('id', driver.id)
    setDriver({ ...driver, available: newVal })
  }

  const sendOffer = async (order: any) => {
    const price = offerPrices[order.id]
    if (!price) return alert('Үнэ оруулна уу')
    setSendingOffer(order.id)
    const getPos = (): Promise<{lat: number, lng: number} | null> => new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition((pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => resolve(null), { timeout: 5000 })
    })
    const pos = await getPos()
    await supabase.from('offers').insert({
      order_id: order.id, driver_id: driver.id, driver_name: driver.name,
      driver_phone: driver.phone, car_type: driver.car_type, price: parseInt(price),
      status: 'pending', driver_lat: pos?.lat || driver.lat || null, driver_lng: pos?.lng || driver.lng || null
    })
    if (pos) { await supabase.from('drivers').update({ lat: pos.lat, lng: pos.lng }).eq('id', driver.id); setDriver({ ...driver, lat: pos.lat, lng: pos.lng }) }
    setSentOffers({ ...sentOffers, [order.id]: true })
    setSendingOffer(null)
  }

  const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    if (!lat1 || !lng1 || !lat2 || !lng2) return null
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2)
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1)
  }

  useEffect(() => {
    if (!driver) return
    fetchOrders()
    fetchOrders()
    const interval = setInterval(fetchOrders, 3000)

    const channel = supabase.channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => { fetchOrders(); setNewOrderAlert(true); setTimeout(() => setNewOrderAlert(false), 3000) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, async (payload: any) => {
        if (payload.new?.status === 'confirmed' && payload.new?.driver_phone === driver.phone) setAcceptedOrder(payload.new)
        fetchOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [driver])

  // LOGIN
  if (!driver) {
    return (
      <div style={{minHeight:'100vh', background:D.bg, display:'flex', flexDirection:'column'}}>
        <div style={{flex:1, padding:'60px 24px 40px'}}>
          <div style={{textAlign:'center', marginBottom:'40px'}}>
            <div style={{fontSize:'48px', marginBottom:'12px'}}>🚛</div>
            <h1 style={{color:D.text, fontSize:'24px', fontWeight:'800', margin:0}}>Ачилт</h1>
            <p style={{color:D.muted, fontSize:'14px', marginTop:'6px'}}>Жолоочийн апп</p>
          </div>
          <input type="tel" placeholder="Утасны дугаар" value={phone} onChange={e => setPhone(e.target.value)}
            style={{width:'100%', borderRadius:'14px', padding:'14px 16px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.text, fontSize:'16px', outline:'none', marginBottom:'12px', boxSizing:'border-box'}}/>
          <input type="password" placeholder="4 оронтой PIN" maxLength={4} value={pin} onChange={e => setPin(e.target.value)}
            style={{width:'100%', borderRadius:'14px', padding:'14px 16px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.text, fontSize:'16px', outline:'none', marginBottom:'16px', boxSizing:'border-box'}}/>
          {error && <p style={{color:'#ff6b6b', fontSize:'13px', marginBottom:'12px'}}>⚠️ {error}</p>}
          <button onClick={handleLogin} disabled={loading}
            style={{width:'100%', borderRadius:'14px', padding:'16px', background:D.red, border:'none', color:D.text, fontSize:'16px', fontWeight:'800', cursor:'pointer', boxShadow:'0 6px 25px rgba(232,67,58,0.4)'}}>
            {loading ? 'Нэвтэрч байна...' : 'Нэвтрэх →'}
          </button>
        </div>
        <style>{`input::placeholder{color:rgba(255,255,255,0.25);}`}</style>
      </div>
    )
  }

  // ACCEPTED ORDER MAP
  if (acceptedOrder) {
    return (
      <div style={{minHeight:'100vh', background:D.bg, display:'flex', flexDirection:'column'}}>
        <div style={{padding:'14px 20px', background:'rgba(0,0,0,0.6)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div>
            <p style={{color:D.text, fontWeight:'700', fontSize:'15px', margin:0}}>{driver.name}</p>
            <p style={{color:'#22c55e', fontSize:'12px', margin:'3px 0 0'}}>Захиалга хүлээн авсан</p>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'6px', background:'rgba(232,67,58,0.15)', border:'1px solid rgba(232,67,58,0.3)', borderRadius:'20px', padding:'5px 12px'}}>
            <div style={{width:'6px', height:'6px', borderRadius:'50%', background:D.red, animation:'pulse 1.5s infinite'}}/>
            <span style={{color:'#ff6b5b', fontSize:'12px', fontWeight:'700'}}>LIVE</span>
          </div>
        </div>
        <div ref={mapRef} style={{flex:1, minHeight:'400px'}}/>
        <div style={{background:D.bg, borderTop:'1px solid rgba(255,255,255,0.07)', padding:'16px'}}>
          <div style={{background:D.card, border:D.cardBorder, borderRadius:'14px', padding:'14px', marginBottom:'12px'}}>
            <div style={{display:'flex', alignItems:'flex-start', gap:'10px', marginBottom:'8px'}}>
              <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#3b82f6', marginTop:'4px', flexShrink:0}}/>
              <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px', fontWeight:'600'}}>АВАХ ГАЗАР</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'500'}}>{acceptedOrder.from_address}</p></div>
            </div>
            <div style={{display:'flex', alignItems:'flex-start', gap:'10px'}}>
              <div style={{width:'8px', height:'8px', borderRadius:'50%', background:D.red, marginTop:'4px', flexShrink:0}}/>
              <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px', fontWeight:'600'}}>ХҮРГЭХ ГАЗАР</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'500'}}>{acceptedOrder.to_address}</p></div>
            </div>
          </div>
          <button onClick={() => setAcceptedOrder(null)} style={{width:'100%', borderRadius:'14px', padding:'13px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.muted, fontSize:'14px', cursor:'pointer'}}>
            Захиалга дуусгах
          </button>
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}`}</style>
      </div>
    )
  }

  // MAIN
  return (
    <div style={{minHeight:'100vh', background:D.bg, paddingBottom:'24px'}}>
      {newOrderAlert && (
        <div style={{position:'fixed', top:'16px', left:'50%', transform:'translateX(-50%)', zIndex:50, background:D.red, color:D.text, padding:'12px 24px', borderRadius:'20px', fontSize:'14px', fontWeight:'700', boxShadow:'0 4px 20px rgba(232,67,58,0.5)', animation:'bounce 0.5s ease infinite alternate'}}>
          🚛 Шинэ захиалга ирлээ!
        </div>
      )}

      {/* Header */}
      <div style={{padding:'14px 20px', background:'rgba(0,0,0,0.6)', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div>
          <p style={{color:D.text, fontWeight:'700', fontSize:'15px', margin:0}}>{driver.name}</p>
          <p style={{color:D.muted, fontSize:'12px', margin:'3px 0 0'}}>{driver.car_type}</p>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
          <button onClick={toggleAvailable} style={{borderRadius:'20px', padding:'7px 14px', fontSize:'12px', fontWeight:'700', cursor:'pointer', border: driver.available ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)', background: driver.available ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)', color: driver.available ? '#22c55e' : D.muted}}>
            {driver.available ? '🟢 Ажиллаж байна' : '⚫ Амарч байна'}
          </button>
          <button onClick={() => router.push('/driver/profile')} style={{width:'36px', height:'36px', borderRadius:'50%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.muted, fontSize:'16px', cursor:'pointer'}}>👤</button>
        </div>
      </div>

      <div style={{padding:'16px'}}>
        {/* Байршил */}
        <div style={{background:D.card, border:D.cardBorder, borderRadius:'16px', padding:'16px', marginBottom:'16px'}}>
          <p style={{color:D.text, fontWeight:'700', fontSize:'14px', margin:'0 0 12px'}}>📍 Байршил шинэчлэх</p>
          <button onClick={updateLocation} disabled={locating} style={{width:'100%', borderRadius:'12px', padding:'12px', background: locating ? 'rgba(232,67,58,0.4)' : D.red, border:'none', color:D.text, fontSize:'14px', fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 15px rgba(232,67,58,0.3)'}}>
            {locating ? 'Байршил тогтоож байна...' : 'Одоогийн байршил илгээх'}
          </button>
          {locMsg && <p style={{color:'#22c55e', fontSize:'12px', textAlign:'center', marginTop:'8px'}}>{locMsg}</p>}
          {driver.lat && <p style={{color:D.muted, fontSize:'12px', textAlign:'center', marginTop:'4px'}}>📍 {driver.lat?.toFixed(4)}, {driver.lng?.toFixed(4)}</p>}
        </div>

        {/* Захиалгууд */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
          <p style={{color:D.text, fontWeight:'700', fontSize:'14px', margin:0}}>Захиалгууд <span style={{color:D.red}}>({orders.length})</span></p>
          <button onClick={fetchOrders} style={{background:'transparent', border:'none', color:D.red, fontSize:'13px', cursor:'pointer', fontWeight:'600'}}>↺ Шинэчлэх</button>
        </div>

        {orders.length === 0 ? (
          <div style={{background:D.card, border:D.cardBorder, borderRadius:'16px', padding:'40px 16px', textAlign:'center'}}>
            <div style={{fontSize:'40px', marginBottom:'12px'}}>⏳</div>
            <p style={{color:D.muted, fontSize:'14px', margin:0}}>Одоогоор захиалга байхгүй</p>
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
            {orders.map((o) => {
              const dist = getDistance(driver.lat, driver.lng, o.from_lat, o.from_lng)
              return (
                <div key={o.id} style={{background:D.card, border:D.cardBorder, borderRadius:'16px', padding:'16px'}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
                    <span style={{background:'rgba(232,67,58,0.15)', color:'#ff6b5b', borderRadius:'10px', padding:'4px 10px', fontSize:'11px', fontWeight:'700'}}>🆕 Шинэ</span>
                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                      {dist && <span style={{color:'#3b82f6', fontSize:'12px', fontWeight:'600'}}>📍 {dist} км</span>}
                      <span style={{color:D.muted, fontSize:'12px'}}>{new Date(o.created_at).toLocaleTimeString('mn-MN', {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                  </div>
                  {o.car_type && <p style={{color:'rgba(255,200,0,0.7)', fontSize:'12px', margin:'0 0 10px', fontWeight:'600'}}>
                      🚛 {o.car_type === 'butten' ? 'Бүтэн ачигч' : o.car_type === 'chiregch' ? 'Чирэгч' : o.car_type}
                      {o.car_mark ? ` · ${o.car_mark}` : ''}
                    </p>}
                  <div style={{background:'rgba(255,255,255,0.03)', borderRadius:'12px', padding:'12px', marginBottom:'12px'}}>
                    <div style={{display:'flex', alignItems:'flex-start', gap:'8px', marginBottom:'8px'}}>
                      <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#3b82f6', marginTop:'4px', flexShrink:0}}/>
                      <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px'}}>Авах газар</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'600'}}>{o.from_address || 'GPS байршил'}</p></div>
                    </div>
                    <div style={{display:'flex', alignItems:'flex-start', gap:'8px'}}>
                      <div style={{width:'8px', height:'8px', borderRadius:'50%', background:D.red, marginTop:'4px', flexShrink:0}}/>
                      <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px'}}>Хүргэх газар</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'600'}}>{o.to_address || '-'}</p></div>
                    </div>
                  </div>
                  {sentOffers[o.id] ? (
                    <div style={{background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:'12px', padding:'12px', textAlign:'center'}}>
                      <p style={{color:'#22c55e', fontSize:'14px', fontWeight:'700', margin:0}}>✅ Санал илгээгдлээ!</p>
                    </div>
                  ) : (
                    <div style={{display:'flex', gap:'8px'}}>
                      <input type="number" placeholder="Үнэ оруулна уу (₮)" value={offerPrices[o.id] || ''} onChange={e => setOfferPrices({...offerPrices, [o.id]: e.target.value})}
                        style={{flex:1, borderRadius:'12px', padding:'12px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:D.text, fontSize:'14px', outline:'none'}}/>
                      <button onClick={() => sendOffer(o)} disabled={sendingOffer === o.id}
                        style={{borderRadius:'12px', padding:'12px 16px', background: sendingOffer === o.id ? 'rgba(232,67,58,0.4)' : D.red, border:'none', color:D.text, fontSize:'14px', fontWeight:'700', cursor:'pointer'}}>
                        {sendingOffer === o.id ? '...' : 'Илгээх'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <style>{`
        input::placeholder{color:rgba(255,255,255,0.2);}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}
        @keyframes bounce{from{transform:translateX(-50%) translateY(0)}to{transform:translateX(-50%) translateY(-4px)}}
      `}</style>
    </div>
  )
}
