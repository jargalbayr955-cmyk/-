'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createDotMarker, createTruckMarker, freeMapStyle, loadFreeMap } from '@/lib/client/free-map'

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
  const offerPricesRef = useRef<{[key: string]: string}>({})
  const [sentOffers, setSentOffers] = useState<Record<string, boolean>>({})
  const [sendingOffer, setSendingOffer] = useState<string | null>(null)
  const [newOrderAlert, setNewOrderAlert] = useState(false)
  const [acceptedOrder, setAcceptedOrder] = useState<any>(null)
  const [paymentInfo, setPaymentInfo] = useState<{code:string, amount:number} | null>(null)
  const [completing, setCompleting] = useState(false)
  const [notifStatus, setNotifStatus] = useState<'default'|'granted'|'denied'>('default')
  const [mounted, setMounted] = useState(false)

  const [bankInfo, setBankInfo] = useState({ bank_name: '', bank_account: '' })
  const prevOrderIds = useRef<string[]>([])
  const driverRef = useRef<any>(null)
  const acceptedOrderRef = useRef<any>(null)
  const mapRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)
  const lineRef = useRef<any>(null)
  const router = useRouter()

  // Хаазны дуу тоглуулах
  const playHorn = () => {
    try {
      const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)()
      const playNote = (freq: number, start: number, duration: number, gain: number) => {
        const osc = ctx.createOscillator()
        const gainNode = ctx.createGain()
        osc.connect(gainNode)
        gainNode.connect(ctx.destination)
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
        osc.frequency.exponentialRampToValueAtTime(freq * 0.9, ctx.currentTime + start + duration)
        gainNode.gain.setValueAtTime(0, ctx.currentTime + start)
        gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.05)
        gainNode.gain.linearRampToValueAtTime(gain * 0.8, ctx.currentTime + start + duration - 0.1)
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration)
        osc.start(ctx.currentTime + start)
        osc.stop(ctx.currentTime + start + duration)
      }
      playNote(220, 0, 0.4, 0.6); playNote(260, 0, 0.4, 0.4); playNote(330, 0, 0.4, 0.3)
      playNote(220, 0.5, 0.4, 0.6); playNote(260, 0.5, 0.4, 0.4); playNote(330, 0.5, 0.4, 0.3)
      playNote(220, 1.0, 0.8, 0.7); playNote(260, 1.0, 0.8, 0.5); playNote(330, 1.0, 0.8, 0.4)
    } catch {}
  }

  // Service worker-аас horn message хүлээн авах
  useEffect(() => {
    if (!driver) return
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'PLAY_HORN') playHorn()
      if (e.data?.type === 'NEW_ORDER') window.dispatchEvent(new Event('achilt-new-order'))
    }
    navigator.serviceWorker?.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage)
  }, [driver])

  const subscribeNotification = async () => {
    if (!driver) return
    try {
      const permission = await Notification.requestPermission()
      setNotifStatus(permission as any)
      if (permission === 'granted') {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
        })
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_id: driver.id, subscription: sub.toJSON() })
        })
      }
    } catch(e) { console.log('Push error:', e) }
  }

  const handleLogin = async () => {
    if (!phone || !pin) return setError('Дугаар болон PIN оруулна уу')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/driver/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, pin })
      })
      const body = await res.json()
      if (!res.ok || !body.driver) {
        setError(body.error || 'Дугаар эсвэл PIN буруу байна')
      } else {
        setDriver(body.driver)
        localStorage.setItem('driver_session', JSON.stringify(body.driver))
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          try {
            const permission = await Notification.requestPermission()
            if (permission === 'granted') {
              const reg = await navigator.serviceWorker.register('/sw.js')
              await navigator.serviceWorker.ready
              const existing = await reg.pushManager.getSubscription()
              const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
              if (vapidKey) {
                const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey })
                await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) })
              }
            }
          } catch (e) { console.log('Push subscription failed:', e) }
        }
      }
    } catch {
      setError('Сүлжээний алдаа. Дахин оролдоно уу.')
    }
    setLoading(false)
  }

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/orders', { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      const data = Array.isArray(body.orders) ? body.orders : []
      if (body.active === false) {
        setDriver(null); localStorage.removeItem('driver_session'); localStorage.removeItem('accepted_order'); localStorage.removeItem('payment_info'); return
      }
      if (body.acceptedOrder) {
        setAcceptedOrder(body.acceptedOrder)
        localStorage.setItem('accepted_order', JSON.stringify(body.acceptedOrder))
      } else if (body.available === true) {
        setAcceptedOrder(null); setPaymentInfo(null); localStorage.removeItem('accepted_order'); localStorage.removeItem('payment_info')
      }
      if (driverRef.current && typeof body.available === 'boolean') {
        setDriver((d:any) => d ? ({...d, available: body.available}) : d)
      }
      const newIds = data.map((o: any) => o.id)
      const hasNew = newIds.some((id: string) => !prevOrderIds.current.includes(id))
      const hasRemoved = prevOrderIds.current.some((id: string) => !newIds.includes(id))
      if (hasNew && prevOrderIds.current.length > 0) {
        setNewOrderAlert(true)
        setTimeout(() => setNewOrderAlert(false), 3000)
        playHorn()
      }
      if (hasNew || hasRemoved || prevOrderIds.current.length === 0) {
        prevOrderIds.current = newIds
        setOrders(data)
      }
    } catch {}
  }, [])

  const updateLocation = () => {
    if (!driver) return
    setLocating(true)
    setLocMsg('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await fetch('/api/driver/location', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, available: true })
        })
        if (!res.ok) { setLocMsg('Байршил хадгалахад алдаа гарлаа'); setLocating(false); return }
        setDriver({ ...driver, lat: pos.coords.latitude, lng: pos.coords.longitude, available: true })
        setLocMsg('Байршил шинэчлэгдлээ!')
        setLocating(false)
      },
      () => { setLocMsg('Байршил тогтоох боломжгүй'); setLocating(false) }
    )
  }

  // driverRef-г driver state-тай sync хийх
  useEffect(() => {
    driverRef.current = driver
  }, [driver])

  useEffect(() => {
    acceptedOrderRef.current = acceptedOrder
  }, [acceptedOrder])


  useEffect(() => {
    if (!driver?.id) return
    fetch('/api/driver/payment-settings', { cache: 'no-store' })
      .then(async r => r.ok ? r.json() : null)
      .then(body => { if (body) setBankInfo({ bank_name: body.bank_name || '', bank_account: body.bank_account || '' }) })
      .catch(() => {})
  }, [driver?.id])

  // Mounted + session сэргээх
  useEffect(() => {
    setMounted(true)
    const restore = async () => {
      try {
        const res = await fetch('/api/driver/session', { cache: 'no-store' })
        if (res.ok) {
          const body = await res.json()
          setDriver(body.driver)
          localStorage.setItem('driver_session', JSON.stringify(body.driver))
          const saved = localStorage.getItem('accepted_order')
          if (saved) setAcceptedOrder(JSON.parse(saved))
          const pInfo = localStorage.getItem('payment_info')
          if (pInfo) setPaymentInfo(JSON.parse(pInfo))
        } else {
          localStorage.removeItem('driver_session')
          localStorage.removeItem('accepted_order')
          localStorage.removeItem('payment_info')
        }
      } catch {}
      if ('Notification' in window) {
        setNotifStatus(Notification.permission as any)
      }
    }
    restore()
  }, [])

  // Browser буцах товч блоклох
  useEffect(() => {
    const handlePopState = () => {
      // Буцах товч дарахад driver хуудас дээр л үлдэх
      window.history.pushState(null, '', '/driver')
    }
    window.history.pushState(null, '', '/driver')
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!driver?.id || !navigator.geolocation) return
    let lastSentAt = 0
    let lastLat = Number(driverRef.current?.lat) || 0
    let lastLng = Number(driverRef.current?.lng) || 0
    const distanceMeters = (aLat:number,aLng:number,bLat:number,bLng:number) => {
      const R = 6371000, p1=aLat*Math.PI/180, p2=bLat*Math.PI/180
      const dp=(bLat-aLat)*Math.PI/180, dl=(bLng-aLng)*Math.PI/180
      const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2
      return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
    }
    const watchId = navigator.geolocation.watchPosition(async pos => {
      const now = Date.now(), lat = pos.coords.latitude, lng = pos.coords.longitude
      const moved = lastLat && lastLng ? distanceMeters(lastLat,lastLng,lat,lng) : 999
      if (now - lastSentAt < 15000 && moved < 20) return
      lastSentAt = now; lastLat = lat; lastLng = lng
      driverRef.current = { ...driverRef.current, lat, lng }
      if (driverMarkerRef.current) driverMarkerRef.current.setLngLat([lng, lat])
      const activeOrder = acceptedOrderRef.current
      const routeSource = mapInstanceRef.current?.getSource?.('accepted-route')
      if (routeSource?.setData && activeOrder?.from_lat && activeOrder?.from_lng) routeSource.setData({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[lng,lat],[Number(activeOrder.from_lng),Number(activeOrder.from_lat)]]}})
      await fetch('/api/driver/location', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ lat, lng }) }).catch(()=>{})
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [driver?.id])

  useEffect(() => {
    if (!acceptedOrder?.id || !mapRef.current || mapInstanceRef.current) return
    const order=acceptedOrderRef.current
    if(!order)return
    let cancelled=false
    const timer=setTimeout(()=>{
      ;(async()=>{
        try{
          const ml=await loadFreeMap()
          if(cancelled||!mapRef.current)return
          const userLat=Number(order.from_lat),userLng=Number(order.from_lng)
          const drvLat=Number(driverRef.current?.lat)||userLat,drvLng=Number(driverRef.current?.lng)||userLng
          const map=new ml.Map({container:mapRef.current,style:freeMapStyle(),center:[userLng||106.9177,userLat||47.9184],zoom:13,attributionControl:{}})
          map.addControl(new ml.NavigationControl({showCompass:false}),'top-right')
          userMarkerRef.current=new ml.Marker({element:createDotMarker('#2563eb',18,'Хэрэглэгч')}).setLngLat([userLng,userLat]).addTo(map)
          driverMarkerRef.current=new ml.Marker({element:createTruckMarker('Та')}).setLngLat([drvLng,drvLat]).addTo(map)
          const routeData={type:'Feature' as const,properties:{},geometry:{type:'LineString' as const,coordinates:[[drvLng,drvLat],[userLng,userLat]]}}
          map.on('load',()=>{
            if(!map.getSource('accepted-route')){
              map.addSource('accepted-route',{type:'geojson',data:routeData})
              map.addLayer({id:'accepted-route-line',type:'line',source:'accepted-route',paint:{'line-color':'#e8433a','line-width':4,'line-opacity':.9,'line-dasharray':[2,2]}})
            }
          })
          const bounds=new ml.LngLatBounds();bounds.extend([drvLng,drvLat]);bounds.extend([userLng,userLat]);map.fitBounds(bounds,{padding:60,maxZoom:16,duration:400})
          mapInstanceRef.current=map
          lineRef.current='accepted-route'
        }catch(error){console.error('Map initialization failed',error)}
      })()
    },250)
    return()=>{cancelled=true;clearTimeout(timer);driverMarkerRef.current?.remove?.();userMarkerRef.current?.remove?.();mapInstanceRef.current?.remove?.();mapInstanceRef.current=null;driverMarkerRef.current=null;userMarkerRef.current=null;lineRef.current=null}
  }, [acceptedOrder?.id])

  useEffect(() => {
    if (!acceptedOrder && mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
      driverMarkerRef.current?.remove?.()
      userMarkerRef.current?.remove?.()
      driverMarkerRef.current = null
      userMarkerRef.current = null
      lineRef.current = null
    }
  }, [acceptedOrder])

  const toggleAvailable = async () => {
    const newVal = !driver.available
    const res = await fetch('/api/driver/availability', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ available: newVal }) })
    if (res.ok) setDriver({ ...driver, available: newVal })
    else alert('Төлөв өөрчлөхөд алдаа гарлаа')
  }

  const sendOffer = async (order: any) => {
    const price = offerPricesRef.current[order.id]
    if (!price) return alert('Үнэ оруулна уу')
    setSendingOffer(order.id)
    const getPos = (): Promise<{lat: number, lng: number} | null> => new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition((pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => resolve(null), { timeout: 5000 })
    })
    const pos = await getPos()
    const res = await fetch('/api/driver/offer', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ order_id: order.id, price: parseInt(price), driver_lat: pos?.lat, driver_lng: pos?.lng })
    })
    if (!res.ok) { const body = await res.json().catch(()=>({})); alert(body.error || 'Санал илгээхэд алдаа гарлаа'); setSendingOffer(null); return }
    if (pos) setDriver({ ...driver, lat: pos.lat, lng: pos.lng })
    setSentOffers(prev => ({ ...prev, [order.id]: true }))
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
    if (!driver?.id) return
    fetchOrders()
    // Push handles immediate delivery. This is only a low-frequency fallback if push is unavailable.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOrders()
    }, 15_000)
    const onPushRefresh = () => fetchOrders()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchOrders() }
    window.addEventListener('achilt-new-order', onPushRefresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      window.removeEventListener('achilt-new-order', onPushRefresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [driver?.id, fetchOrders])


  // Mounted болохоос өмнө хоосон screen
  if (!mounted) {
    return <div style={{minHeight:'100vh', background:'#060608'}}/>
  }

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
          <input type="password" placeholder="PIN код (4-8 орон)" maxLength={8} inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
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

  // ACCEPTED ORDER MAP эсвэл PAYMENT SCREEN
  if (acceptedOrder || paymentInfo) {
    const safeOrder = acceptedOrder || {}
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
              <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px', fontWeight:'600'}}>АВАХ ГАЗАР</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'500'}}>{(safeOrder as any).from_address || '-'}</p></div>
            </div>
            <div style={{display:'flex', alignItems:'flex-start', gap:'10px'}}>
              <div style={{width:'8px', height:'8px', borderRadius:'50%', background:D.red, marginTop:'4px', flexShrink:0}}/>
              <div><p style={{color:D.muted, fontSize:'11px', margin:'0 0 2px', fontWeight:'600'}}>ХҮРГЭХ ГАЗАР</p><p style={{color:D.text, fontSize:'13px', margin:0, fontWeight:'500'}}>{(safeOrder as any).to_address || '-'}</p></div>
            </div>
          </div>
          {paymentInfo ? (
            <div style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'16px', padding:'16px'}}>
              <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', margin:'0 0 12px', textAlign:'center'}}>Төлбөрийн мэдээлэл</p>
              <div style={{background:'rgba(232,67,58,0.1)', border:'1px solid rgba(232,67,58,0.3)', borderRadius:'12px', padding:'14px', marginBottom:'12px', textAlign:'center'}}>
                <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', margin:'0 0 4px'}}>Шилжүүлэх данс</p>
                <p style={{color:'white', fontWeight:'800', fontSize:'18px', margin:'0 0 2px'}}>{bankInfo.bank_name || 'Банк тохируулаагүй'}</p>
                <p style={{color:'#ff6b5b', fontWeight:'800', fontSize:'20px', margin:'0 0 8px', letterSpacing:'2px'}}>{bankInfo.bank_account || 'Админаас данс тохируулна уу'}</p>
                <div style={{borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:'10px'}}>
                  <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', margin:'0 0 4px'}}>Гүйлгээний утга</p>
                  <p style={{color:'#ffd700', fontWeight:'900', fontSize:'28px', margin:'0 0 4px', letterSpacing:'4px'}}>{paymentInfo.code}</p>
                  <p style={{color:'rgba(255,255,255,0.4)', fontSize:'11px', margin:0}}>Яг энэ 6 оронтой кодыг гүйлгээний утгад бичнэ үү</p>
                </div>
              </div>
              <p style={{color:'rgba(255,255,255,0.5)', fontSize:'12px', textAlign:'center', margin:'0 0 12px'}}>
                Мөнгө шилжүүлсний дараа автоматаар нээгдэнэ
              </p>

            </div>
          ) : (
            <button onClick={async () => {
              setCompleting(true)
              try {
                const res = await fetch('/api/payment/complete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ order_id: acceptedOrder?.id })
                })
                const data = await res.json()
                if (data.code) {
                  const pInfo = { code: data.code, amount: data.amount }
                  setPaymentInfo(pInfo)
                  localStorage.setItem('payment_info', JSON.stringify(pInfo))
                  // Server transaction marks the order completed and driver unavailable atomically.
                  setDriver({ ...driver, available: false })
                }
              } catch {}
              setCompleting(false)
            }} disabled={completing} style={{width:'100%', borderRadius:'14px', padding:'13px', background: completing ? 'rgba(232,67,58,0.4)' : D.red, border:'none', color:D.text, fontSize:'14px', fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 15px rgba(232,67,58,0.3)'}}>
              {completing ? 'Боловсруулж байна...' : 'Захиалга дуусгах'}
            </button>
          )}
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
          <button onClick={subscribeNotification} style={{
            borderRadius:'20px', padding:'6px 12px', fontSize:'12px', fontWeight:'700', cursor:'pointer',
            background: notifStatus === 'granted' ? 'rgba(34,197,94,0.12)' : 'rgba(232,67,58,0.12)',
            border: notifStatus === 'granted' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(232,67,58,0.3)',
            color: notifStatus === 'granted' ? '#22c55e' : '#ff6b5b'
          }}>
            {notifStatus === 'granted' ? '🔔 Асаалттай' : '🔕 Мэдэгдэл авах'}
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
                  {o.has_offered || sentOffers[o.id] ? (
                    <div style={{background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:'12px', padding:'12px', textAlign:'center'}}>
                      <p style={{color:'#22c55e', fontSize:'14px', fontWeight:'700', margin:0}}>✅ Санал илгээгдлээ!</p>
                    </div>
                  ) : (
                    <div style={{display:'flex', gap:'8px'}}>
                      <input type="number" placeholder="Үнэ оруулна уу (₮)" defaultValue={''} onChange={e => {
                          offerPricesRef.current[o.id] = e.target.value
                        }}
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
